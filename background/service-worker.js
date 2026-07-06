import { buildDownloadPath, buildFilename, buildFolderPath, csvEscape, normalizeUrl } from '../utils/helpers.js';
import { clampInteger } from '../utils/number.js';
import { getReportColumns } from '../utils/report-fields.js';
import { loadSettings, saveSettings, DEFAULT_URL_TEMPLATE_DELIMITER } from '../utils/settings.js';
import { createXlsxReportDataUrl } from '../utils/xlsx.js';
import { createBatchStatusState, createReportRow, runCaptureJobs } from './capture-flow.js';
import {
  LEGACY_SCHEDULED_BATCH_ALARM,
  SCHEDULED_BATCH_ALARM_PREFIX,
  createScheduledTaskController
} from './scheduled-task.js';

const OFFSCREEN_URL = 'offscreen/offscreen.html';
const CAPTURE_SETTLE_MS = 250;
const MIN_CAPTURE_INTERVAL_MS = 700;
const ACTION_POPUP_URL = 'popup/popup.html';
const ACTION_MENU_OPEN_POPUP = 'open-popup';
const ACTION_MENU_ADD_SEARCH_TEMPLATE = 'add-search-template';

let lastCaptureAt = 0;
const localeMessagesCache = new Map();

const batchStatus = createBatchStatusState((state) => {
  chrome.runtime.sendMessage({ action: 'batchStatus', ...state }).catch(() => {});
});

const getBatchState = () => batchStatus.getState();

const CAPTURABLE_PROTOCOLS = new Set(['http:', 'https:', 'file:']);

function isScheduledBatchAlarm(alarm) {
  return alarm?.name === LEGACY_SCHEDULED_BATCH_ALARM
    || String(alarm?.name || '').startsWith(SCHEDULED_BATCH_ALARM_PREFIX);
}

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

async function loadLocaleMessages(language) {
  if (localeMessagesCache.has(language)) {
    return localeMessagesCache.get(language);
  }

  const response = await fetch(chrome.runtime.getURL(`_locales/${language}/messages.json`));
  const messages = await response.json();
  localeMessagesCache.set(language, messages);
  return messages;
}

async function messageForSettings(settings, key, fallback) {
  const language = settings.appLanguage;
  if (language !== 'en' && language !== 'zh_CN') {
    return chrome.i18n.getMessage(key) || fallback;
  }

  const messages = await loadLocaleMessages(language);
  return messages[key]?.message || chrome.i18n.getMessage(key) || fallback;
}

async function syncActionPopup(settings) {
  await chrome.action.setPopup({
    popup: settings.iconClickAction === 'popup' ? ACTION_POPUP_URL : ''
  });
}

async function syncActionContextMenus(settings) {
  await chrome.contextMenus.removeAll();

  chrome.contextMenus.create({
    id: ACTION_MENU_ADD_SEARCH_TEMPLATE,
    contexts: ['page', 'editable'],
    title: await messageForSettings(
      settings,
      'contextMenuAddSearchTemplate',
      'Add search box to BatchShot template'
    )
  });

  if (settings.iconClickAction !== 'popup') {
    chrome.contextMenus.create({
      id: ACTION_MENU_OPEN_POPUP,
      contexts: ['action'],
      title: await messageForSettings(settings, 'contextMenuOpenPopup', 'Open popup')
    });
  }
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

async function appendSearchTemplateFromContextMenu(tab) {
  if (!tab?.id) {
    [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  }

  if (!tab?.id || !tab.url) {
    throw statusError('noActivePageError');
  }

  const response = await sendTabMessage(tab.id, { action: 'getSearchInputSelector' });
  if (!response?.ok) {
    throw statusError(response?.statusKey || 'searchInputSelectorError');
  }
  const settings = await loadSettings();
  const buttonResponse = await sendTabMessage(tab.id, {
    action: 'pickSearchButtonSelector',
    payload: {
      prompt: await messageForSettings(
        settings,
        'buttonPickerPrompt',
        'Click the search button, or skip to submit with Enter.'
      ),
      skip: await messageForSettings(settings, 'buttonPickerSkip', 'Skip')
    }
  });
  if (!buttonResponse?.ok) {
    throw statusError(buttonResponse?.statusKey || 'searchButtonSelectorError');
  }

  const delimiter = settings.urlTemplateDelimiter || DEFAULT_URL_TEMPLATE_DELIMITER;
  const line = buttonResponse.selector
    ? `${tab.url}${delimiter}${response.selector}${delimiter}${buttonResponse.selector}`
    : `${tab.url}${delimiter}${response.selector}`;
  const currentTemplate = String(settings.urlTemplate || '').trimEnd();
  const nextTemplate = currentTemplate ? `${currentTemplate}\n${line}` : line;

  await saveSettings({
    urlTemplate: nextTemplate,
    urlInputMode: 'template'
  });
  await openActionPopupFromMenu();
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

async function waitForTabComplete(tabId, timeoutMs = 45000, timeoutStatusKey = 'pageLoadTimeoutError') {
  const initial = await chrome.tabs.get(tabId);
  if (initial.status === 'complete') {
    return;
  }

  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      chrome.tabs.onUpdated.removeListener(listener);
      reject(statusError(timeoutStatusKey));
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

async function waitForTabReadyForCapture(tabId, timeoutMs = 45000, timeoutStatusKey = 'pageLoadTimeoutError') {
  function isReady(tab) {
    const url = String(tab?.url || tab?.pendingUrl || '');
    return tab?.status === 'complete' && url && url !== 'about:blank';
  }

  const initial = await chrome.tabs.get(tabId);
  if (isReady(initial)) {
    return;
  }

  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      chrome.tabs.onUpdated.removeListener(listener);
      reject(statusError(timeoutStatusKey));
    }, timeoutMs);

    function listener(updatedTabId) {
      if (updatedTabId !== tabId) {
        return;
      }

      chrome.tabs.get(tabId)
        .then((tab) => {
          if (!isReady(tab)) {
            return;
          }
          clearTimeout(timeout);
          chrome.tabs.onUpdated.removeListener(listener);
          resolve();
        })
        .catch(() => {});
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

function waitForRelatedNewTab(sourceTab, timeoutMs = 2000) {
  return new Promise((resolve) => {
    let isDone = false;
    const timeout = setTimeout(() => {
      cleanup();
      resolve(null);
    }, timeoutMs);

    function cleanup() {
      if (isDone) {
        return;
      }
      isDone = true;
      clearTimeout(timeout);
      chrome.tabs.onCreated.removeListener(handleCreated);
      chrome.tabs.onActivated.removeListener(handleActivated);
    }

    function resolveTab(tab) {
      cleanup();
      resolve(tab);
    }

    function handleCreated(tab) {
      if (!tab?.id || tab.id === sourceTab.id) {
        return;
      }

      resolveTab(tab);
    }

    function handleActivated(activeInfo) {
      if (!activeInfo?.tabId || activeInfo.tabId === sourceTab.id) {
        return;
      }

      chrome.tabs.get(activeInfo.tabId)
        .then((tab) => resolveTab(tab))
        .catch(() => {});
    }

    chrome.tabs.onCreated.addListener(handleCreated);
    chrome.tabs.onActivated.addListener(handleActivated);
  });
}

async function captureViewport(tab, options) {
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

function createScrollPositions(totalSize, viewportSize) {
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

async function captureFullPage(tab, options) {
  const prep = await sendTabMessage(tab.id, { action: 'prepare' });
  if (!prep?.ok) {
    throw statusError('capturePrepareError');
  }

  const metrics = prep.metrics;
  const scrollXs = createScrollPositions(metrics.scrollWidth || metrics.viewportWidth, metrics.viewportWidth);
  const scrollYs = createScrollPositions(metrics.scrollHeight, metrics.viewportHeight);
  const segments = [];

  for (let column = 0; column < scrollXs.length; column += 1) {
    for (let row = 0; row < scrollYs.length; row += 1) {
      if (getBatchState().stopping) {
        throw statusError('captureStoppedError');
      }

      await waitWhilePaused();

      const requestedX = scrollXs[column];
      const requestedY = scrollYs[row];
      const scrollResponse = await sendTabMessage(tab.id, { action: 'scrollTo', x: requestedX, y: requestedY });
      await sleepWithControls(CAPTURE_SETTLE_MS);

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

function normalizeSearchJob(job, options) {
  const inputSelector = String(job.search?.inputSelector || '').trim();
  const submitMode = job.search?.submitMode === 'button' ? 'button' : 'enter';
  const buttonSelector = String(job.search?.buttonSelector || '').trim();

  if (!inputSelector) {
    throw statusError('searchInputSelectorError');
  }

  if (submitMode === 'button' && !buttonSelector) {
    throw statusError('searchButtonSelectorError');
  }

  return {
    kind: 'search',
    url: normalizeUrl(job.url),
    urlContext: job.urlContext || {},
    search: {
      keyword: String(job.search?.keyword ?? job.urlContext?.keyword ?? ''),
      inputSelector,
      submitMode,
      buttonSelector
    },
    closeAfterCapture: Boolean(options.closeBatchTabsAfterCapture),
    applyDelay: false,
    waitForLoad: false,
    searchResultDelay: options.searchResultDelay ?? options.delay
  };
}

function createExplicitJobs(options) {
  return options.jobs.map((job, index) => {
    if (job.kind === 'search') {
      return normalizeSearchJob(job, options);
    }

    return {
      kind: 'url',
      url: normalizeUrl(job.url),
      urlContext: job.urlContext || options.urlContexts?.[index] || {},
      closeAfterCapture: Boolean(options.closeBatchTabsAfterCapture)
    };
  });
}

function createSearchJobs(options) {
  const keywords = Array.isArray(options.searchKeywordsList)
    ? options.searchKeywordsList
    : String(options.searchKeywords || '')
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);
  let startUrl = '';
  const inputSelector = String(options.searchInputSelector || '').trim();
  const submitMode = options.searchSubmitMode === 'button' ? 'button' : 'enter';
  const buttonSelector = String(options.searchButtonSelector || '').trim();

  try {
    startUrl = normalizeUrl(options.searchStartUrl || '');
  } catch (_error) {
    throw statusError('searchStartUrlError');
  }

  if (!keywords.length) {
    throw statusError('searchKeywordsEmptyError');
  }

  if (!inputSelector) {
    throw statusError('searchInputSelectorError');
  }

  if (submitMode === 'button' && !buttonSelector) {
    throw statusError('searchButtonSelectorError');
  }

  return keywords.map((keyword) => ({
    kind: 'search',
    url: startUrl,
    urlContext: { keyword },
    search: {
      keyword,
      inputSelector,
      submitMode,
      buttonSelector
    },
    closeAfterCapture: Boolean(options.closeBatchTabsAfterCapture),
    applyDelay: false,
    waitForLoad: false
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

function createPrepareFormJobs(options) {
  const jobs = Array.isArray(options.jobs) && options.jobs.length
    ? createExplicitJobs(options)
    : options.urlInputMode === 'searchBox'
      ? createSearchJobs(options)
      : [];

  return jobs
    .filter((job) => job.kind === 'search')
    .map((job) => ({
      ...job,
      closeAfterCapture: false,
      applyDelay: false,
      waitForLoad: false
    }));
}

async function prepareCaptureJob(job) {
  if (job.kind === 'url') {
    const tab = await chrome.tabs.create({ url: job.url, active: true });
    return { ...job, tab, url: tab.url || job.url };
  }

  if (job.kind === 'search') {
    const tab = await chrome.tabs.create({ url: job.url, active: true });
    await waitForTabComplete(tab.id, 45000, 'searchPageLoadTimeoutError');

    const resultTabPromise = waitForRelatedNewTab(tab);
    const response = await sendTabMessage(tab.id, {
      action: 'performSearch',
      payload: job.search
    });

    if (!response?.ok) {
      throw statusError(response?.statusKey || 'searchSubmitError');
    }

    await sleepWithControls(300);
    const openedTab = await resultTabPromise;
    const captureTarget = openedTab?.id
      ? await chrome.tabs.get(openedTab.id).catch(() => openedTab)
      : tab;

    await waitForTabReadyForCapture(captureTarget.id, 45000, 'searchPageLoadTimeoutError');
    await sleepWithControls(Math.max(0, Number(job.searchResultDelay ?? 0)) * 1000);
    const latestTab = await chrome.tabs.get(captureTarget.id).catch(() => captureTarget);
    return {
      ...job,
      tab: latestTab,
      extraTabs: openedTab?.id ? [tab] : [],
      url: latestTab.url || captureTarget.url || tab.url || job.url
    };
  }

  return job;
}

async function cleanupCaptureJob(job) {
  const tabs = [job.tab, ...(job.extraTabs || [])]
    .filter((tab) => tab?.id)
    .filter((tab, index, list) => list.findIndex((item) => item.id === tab.id) === index);

  if (!tabs.length) {
    return;
  }

  await Promise.all(tabs.map((tab) => (
    sendTabMessage(tab.id, { action: 'cleanup' }).catch(() => {})
  )));

  if (job.closeAfterCapture) {
    await Promise.all(tabs.map((tab) => chrome.tabs.remove(tab.id).catch(() => {})));
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

async function prepareSingleFormJob(job, index, total) {
  let tab = null;
  let url = job.url;
  let title = '';

  try {
    tab = await chrome.tabs.create({ url: job.url, active: true });
    await waitForTabComplete(tab.id, 45000, 'searchPageLoadTimeoutError');
    const latestTab = await chrome.tabs.get(tab.id).catch(() => tab);
    url = latestTab.url || tab.url || job.url;
    title = latestTab.title || '';
    batchStatus.updateProgress(index, total, url);

    const response = await sendTabMessage(tab.id, {
      action: 'fillSearchForm',
      payload: job.search
    });

    if (!response?.ok) {
      throw statusError(response?.statusKey || 'searchSubmitError');
    }

    return createReportRow({ index, url, title, status: 'ok' });
  } catch (error) {
    const latestTab = tab?.id ? await chrome.tabs.get(tab.id).catch(() => null) : null;
    url = latestTab?.url || url;
    title = title || latestTab?.title || '';
    const status = statusFromError(error);
    return createReportRow({ index, url, title, status: 'error', error: status.statusKey });
  }
}

const runPrepareFormJobList = (jobs, options) => runCaptureJobs(jobs, options, {
  shouldStop: () => getBatchState().stopping,
  waitWhilePaused,
  captureSingleJob: prepareSingleFormJob
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
  let jobs = [];

  if (Array.isArray(options.jobs) && options.jobs.length) {
    jobs = createExplicitJobs(options);
  } else if (options.urlInputMode === 'searchBox') {
    jobs = createSearchJobs(options).map((job) => ({
      ...job,
      searchResultDelay: options.searchResultDelay ?? options.delay
    }));
  } else {
    jobs = createUrlJobs(options.urls, options);
  }

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

async function runPrepareForms(options) {
  try {
    const jobs = createPrepareFormJobs(options);
    if (!jobs.length) {
      throw statusError('openFillNoSearchJobsError');
    }

    batchStatus.start('openFillRunningStatus');
    const rows = await runPrepareFormJobList(jobs, options);
    const successful = rows.filter((row) => row.status === 'ok').length;
    const failed = rows.length - successful;
    setStatus({
      statusKey: 'openFillDoneStatus',
      statusArgs: [String(successful), String(failed)]
    }, false, false);
  } catch (error) {
    setStatus(statusFromError(error), false, false);
  } finally {
    batchStatus.reset();
  }
}

const scheduledTasks = createScheduledTaskController({
  getBatchState,
  runBatch,
  setStatus
});

async function restoreScheduledAlarmIfEnabled(settings) {
  if (!settings.scheduledTasksEnabled) {
    return scheduledTasks.clearScheduledAlarms();
  }

  return scheduledTasks.restoreScheduledAlarm();
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

  if (message.action === 'getScheduledBatch') {
    scheduledTasks.getScheduledTasks()
      .then((tasks) => sendResponse({ ok: true, tasks, task: tasks[0] || null }))
      .catch((error) => sendResponse(errorResponse(error)));
    return true;
  }

  if (message.action === 'scheduleBatch') {
    loadSettings()
      .then((settings) => {
        if (!settings.scheduledTasksEnabled) {
          return { ok: false, statusKey: 'scheduledTasksDisabledError', statusArgs: [] };
        }
        return scheduledTasks.scheduleBatch(
          message.payload.options,
          message.payload.scheduledAt,
          message.payload.taskId,
          message.payload.taskName
        );
      })
      .then((response) => sendResponse(response))
      .catch((error) => sendResponse(errorResponse(error, 'scheduledTaskError')));
    return true;
  }

  if (message.action === 'cancelScheduledBatch') {
    scheduledTasks.clearScheduledTask(message.payload?.taskId)
      .then((tasks) => sendResponse({ ok: true, tasks }))
      .catch((error) => sendResponse(errorResponse(error, 'scheduledTaskCancelError')));
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

  if (message.action === 'prepareBatchForms') {
    if (getBatchState().running) {
      sendResponse({ ok: false, statusKey: 'batchAlreadyRunningError', statusArgs: [] });
      return false;
    }

    runPrepareForms(message.payload);
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

chrome.alarms.onAlarm.addListener((alarm) => {
  loadSettings()
    .then((settings) => {
      if (isScheduledBatchAlarm(alarm) && !settings.scheduledTasksEnabled) {
        return;
      }
      return scheduledTasks.handleAlarm(alarm);
    })
    .catch((error) => setStatus(statusFromError(error), false));
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

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === ACTION_MENU_ADD_SEARCH_TEMPLATE) {
    Promise.resolve(appendSearchTemplateFromContextMenu(tab))
      .catch((error) => setStatus(statusFromError(error), false));
    return;
  }

  if (info.menuItemId === ACTION_MENU_OPEN_POPUP) {
    openActionPopupFromMenu()
      .catch((error) => setStatus(statusFromError(error), false));
    return;
  }
});

chrome.runtime.onInstalled.addListener(() => {
  loadSettings()
    .then(async (settings) => {
      await syncActionUi(settings);
      await restoreScheduledAlarmIfEnabled(settings);
    })
    .catch((error) => setStatus(statusFromError(error), false));
});

chrome.runtime.onStartup.addListener(() => {
  loadSettings()
    .then(async (settings) => {
      await syncActionUi(settings);
      await restoreScheduledAlarmIfEnabled(settings);
    })
    .catch((error) => setStatus(statusFromError(error), false));
});

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName !== 'local' || !changes.settings) {
    return;
  }

  loadSettings()
    .then(async (settings) => {
      await syncActionUi(settings);
      await restoreScheduledAlarmIfEnabled(settings);
    })
    .catch((error) => setStatus(statusFromError(error), false));
});

loadSettings()
  .then(async (settings) => {
    await syncActionUi(settings);
    await restoreScheduledAlarmIfEnabled(settings);
  })
  .catch((error) => setStatus(statusFromError(error), false));
