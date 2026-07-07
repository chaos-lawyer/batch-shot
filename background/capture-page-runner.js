import { clampInteger } from '../utils/number.js';
import { getReportColumns } from '../utils/report-fields.js';
import { buildDownloadPath, buildFilename, buildFolderPath, csvEscape } from '../utils/helpers.js';
import { createXlsxReportDataUrl } from '../utils/xlsx.js';
import { createReportRow, runCaptureJobs } from './capture-flow.js';
import { createUrlJobs, createExplicitJobs, createSearchJobs, createTabJobs } from './job-factory.js';
import { captureTabToDownload, downloadReport } from './report-download.js';
import { runCaptureJobList } from './search-runner.js';
import { isCapturableTab, activateTab, sendTabMessage, waitForTabComplete, waitForTabReadyForCapture } from './tab-utils.js';
import { ensureOffscreenDocument, closeOffscreenDocument } from './offscreen-manager.js';
import { statusError, statusFromError } from './status-error.js';

let lastCaptureAt = 0;
const MIN_CAPTURE_INTERVAL_MS = 700;
const CAPTURE_SETTLE_MS = 250;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitWhilePaused(getBatchState) {
  while (getBatchState().paused && !getBatchState().stopping) {
    await sleep(250);
  }
}

async function sleepWithControls(ms, getBatchState) {
  let remaining = Math.max(0, ms);
  while (remaining > 0) {
    if (getBatchState().stopping) {
      return;
    }
    await waitWhilePaused(getBatchState);
    const step = Math.min(250, remaining);
    await sleep(step);
    remaining -= step;
  }
}

async function captureVisibleTab(tab, options = { format: 'png' }) {
  const elapsed = Date.now() - lastCaptureAt;
  if (elapsed < MIN_CAPTURE_INTERVAL_MS) {
    await sleep(MIN_CAPTURE_INTERVAL_MS - elapsed);
  }
  lastCaptureAt = Date.now();
  return chrome.tabs.captureVisibleTab(tab.windowId, options);
}

function getCaptureQuality(options) {
  return clampInteger(options.screenshotQuality, 92, 1, 100);
}

export async function captureViewport(tab, options, deps) {
  const prep = await sendTabMessage(tab.id, {
    action: 'prepare',
    payload: { hideFixedElements: false }
  }).catch(() => null);

  try {
    if (options.metadataEnabled || options.format === 'pdf') {
      const dataUrl = await captureVisibleTab(tab, { format: 'png' });
      const [injection] = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: () => ({
          scrollHeight: window.innerHeight,
          scrollWidth: window.innerWidth,
          viewportHeight: window.innerHeight,
          viewportWidth: window.innerWidth,
          devicePixelRatio: window.devicePixelRatio || 1
        })
      });
      const stitchResponse = await chrome.runtime.sendMessage({
        action: 'stitch',
        segments: [{ dataUrl, actualScrollX: 0, actualScrollY: 0, isLastFrame: true }],
        metrics: injection.result,
        options
      });

      if (!stitchResponse?.ok) {
        throw statusError('stitchError', [stitchResponse?.error || '']);
      }

      return stitchResponse.dataUrl;
    }

    const format = options.format === 'jpg' ? 'jpeg' : options.format;
    const captureOptions = { format };

    if (format === 'jpeg') {
      captureOptions.quality = getCaptureQuality(options);
    }

    return captureVisibleTab(tab, captureOptions);
  } finally {
    if (prep?.ok) {
      await sendTabMessage(tab.id, { action: 'cleanup' }).catch(() => {});
    }
  }
}

export function createScrollPositions(totalSize, viewportSize) {
  const total = Math.max(0, Number(totalSize) || 0);
  const viewport = Math.max(1, Number(viewportSize) || 1);
  const frameCount = Math.max(1, Math.ceil(total / viewport));
  const maxScroll = Math.max(0, total - viewport);
  const positions = [];

  for (let frame = 0; frame < frameCount; frame += 1) {
    const position = Math.min(frame * viewport, maxScroll);
    if (!positions.includes(position)) {
      positions.push(position);
    }
  }

  return positions;
}

export async function captureFullPage(tab, options, deps) {
  const { getBatchState } = deps;
  const prep = await sendTabMessage(tab.id, { action: 'prepare' });
  if (!prep?.ok) {
    throw statusError('capturePrepareError');
  }

  let metrics = prep.metrics;

  // Safety check: if scrollHeight ≈ viewportHeight, overflow:hidden may have
  // clamped the reported height.  Do a second-pass deep DOM walk to detect the
  // real content bottom.
  if (metrics.scrollHeight <= metrics.viewportHeight) {
    try {
      const [injection] = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: () => {
          const body = document.body;
          if (!body) return null;
          let maxBottom = 0;
          body.querySelectorAll('*').forEach((el) => {
            if (!el.getBoundingClientRect) return;
            const rect = el.getBoundingClientRect();
            const bottom = rect.bottom + window.scrollY;
            if (bottom > maxBottom) maxBottom = bottom;
          });
          return Math.ceil(maxBottom);
        }
      });
      if (injection?.result && injection.result > metrics.scrollHeight) {
        metrics = { ...metrics, scrollHeight: injection.result };
      }
    } catch (_error) {
      // Injection failure should not break the existing flow
    }
  }

  const scrollXs = createScrollPositions(metrics.scrollWidth || metrics.viewportWidth, metrics.viewportWidth);
  const scrollYs = createScrollPositions(metrics.scrollHeight, metrics.viewportHeight);
  const segments = [];

  for (let column = 0; column < scrollXs.length; column += 1) {
    for (let row = 0; row < scrollYs.length; row += 1) {
      if (getBatchState().stopping) {
        throw statusError('captureStoppedError');
      }

      await waitWhilePaused(getBatchState);

      const requestedX = scrollXs[column];
      const requestedY = scrollYs[row];
      const scrollResponse = await sendTabMessage(tab.id, { action: 'scrollTo', x: requestedX, y: requestedY });
      await sleepWithControls(CAPTURE_SETTLE_MS, getBatchState);

      const dataUrl = await captureVisibleTab(tab, { format: 'png' });
      segments.push({
        dataUrl,
        requestedX,
        requestedY,
        actualScrollX: scrollResponse.actualScrollX || 0,
        actualScrollY: scrollResponse.actualScrollY,
        isLastColumn: column === scrollXs.length - 1,
        isLastRow: row === scrollYs.length - 1,
        isLastFrame: column === scrollXs.length - 1 && row === scrollYs.length - 1
      });
    }
  }

  const stitchResponse = await chrome.runtime.sendMessage({
    action: 'stitch',
    segments,
    metrics,
    options
  });

  if (!stitchResponse?.ok) {
    throw statusError('stitchError', [stitchResponse?.error || '']);
  }

  return stitchResponse.dataUrl;
}

function getCaptureDeps(batchStatus) {
  const getBatchState = () => batchStatus.getState();
  const selfDeps = {
    chrome,
    batchStatus,
    waitForTabComplete,
    sleepWithControls: (ms) => sleepWithControls(ms, getBatchState),
    captureTabToDownload: (tab, index, total, options, urlContext) => captureTabToDownload(tab, index, total, options, urlContext, selfDeps),
    createReportRow,
    statusFromError,
    statusError,
    runCaptureJobs,
    getBatchState,
    waitWhilePaused: () => waitWhilePaused(getBatchState),
    activateTab,
    captureViewport: (tab, options) => captureViewport(tab, options, selfDeps),
    captureFullPage: (tab, options) => captureFullPage(tab, options, selfDeps),
    buildFilename,
    sendTabMessage,
    waitForTabReadyForCapture
  };
  return selfDeps;
}

function getReportDeps() {
  return {
    chrome,
    getReportColumns,
    buildFolderPath,
    buildDownloadPath,
    createXlsxReportDataUrl,
    csvEscape
  };
}

export async function captureCurrentTab(options, deps) {
  const { batchStatus } = deps;
  const setStatus = (...args) => batchStatus.setStatus(...args);
  const getBatchState = () => batchStatus.getState();

  if (getBatchState().running) {
    throw statusError('batchAlreadyRunningError');
  }

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id || !tab.url) {
    throw statusError('noActivePageError');
  }

  const jobs = createTabJobs([tab], { closeAfterCapture: false })
    .map((job) => ({ ...job, applyDelay: false, waitForLoad: false }));
  batchStatus.start('currentTabRunningStatus');

  const captureDeps = getCaptureDeps(batchStatus);

  try {
    await ensureOffscreenDocument();
    const rows = await runCaptureJobList(jobs, options, captureDeps);
    const failed = rows.find((row) => row.status === 'error');
    if (failed) {
      throw statusError(failed.error || 'unknownCaptureError');
    }
    setStatus({ statusKey: 'currentTabDoneStatus' }, false, false);
  } finally {
    await closeOffscreenDocument().catch(() => {});
    batchStatus.reset();
  }
}

export async function captureCurrentWindowTabs(options, deps) {
  const { batchStatus } = deps;
  const getBatchState = () => batchStatus.getState();

  if (getBatchState().running) {
    throw statusError('batchAlreadyRunningError');
  }

  const currentWindowTabs = await chrome.tabs.query({ currentWindow: true });
  const tabs = currentWindowTabs.filter(isCapturableTab);
  if (!tabs.length) {
    throw statusError('noCapturableTabsError');
  }

  const originalTab = currentWindowTabs.find((tab) => tab.active);
  const jobs = createTabJobs(tabs, { closeAfterCapture: false });
  let rows = [];
  batchStatus.start('currentWindowTabsRunningStatus');

  const captureDeps = getCaptureDeps(batchStatus);

  try {
    await ensureOffscreenDocument();
    rows = await runCaptureJobList(jobs, options, captureDeps);

    if (options.reportEnabled) {
      await downloadReport(rows, options, getReportDeps());
    }

    const successful = rows.filter((row) => row.status === 'ok').length;
    batchStatus.finish(rows, options.reportEnabled);
    return successful;
  } finally {
    if (originalTab?.id) {
      await activateTab(originalTab).catch(() => {});
    }
    await closeOffscreenDocument().catch(() => {});
    batchStatus.reset();
  }
}

export async function runBatch(options, deps) {
  const { batchStatus } = deps;
  const setStatus = (...args) => batchStatus.setStatus(...args);
  const getBatchState = () => batchStatus.getState();

  let jobs = [];
  if (Array.isArray(options.jobs) && options.jobs.length) {
    jobs = createExplicitJobs(options, { statusError });
  } else if (options.urlInputMode === 'searchBox') {
    jobs = createSearchJobs(options, { statusError }).map((job) => ({
      ...job,
      searchResultDelay: options.searchResultDelay ?? options.delay
    }));
  } else {
    jobs = createUrlJobs(options.urls, options);
  }

  batchStatus.start('runningStatus');

  const captureDeps = getCaptureDeps(batchStatus);

  try {
    await ensureOffscreenDocument();
    const rows = await runCaptureJobList(jobs, options, captureDeps);

    if (options.reportEnabled) {
      await downloadReport(rows, options, getReportDeps());
    }
    batchStatus.finish(rows, options.reportEnabled);
  } catch (error) {
    setStatus(statusFromError(error), false, false);
  } finally {
    await closeOffscreenDocument().catch(() => {});
    batchStatus.reset();
  }
}
