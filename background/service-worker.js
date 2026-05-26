import { buildDownloadPath, buildFilename, csvEscape, normalizeUrl } from '../utils/helpers.js';
import { getReportColumns } from '../utils/report-fields.js';
import { loadSettings } from '../utils/settings.js';
import { createXlsxReportDataUrl } from '../utils/xlsx.js';

const OFFSCREEN_URL = 'offscreen/offscreen.html';
const CAPTURE_SETTLE_MS = 250;
const MIN_CAPTURE_INTERVAL_MS = 700;

let lastCaptureAt = 0;

let batchState = {
  running: false,
  paused: false,
  stopping: false,
  statusText: ''
};

const CAPTURABLE_PROTOCOLS = new Set(['http:', 'https:', 'file:']);

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitWhilePaused() {
  while (batchState.paused && !batchState.stopping) {
    await sleep(250);
  }
}

async function sleepWithControls(ms) {
  let remaining = Math.max(0, ms);

  while (remaining > 0) {
    if (batchState.stopping) {
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
  const quality = Number(options.screenshotQuality);
  if (!Number.isFinite(quality)) {
    return 92;
  }

  return Math.min(100, Math.max(1, Math.round(quality)));
}

function setStatus(statusText, running = batchState.running, paused = batchState.paused) {
  batchState = { ...batchState, statusText, running, paused };
  chrome.runtime.sendMessage({ action: 'batchStatus', statusText, running, paused }).catch(() => {});
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
      reject(new Error('Page load timed out'));
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
      throw new Error(stitchResponse?.error || 'Could not convert viewport screenshot');
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
    throw new Error('Could not prepare page for capture');
  }

  const metrics = prep.metrics;
  const frameCount = Math.max(1, Math.ceil(metrics.scrollHeight / metrics.viewportHeight));
  const segments = [];

  for (let frame = 0; frame < frameCount; frame += 1) {
    if (batchState.stopping) {
      throw new Error('Stopped');
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
    throw new Error(stitchResponse?.error || 'Could not stitch screenshots');
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

async function captureTabToDownload(tab, index, total, options) {
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
      total
    }
  };
  const dataUrl = options.captureMode === 'viewport'
    ? await captureViewport(freshTab, captureOptions)
    : await captureFullPage(freshTab, captureOptions);
  const filename = buildFilename(url, index, options, { title: freshTab.title || '' });

  await downloadDataUrl(dataUrl, filename);
  return { url, filename, title: freshTab.title || '' };
}

async function processUrl(rawUrl, index, total, options) {
  const url = normalizeUrl(rawUrl);
  const tab = await chrome.tabs.create({ url, active: true });
  let filename = '';
  let title = '';

  try {
    setStatus(`${index + 1}/${total} ${url}`, true);
    await waitForTabComplete(tab.id);
    await sleepWithControls(Math.max(0, Number(options.delay) || 0) * 1000);

    const result = await captureTabToDownload(tab, index, total, options);
    filename = result.filename;
    title = result.title;

    return { index: index + 1, url, title, filename, status: 'ok', error: '' };
  } catch (error) {
    const latestTab = await chrome.tabs.get(tab.id).catch(() => null);
    title = title || latestTab?.title || '';
    return { index: index + 1, url, title, filename, status: 'error', error: error.message };
  } finally {
    await sendTabMessage(tab.id, { action: 'cleanup' }).catch(() => {});
    if (options.closeBatchTabsAfterCapture) {
      await chrome.tabs.remove(tab.id).catch(() => {});
    }
  }
}

async function captureCurrentTab(options) {
  if (batchState.running) {
    throw new Error('Batch already running');
  }

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id || !tab.url) {
    throw new Error('No active page to capture');
  }

  batchState = { running: true, paused: false, stopping: false, statusText: 'Capturing current page...' };
  setStatus('Capturing current page...', true);

  try {
    await ensureOffscreenDocument();
    await captureTabToDownload(tab, 0, 1, options);
    setStatus('Current page screenshot downloaded.', false);
  } finally {
    await sendTabMessage(tab.id, { action: 'cleanup' }).catch(() => {});
    await closeOffscreenDocument().catch(() => {});
    batchState.running = false;
    batchState.paused = false;
    batchState.stopping = false;
  }
}

async function captureCurrentWindowTabs(options) {
  if (batchState.running) {
    throw new Error('Batch already running');
  }

  const currentWindowTabs = await chrome.tabs.query({ currentWindow: true });
  const tabs = currentWindowTabs.filter(isCapturableTab);
  if (!tabs.length) {
    throw new Error('No capturable tabs in the current window');
  }

  const originalTab = currentWindowTabs.find((tab) => tab.active);
  const rows = [];
  batchState = { running: true, paused: false, stopping: false, statusText: 'Capturing current window tabs...' };
  setStatus('Capturing current window tabs...', true);

  try {
    await ensureOffscreenDocument();

    for (let index = 0; index < tabs.length; index += 1) {
      if (batchState.stopping) {
        break;
      }

      await waitWhilePaused();

      const tab = tabs[index];
      let filename = '';
      let title = tab.title || '';
      const url = tab.url;
      setStatus(`${index + 1}/${tabs.length} ${url}`, true);

      try {
        await waitForTabComplete(tab.id);
        await sleepWithControls(Math.max(0, Number(options.delay) || 0) * 1000);
        const result = await captureTabToDownload(tab, index, tabs.length, options);
        filename = result.filename;
        title = result.title;
        rows.push({ index: index + 1, url, title, filename, status: 'ok', error: '' });
      } catch (error) {
        const latestTab = await chrome.tabs.get(tab.id).catch(() => null);
        title = latestTab?.title || title;
        rows.push({ index: index + 1, url, title, filename, status: 'error', error: error.message });
      } finally {
        await sendTabMessage(tab.id, { action: 'cleanup' }).catch(() => {});
      }
    }

    if (options.reportEnabled) {
      await downloadReport(rows, options);
    }

    const successful = rows.filter((row) => row.status === 'ok').length;
    const failed = rows.length - successful;
    const reportStatus = options.reportEnabled ? ' Report downloaded.' : '';
    setStatus(`Done. ${successful} screenshot(s), ${failed} failure(s).${reportStatus}`, false, false);

    return successful;
  } finally {
    if (originalTab?.id) {
      await activateTab(originalTab).catch(() => {});
    }
    await closeOffscreenDocument().catch(() => {});
    batchState.running = false;
    batchState.paused = false;
    batchState.stopping = false;
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
  const reportName = buildDownloadPath(options.folder, `report-${reportTimestamp}.${extension}`);
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
  const rows = [];
  batchState = { running: true, paused: false, stopping: false, statusText: 'Capturing...' };

  try {
    await ensureOffscreenDocument();

    for (let index = 0; index < options.urls.length; index += 1) {
      if (batchState.stopping) {
        break;
      }
      await waitWhilePaused();
      rows.push(await processUrl(options.urls[index], index, options.urls.length, options));
    }

    if (options.reportEnabled) {
      await downloadReport(rows, options);
    }
    const successful = rows.filter((row) => row.status === 'ok').length;
    const failed = rows.length - successful;
    const reportStatus = options.reportEnabled ? ' Report downloaded.' : '';
    setStatus(`Done. ${successful} screenshot(s), ${failed} failure(s).${reportStatus}`, false, false);
  } catch (error) {
    setStatus(error.message, false, false);
  } finally {
    await closeOffscreenDocument().catch(() => {});
    batchState.running = false;
    batchState.paused = false;
    batchState.stopping = false;
  }
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.action === 'getState') {
    sendResponse(batchState);
    return false;
  }

  if (message.action === 'stopBatch') {
    batchState.stopping = true;
    setStatus('Stopping after current cleanup...', true, false);
    sendResponse({ ok: true });
    return false;
  }

  if (message.action === 'togglePauseBatch') {
    if (!batchState.running || batchState.stopping) {
      sendResponse({ ok: false, error: 'No batch is running' });
      return false;
    }

    const nextPaused = !batchState.paused;
    setStatus(nextPaused ? 'Paused.' : 'Capturing...', true, nextPaused);
    sendResponse({ ok: true });
    return false;
  }

  if (message.action === 'startBatch') {
    if (batchState.running) {
      sendResponse({ ok: false, error: 'Batch already running' });
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
        setStatus(error.message, false);
        sendResponse({ ok: false, error: error.message });
      });
    return true;
  }

  if (message.action === 'captureCurrentWindowTabs') {
    captureCurrentWindowTabs(message.payload)
      .then((count) => sendResponse({ ok: true, count }))
      .catch((error) => {
        setStatus(error.message, false);
        sendResponse({ ok: false, error: error.message });
      });
    return true;
  }

  return false;
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
    .catch((error) => setStatus(error.message, false));
});
