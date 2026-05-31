import { buildDownloadPath, buildFilename, buildFolderPath, csvEscape, normalizeUrl } from '../utils/helpers.js';
import { clampInteger } from '../utils/number.js';
import { getReportColumns } from '../utils/report-fields.js';
import { loadSettings } from '../utils/settings.js';
import { createXlsxReportDataUrl } from '../utils/xlsx.js';
import { createBatchStatusState, createReportRow, runCaptureJobs } from './capture-flow.js';

const OFFSCREEN_URL = 'offscreen/offscreen.html';
const CAPTURE_SETTLE_MS = 250;
const MIN_CAPTURE_INTERVAL_MS = 700;
const ACTION_POPUP_URL = 'popup/popup.html';
const ACTION_MENU_OPEN_POPUP = 'open-popup';

let lastCaptureAt = 0;

const batchStatus = createBatchStatusState((state) => {
  chrome.runtime.sendMessage({ action: 'batchStatus', ...state }).catch(() => {});
});

const getBatchState = () => batchStatus.getState();

const CAPTURABLE_PROTOCOLS = new Set(['http:', 'https:', 'file:']);

class StatusError extends Error {
  constructor(statusKey, statusArgs = []) {
    super(statusKey);
    this.statusKey = statusKey;
    this.statusArgs = statusArgs;
  }
}

function statusError(statusKey, statusArgs = []) {
  return new StatusError(statusKey, statusArgs);
}

function statusFromError(error, fallbackKey = 'unknownCaptureError') {
  if (error?.statusKey) {
    return {
      statusKey: error.statusKey,
      statusArgs: error.statusArgs || []
    };
  }

  return {
    statusKey: fallbackKey,
    statusArgs: [String(error?.message || '')]
  };
}

function errorResponse(error, fallbackKey = 'unknownCaptureError') {
  const status = statusFromError(error, fallbackKey);
  return { ok: false, ...status };
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitWhilePaused() {
  while (getBatchState().paused && !getBatchState().stopping) {
    await sleep(250);
  }
}

async function sleepWithControls(ms) {
  let remaining = Math.max(0, ms);

  while (remaining > 0) {
    if (getBatchState().stopping) {
      return;
    }

    await waitWhilePaused();

    const step = Math.min(250, remaining);
    await sleep(step);
    remaining -= step;
  }
}

function isCapturableTab(tab) {
  if (!tab?.id || !tab.url) {
    return false;
  }

  try {
    return CAPTURABLE_PROTOCOLS.has(new URL(tab.url).protocol);
  } catch (_error) {
    return false;
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

const setStatus = (...args) => batchStatus.setStatus(...args);

async function syncActionPopup(settings) {
  await chrome.action.setPopup({
    popup: settings.iconClickAction === 'popup' ? ACTION_POPUP_URL : ''
  });
}

async function syncActionContextMenus(settings) {
  await chrome.contextMenus.removeAll();

  if (settings.iconClickAction === 'popup') {
    return;
  }

  chrome.contextMenus.create({
    id: ACTION_MENU_OPEN_POPUP,
    contexts: ['action'],
    title: chrome.i18n.getMessage('contextMenuOpenPopup') || 'Open popup'
  });
}

async function syncActionUi(settings) {
  await syncActionPopup(settings);
  await syncActionContextMenus(settings);
}

function openStandalonePopupWindow() {
  return chrome.windows.create({
    url: chrome.runtime.getURL(ACTION_POPUP_URL),
    type: 'popup',
    width: 420,
    height: 720,
    focused: true
  });
}

async function openActionPopupFromMenu() {
  if (!chrome.action?.openPopup) {
    await openStandalonePopupWindow();
    return;
  }

  try {
    await chrome.action.setPopup({ popup: ACTION_POPUP_URL });
    await chrome.action.openPopup();
  } catch (_error) {
    await openStandalonePopupWindow();
  } finally {
    const settings = await loadSettings().catch(() => null);
    if (settings) {
      await syncActionPopup(settings).catch((error) => setStatus(statusFromError(error), false));
    }
  }
}

async function ensureOffscreenDocument() {
  const url = chrome.runtime.getURL(OFFSCREEN_URL);
  const contexts = await chrome.runtime.getContexts({
    contextTypes: ['OFFSCREEN_DOCUMENT'],
    documentUrls: [url]
  });

  if (contexts.length) {
    return;
  }

  await chrome.offscreen.createDocument({
    url: OFFSCREEN_URL,
    reasons: ['BLOBS'],
    justification: 'Stitch full-page screenshots in a DOM canvas and return data URLs for downloads.'
  });
}

async function closeOffscreenDocument() {
  const contexts = await chrome.runtime.getContexts({
    contextTypes: ['OFFSCREEN_DOCUMENT'],
    documentUrls: [chrome.runtime.getURL(OFFSCREEN_URL)]
  });

  if (contexts.length) {
    await chrome.offscreen.closeDocument();
  }
}

async function waitForTabComplete(tabId, timeoutMs = 45000) {
  const initial = await chrome.tabs.get(tabId);
  if (initial.status === 'complete') {
    return;
  }

  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      chrome.tabs.onUpdated.removeListener(listener);
      reject(statusError('pageLoadTimeoutError'));
    }, timeoutMs);

    function listener(updatedTabId, changeInfo) {
      if (updatedTabId === tabId && changeInfo.status === 'complete') {
        clearTimeout(timeout);
        chrome.tabs.onUpdated.removeListener(listener);
        resolve();
      }
    }

    chrome.tabs.onUpdated.addListener(listener);
  });
}

async function activateTab(tab) {
  await chrome.windows.update(tab.windowId, { focused: true }).catch(() => {});
  await chrome.tabs.update(tab.id, { active: true });
  await sleep(300);
  return chrome.tabs.get(tab.id);
}

async function sendTabMessage(tabId, message) {
  try {
    return await chrome.tabs.sendMessage(tabId, message);
  } catch (_error) {
    await chrome.scripting.executeScript({
      target: { tabId },
      files: ['content/page-capture.js']
    });
    return chrome.tabs.sendMessage(tabId, message);
  }
}

async function captureViewport(tab, options) {
  if (options.metadataEnabled || options.format === 'pdf') {
    const dataUrl = await captureVisibleTab(tab, { format: 'png' });
    const [injection] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => ({
        scrollHeight: window.innerHeight,
        viewportHeight: window.innerHeight,
        viewportWidth: window.innerWidth,
        devicePixelRatio: window.devicePixelRatio || 1
      })
    });
    const stitchResponse = await chrome.runtime.sendMessage({
      action: 'stitch',
      segments: [{ dataUrl, actualScrollY: 0, isLastFrame: true }],
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
}

async function captureFullPage(tab, options) {
  const prep = await sendTabMessage(tab.id, { action: 'prepare' });
  if (!prep?.ok) {
    throw statusError('capturePrepareError');
  }

  const metrics = prep.metrics;
  const frameCount = Math.max(1, Math.ceil(metrics.scrollHeight / metrics.viewportHeight));
  const segments = [];

  for (let frame = 0; frame < frameCount; frame += 1) {
    if (getBatchState().stopping) {
      throw statusError('captureStoppedError');
    }

    await waitWhilePaused();

    const requestedY = Math.min(
      frame * metrics.viewportHeight,
      Math.max(0, metrics.scrollHeight - metrics.viewportHeight)
    );
    const scrollResponse = await sendTabMessage(tab.id, { action: 'scrollTo', y: requestedY });
    await sleepWithControls(CAPTURE_SETTLE_MS);

    const dataUrl = await captureVisibleTab(tab, { format: 'png' });
    segments.push({
      dataUrl,
      requestedY,
      actualScrollY: scrollResponse.actualScrollY,
      isLastFrame: frame === frameCount - 1
    });
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

async function downloadDataUrl(dataUrl, filename) {
  return chrome.downloads.download({
    url: dataUrl,
    filename,
    conflictAction: 'uniquify',
    saveAs: false
  });
}

async function captureTabToDownload(tab, index, total, options, urlContext = {}) {
  const freshTab = await activateTab(tab);
  const url = freshTab.url || tab.url;
  const parsedUrl = new URL(url);
  const captureOptions = {
    ...options,
    metadataContext: {
      capturedAt: new Date().toISOString(),
      url,
      title: freshTab.title || '',
      host: parsedUrl.hostname,
      index: index + 1,
      total,
      keyword: urlContext.keyword || ''
    }
  };
  const dataUrl = options.captureMode === 'viewport'
    ? await captureViewport(freshTab, captureOptions)
    : await captureFullPage(freshTab, captureOptions);
  const filename = buildFilename(url, index, options, {
    title: freshTab.title || '',
    total,
    keyword: urlContext.keyword || ''
  });

  await downloadDataUrl(dataUrl, filename);
  return { url, filename, title: freshTab.title || '' };
}

function createUrlJobs(urls, options) {
  return urls.map((rawUrl, index) => ({
    kind: 'url',
    url: normalizeUrl(rawUrl),
    urlContext: options.urlContexts?.[index] || {},
    closeAfterCapture: Boolean(options.closeBatchTabsAfterCapture)
  }));
}

function createTabJobs(tabs, options = {}) {
  return tabs.map((tab, index) => ({
    kind: 'tab',
    tab,
    url: tab.url,
    title: tab.title || '',
    urlContext: options.urlContexts?.[index] || {},
    closeAfterCapture: Boolean(options.closeAfterCapture)
  }));
}

async function prepareCaptureJob(job) {
  if (job.kind === 'url') {
    const tab = await chrome.tabs.create({ url: job.url, active: true });
    return { ...job, tab, url: tab.url || job.url };
  }

  return job;
}

async function cleanupCaptureJob(job) {
  if (!job.tab?.id) {
    return;
  }

  await sendTabMessage(job.tab.id, { action: 'cleanup' }).catch(() => {});
  if (job.closeAfterCapture) {
    await chrome.tabs.remove(job.tab.id).catch(() => {});
  }
}

async function captureSingleJob(job, index, total, options) {
  let activeJob = job;
  let filename = '';
  let title = job.title || '';
  let url = job.url;

  try {
    activeJob = await prepareCaptureJob(job);
    url = activeJob.url || activeJob.tab?.url || url;
    batchStatus.updateProgress(index, total, url);

    if (activeJob.tab?.id && activeJob.waitForLoad !== false) {
      await waitForTabComplete(activeJob.tab.id);
    }

    if (activeJob.applyDelay !== false) {
      await sleepWithControls(Math.max(0, Number(options.delay) || 0) * 1000);
    }

    const result = await captureTabToDownload(activeJob.tab, index, total, options, activeJob.urlContext);
    url = result.url;
    filename = result.filename;
    title = result.title;

    return createReportRow({ index, url, title, filename, status: 'ok' });
  } catch (error) {
    const latestTab = activeJob.tab?.id ? await chrome.tabs.get(activeJob.tab.id).catch(() => null) : null;
    url = latestTab?.url || url;
    title = title || latestTab?.title || '';
    const status = statusFromError(error);
    return createReportRow({ index, url, title, filename, status: 'error', error: status.statusKey });
  } finally {
    await cleanupCaptureJob(activeJob);
  }
}

const runCaptureJobList = (jobs, options) => runCaptureJobs(jobs, options, {
  shouldStop: () => getBatchState().stopping,
  waitWhilePaused,
  captureSingleJob
});

async function captureCurrentTab(options) {
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

  try {
    await ensureOffscreenDocument();
    const rows = await runCaptureJobList(jobs, options);
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

async function captureCurrentWindowTabs(options) {
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

  try {
    await ensureOffscreenDocument();
    rows = await runCaptureJobList(jobs, options);

    if (options.reportEnabled) {
      await downloadReport(rows, options);
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

async function downloadReport(rows, options) {
  const isXlsx = options.reportFormat === 'xlsx';
  const extension = isXlsx ? 'xlsx' : 'csv';
  const mimeType = isXlsx
    ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    : 'text/csv;charset=utf-8';
  const columns = getReportColumns(options.reportFields);
  const header = columns.map((column) => column.label);
  const reportTimestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const firstRow = rows[0] || {};
  const reportFolder = buildFolderPath(
    options.folder,
    firstRow.url || 'https://batchshot.local/',
    0,
    rows.length,
    options,
    {
      title: firstRow.title || '',
      total: rows.length,
      keyword: options.urlContexts?.[0]?.keyword || ''
    }
  );
  const reportName = buildDownloadPath(reportFolder, `report-${reportTimestamp}.${extension}`);
  const dataUrl = isXlsx
    ? createXlsxReportDataUrl(rows, columns)
    : `data:${mimeType},${encodeURIComponent([
      header.join(','),
      ...rows.map((row) => columns.map((column) => csvEscape(row[column.key])).join(','))
    ].join('\n'))}`;

  await chrome.downloads.download({
    url: dataUrl,
    filename: reportName,
    conflictAction: 'uniquify',
    saveAs: false
  });
}

async function runBatch(options) {
  const jobs = createUrlJobs(options.urls, options);
  batchStatus.start('runningStatus');

  try {
    await ensureOffscreenDocument();
    const rows = await runCaptureJobList(jobs, options);

    if (options.reportEnabled) {
      await downloadReport(rows, options);
    }
    batchStatus.finish(rows, options.reportEnabled);
  } catch (error) {
    setStatus(statusFromError(error), false, false);
  } finally {
    await closeOffscreenDocument().catch(() => {});
    batchStatus.reset();
  }
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.action === 'getState') {
    sendResponse(getBatchState());
    return false;
  }

  if (message.action === 'syncActionUi') {
    loadSettings()
      .then(syncActionUi)
      .then(() => sendResponse({ ok: true }))
      .catch((error) => sendResponse(errorResponse(error)));
    return true;
  }

  if (message.action === 'stopBatch') {
    batchStatus.requestStop();
    sendResponse({ ok: true });
    return false;
  }

  if (message.action === 'togglePauseBatch') {
    if (!batchStatus.togglePause()) {
      sendResponse({ ok: false, statusKey: 'noBatchRunningError', statusArgs: [] });
      return false;
    }
    sendResponse({ ok: true });
    return false;
  }

  if (message.action === 'startBatch') {
    if (getBatchState().running) {
      sendResponse({ ok: false, statusKey: 'batchAlreadyRunningError', statusArgs: [] });
      return false;
    }

    runBatch(message.payload);
    sendResponse({ ok: true });
    return false;
  }

  if (message.action === 'captureCurrentTab') {
    captureCurrentTab(message.payload)
      .then(() => sendResponse({ ok: true }))
      .catch((error) => {
        const response = errorResponse(error);
        setStatus(response, false);
        sendResponse(response);
      });
    return true;
  }

  if (message.action === 'captureCurrentWindowTabs') {
    captureCurrentWindowTabs(message.payload)
      .then((count) => sendResponse({ ok: true, count }))
      .catch((error) => {
        const response = errorResponse(error);
        setStatus(response, false);
        sendResponse(response);
      });
    return true;
  }

  return false;
});

chrome.action.onClicked.addListener(() => {
  loadSettings()
    .then(async (settings) => {
      await syncActionPopup(settings);

      if (settings.iconClickAction === 'popup') {
        if (chrome.action.openPopup) {
          await chrome.action.openPopup();
        }
        return;
      }

      if (settings.iconClickAction === 'captureAllPages') {
        await captureCurrentWindowTabs(settings);
        return;
      }

      await captureCurrentTab(settings);
    })
    .catch((error) => setStatus(statusFromError(error), false));
});

chrome.commands.onCommand.addListener((command) => {
  if (command !== 'capture-current-page' && command !== 'capture-current-window') {
    return;
  }

  loadSettings()
    .then((settings) => {
      if (command === 'capture-current-window') {
        return captureCurrentWindowTabs(settings);
      }

      return captureCurrentTab(settings);
    })
    .catch((error) => setStatus(statusFromError(error), false));
});

chrome.contextMenus.onClicked.addListener((info) => {
  if (info.menuItemId === ACTION_MENU_OPEN_POPUP) {
    openActionPopupFromMenu()
      .catch((error) => setStatus(statusFromError(error), false));
    return;
  }
});

chrome.runtime.onInstalled.addListener(() => {
  loadSettings()
    .then(syncActionUi)
    .catch((error) => setStatus(statusFromError(error), false));
});

chrome.runtime.onStartup.addListener(() => {
  loadSettings()
    .then(syncActionUi)
    .catch((error) => setStatus(statusFromError(error), false));
});

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName !== 'local' || !changes.settings) {
    return;
  }

  loadSettings()
    .then(syncActionUi)
    .catch((error) => setStatus(statusFromError(error), false));
});

loadSettings()
  .then(syncActionUi)
  .catch((error) => setStatus(statusFromError(error), false));
