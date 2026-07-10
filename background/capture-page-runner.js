import { clampInteger } from '../utils/number.js';
import { getReportColumns } from '../utils/report-fields.js';
import { buildDownloadPath, buildFilename, buildFolderPath, csvEscape } from '../utils/helpers.js';
import { createXlsxReportDataUrl } from '../utils/xlsx.js';
import { createReportRow, runCaptureJobs } from './capture-flow.js';
import { createUrlJobs, createExplicitJobs, createSearchJobs, createTabJobs } from './job-factory.js';
import { captureTabToDownload, downloadReport } from './report-download.js';
import { runCaptureJobList } from './search-runner.js';
import { getActiveCapturableTab, getTargetWindowId, isCapturableTab, activateTab, sendTabMessage, waitForTabComplete, waitForTabReadyForCapture } from './tab-utils.js';
import { ensureOffscreenDocument, closeOffscreenDocument } from './offscreen-manager.js';
import { statusError, statusFromError, SequentialCaptureError } from './status-error.js';

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

function getCaptureDeps(batchStatus, overrides = {}) {
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
    waitForTabReadyForCapture,
    ...overrides
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

  const tab = await getActiveCapturableTab(chrome);
  if (!tab?.id || !tab.url) {
    throw statusError('noActivePageError');
  }

  const jobs = createTabJobs([tab], { closeAfterCapture: false })
    .map((job) => ({ ...job, applyDelay: false, waitForLoad: false }));
  batchStatus.start('currentTabRunningStatus', jobs.length);

  const captureDeps = getCaptureDeps(batchStatus, deps);

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

  const windowId = await getTargetWindowId(chrome);
  const currentWindowTabs = await chrome.tabs.query({ windowId });
  const tabs = currentWindowTabs.filter(isCapturableTab);
  if (!tabs.length) {
    throw statusError('noCapturableTabsError');
  }

  const originalTab = currentWindowTabs.find((tab) => tab.active);
  const preparedContexts = deps.getPreparedTabContextsForTabs
    ? await deps.getPreparedTabContextsForTabs(tabs)
    : { urlContexts: [], matchedTabIds: [] };
  const jobs = createTabJobs(tabs, {
    closeAfterCapture: false,
    urlContexts: preparedContexts.urlContexts
  });
  let rows = [];
  batchStatus.start('currentWindowTabsRunningStatus', jobs.length);

  const captureDeps = getCaptureDeps(batchStatus, deps);

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
    if (deps.clearPreparedTabContextsForTabIds) {
      await deps.clearPreparedTabContextsForTabIds(preparedContexts.matchedTabIds).catch(() => {});
    }
    if (originalTab?.id) {
      await activateTab(originalTab).catch(() => {});
    }
    await closeOffscreenDocument().catch(() => {});
    batchStatus.reset();
  }
}

export async function runBatch(options, deps) {
  const {
    batchStatus,
    startCaptureTaskHistory,
    updateCaptureTaskHistory,
    finishCaptureTaskHistory,
    saveCaptureTaskHistory
  } = deps;
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

  batchStatus.start('runningStatus', jobs.length);

  const captureDeps = getCaptureDeps(batchStatus, deps);

  let rows = [];
  let taskHistoryId = '';

  try {
    if (startCaptureTaskHistory) {
      const task = await startCaptureTaskHistory({ options, jobs }).catch(() => null);
      taskHistoryId = task?.id || '';
    }

    await ensureOffscreenDocument();
    rows = await runCaptureJobList(jobs, options, {
      ...captureDeps,
      onJobComplete: (row) => (
        taskHistoryId && updateCaptureTaskHistory
          ? updateCaptureTaskHistory(taskHistoryId, row).catch(() => {})
          : Promise.resolve()
      )
    });

    if (options.reportEnabled) {
      await downloadReport(rows, options, getReportDeps());
    }
    batchStatus.finish(rows, options.reportEnabled);
  } catch (error) {
    setStatus(statusFromError(error), false, false);
  } finally {
    if (taskHistoryId && finishCaptureTaskHistory) {
      await finishCaptureTaskHistory(taskHistoryId, {
        rows,
        stopped: getBatchState().stopping
      }).catch(() => {});
    } else if (rows.length && saveCaptureTaskHistory) {
      await saveCaptureTaskHistory({ options, jobs, rows }).catch(() => {});
    }
    await closeOffscreenDocument().catch(() => {});
    batchStatus.reset();
  }
}

async function waitForPageSignatureChange(tabId, oldSignature, options, deps) {
  const maxWait = deps.maxWait !== undefined ? deps.maxWait : 15000;
  const pollInterval = deps.pollInterval !== undefined ? deps.pollInterval : 250;
  let elapsed = 0;

  while (elapsed < maxWait) {
    if (deps.getBatchState().stopping) {
      throw deps.statusError('captureStoppedError');
    }
    await deps.waitWhilePaused();

    const response = await deps.sendTabMessage(tabId, { action: 'getPageSignature' }).catch(() => null);
    if (response && response.signature !== oldSignature) {
      return;
    }

    await new Promise((resolve) => setTimeout(resolve, pollInterval));
    elapsed += pollInterval;
  }

  throw deps.statusError('nextPageWaitTimeoutError');
}

async function clickNextPageAndWait(tabId, selector, options, deps) {
  const before = await deps.sendTabMessage(tabId, { action: 'getPageSignature' });
  if (!before) {
    throw deps.statusError('nextPageSelectorError');
  }

  const clicked = await deps.sendTabMessage(tabId, {
    action: 'clickNextPage',
    payload: { selector }
  });

  if (!clicked?.ok) {
    throw deps.statusError(clicked?.statusKey || 'nextPageClickError');
  }

  await waitForPageSignatureChange(tabId, before.signature, options, deps);
  await deps.sleepWithControls(Math.max(0, Number(options.delay) || 0) * 1000);
}

export async function captureCurrentTabSequence(options, deps) {
  const { batchStatus } = deps;
  const setStatus = (...args) => batchStatus.setStatus(...args);
  const getBatchState = () => batchStatus.getState();

  if (getBatchState().running) {
    throw statusError('batchAlreadyRunningError');
  }

  const tab = await getActiveCapturableTab(chrome);
  if (!tab?.id || !tab.url) {
    throw statusError('noActivePageError');
  }

  const count = clampInteger(options.sequentialCaptureCount, 3, 1, 200);
  let nextSelector = String(options.sequentialNextSelector || '').trim();
  const startUrl = String(options.sequentialStartUrl || '').trim();

  batchStatus.start('sequentialRunningStatus', count);
  const captureDeps = getCaptureDeps(batchStatus, deps);

  const rows = [];
  try {
    if (startUrl && startUrl !== tab.url) {
      await chrome.tabs.update(tab.id, { url: startUrl });
      await waitForTabComplete(tab.id);
      await sleepWithControls(1000, getBatchState);
      const updatedTab = await chrome.tabs.get(tab.id);
      tab.url = updatedTab.url || startUrl;
    }

    await ensureOffscreenDocument();

    if (!nextSelector && count > 1) {
      const detected = await deps.sendTabMessage(tab.id, { action: 'detectNextPage' }).catch(() => null);
      if (detected?.ok) {
        nextSelector = detected.selector;
      }
    }

    for (let index = 0; index < count; index += 1) {
      if (getBatchState().stopping) {
        throw statusError('captureStoppedError');
      }

      await waitWhilePaused(getBatchState);
      batchStatus.updateProgress(index, count, tab.url);

      try {
        const result = await captureTabToDownload(tab, index, count, options, {
          sequenceIndex: index + 1
        }, captureDeps);

        const row = createReportRow({
          index,
          url: result.url,
          title: result.title,
          filename: result.filename,
          status: 'ok'
        });
        rows.push(row);
        if (batchStatus.addLog) {
          batchStatus.addLog(row.url, row.status, row.error, row.title);
        }

        if (index === count - 1) {
          break;
        }

        if (!nextSelector) {
          throw statusError('nextPageNotFoundError');
        }

        await clickNextPageAndWait(tab.id, nextSelector, options, captureDeps);
      } catch (error) {
        const latestTab = tab.id ? await chrome.tabs.get(tab.id).catch(() => null) : null;
        const errUrl = latestTab?.url || tab.url;
        const errTitle = latestTab?.title || '';
        const status = statusFromError(error);
        if (batchStatus.addLog) {
          batchStatus.addLog(errUrl, 'error', status.statusKey, errTitle);
        }
        throw error;
      }
    }

    if (options.reportEnabled) {
      await downloadReport(rows, options, getReportDeps());
    }

    const successful = rows.filter((row) => row.status === 'ok').length;
    const failed = rows.length - successful;
    batchStatus.setStatus({
      statusKey: options.reportEnabled ? 'sequentialDoneWithReportStatus' : 'sequentialDoneStatus',
      statusArgs: [String(successful), String(failed)]
    }, false, false);

    return rows.length;
  } catch (error) {
    if (rows.length > 0 && options.reportEnabled) {
      await downloadReport(rows, options, getReportDeps()).catch(() => {});
    }
    const successful = rows.filter((row) => row.status === 'ok').length;
    const failed = count - successful;
    const statusKey = error.statusKey || 'unknownCaptureError';
    throw new SequentialCaptureError(statusKey, successful, failed, error);
  } finally {
    await closeOffscreenDocument().catch(() => {});
    batchStatus.reset();
  }
}

export async function openCurrentTabSequence(options, deps) {
  const { batchStatus } = deps;
  const getBatchState = () => batchStatus.getState();

  if (getBatchState().running) {
    throw statusError('batchAlreadyRunningError');
  }

  const tab = await getActiveCapturableTab(chrome);
  if (!tab?.id || !tab.url) {
    throw statusError('noActivePageError');
  }

  const count = clampInteger(options.sequentialCaptureCount, 3, 1, 200);
  let nextSelector = String(options.sequentialNextSelector || '').trim();
  const startUrl = String(options.sequentialStartUrl || '').trim();
  const sequenceDeps = getCaptureDeps(batchStatus, deps);

  batchStatus.start('sequentialOpenRunningStatus', count);

  try {
    if (startUrl && startUrl !== tab.url) {
      await chrome.tabs.update(tab.id, { url: startUrl });
      await waitForTabComplete(tab.id);
      await sleepWithControls(1000, getBatchState);
      const updatedTab = await chrome.tabs.get(tab.id);
      tab.url = updatedTab.url || startUrl;
    }

    if (!nextSelector && count > 1) {
      const detected = await sequenceDeps.sendTabMessage(tab.id, { action: 'detectNextPage' }).catch(() => null);
      if (detected?.ok) {
        nextSelector = detected.selector;
      }
    }

    for (let index = 0; index < count; index += 1) {
      if (getBatchState().stopping) {
        throw statusError('captureStoppedError');
      }

      await waitWhilePaused(getBatchState);

      try {
        const currentTab = await chrome.tabs.get(tab.id).catch(() => tab);
        tab.url = currentTab.url || tab.url;
        batchStatus.updateProgress(index, count, tab.url);

        if (batchStatus.addLog) {
          batchStatus.addLog(tab.url, 'ok', '', currentTab.title || '');
        }

        if (index === count - 1) {
          break;
        }

        if (!nextSelector) {
          throw statusError('nextPageNotFoundError');
        }

        await clickNextPageAndWait(tab.id, nextSelector, options, sequenceDeps);
      } catch (error) {
        const latestTab = tab.id ? await chrome.tabs.get(tab.id).catch(() => null) : null;
        const errUrl = latestTab?.url || tab.url;
        const errTitle = latestTab?.title || '';
        const status = statusFromError(error);
        if (batchStatus.addLog) {
          batchStatus.addLog(errUrl, 'error', status.statusKey, errTitle);
        }
        throw error;
      }
    }

    batchStatus.setStatus({
      statusKey: 'sequentialOpenDoneStatus',
      statusArgs: [String(count)]
    }, false, false);

    return count;
  } catch (error) {
    batchStatus.setStatus(statusFromError(error, 'unknownCaptureError'), false, false);
    throw error;
  } finally {
    batchStatus.reset();
  }
}
