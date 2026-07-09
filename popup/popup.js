import { loadSettings, saveSettings as persistSettings } from '../utils/settings.js';
import { applyI18n, initI18n, message } from '../utils/i18n.js';
import { CONTENT_SCRIPT_FILES } from '../utils/content-script-files.js';
import { createCaptureActions } from './capture-actions.js';
import { getPopupElements } from './dom.js';
import { createInputHistory } from './history.js';
import { createLinkSelector } from './link-selector.js';
import { createScheduleActions } from './schedule.js';
import { createTaskHistory } from './task-history.js';
import { bindAutoSaveEvents, createPopupUiState, initTemplateResizing } from './ui-state.js';
import { createUrlInput } from './url-input.js';

const elements = getPopupElements();
let historyLimit = 0;

const settingsAdapter = {
  getSettings: () => ({})
};
const urlInputAdapter = {
  getMode: () => 'list',
  updateUrlCount: () => {},
  updateTemplatePreview: () => {}
};
const linkSelectorAdapter = {
  hasSelectedLinks: () => false
};

const { getBatchUiState, setRunning, renderStatusText: setStatus, renderActionVisibility } = createPopupUiState({
  elements,
  hasSelectedLinks: () => linkSelectorAdapter.hasSelectedLinks(),
  getUrlInputMode: () => urlInputAdapter.getMode()
});

async function saveSettings() {
  const settings = {
    ...settingsAdapter.getSettings(),
    sequentialNextSelector: elements.sequentialNextSelector.value.trim(),
    sequentialCaptureCount: Number(elements.sequentialCaptureCount.value) || 3
  };
  await persistSettings(settings);
}

const history = createInputHistory({
  elements,
  getHistoryLimit: () => historyLimit,
  saveSettings,
  urlInputAdapter,
  setStatus
});

const urlInput = createUrlInput({
  elements,
  saveSettings,
  closeHistoryMenus: history.closeHistoryMenus,
  onModeChange: () => {
    renderActionVisibility();
  }
});
settingsAdapter.getSettings = urlInput.getSettings;
urlInputAdapter.getMode = urlInput.getMode;
urlInputAdapter.updateUrlCount = urlInput.updateUrlCount;
urlInputAdapter.updateTemplatePreview = urlInput.updateTemplatePreview;
urlInputAdapter.getDelimiter = urlInput.getDelimiter;

const linkSelector = createLinkSelector({
  elements,
  addHistoryEntry: history.addHistoryEntry,
  closeHistoryMenus: history.closeHistoryMenus,
  saveSettings,
  setUrlInputMode: urlInput.setUrlInputMode,
  updateUrlCount: urlInput.updateUrlCount,
  setStatus
});
linkSelectorAdapter.hasSelectedLinks = linkSelector.hasSelectedLinks;

async function refreshState() {
  const response = await chrome.runtime.sendMessage({ action: 'getState' });
  const running = Boolean(response?.running);
  const paused = Boolean(response?.paused);
  let completed = Boolean(response?.completed);

  if (!running && completed) {
    chrome.runtime.sendMessage({ action: 'clearCompletedStatus' }).catch(() => {});
    completed = false;
  }

  setRunning({
    running,
    paused,
    statusKey: running ? (paused ? 'pausedStatus' : 'runningStatus') : 'idleStatus',
    statusArgs: response?.statusArgs || [],
    statusText: response?.statusText || '',
    logs: response?.logs || [],
    total: response?.total || 0,
    completed
  });
}

const captureActions = createCaptureActions({
  elements,
  persistSettings,
  getSettings: () => urlInput.getSettings(),
  getUrlInputMode: () => urlInput.getMode(),
  parseUrls: urlInput.parseUrls,
  buildTemplateUrls: urlInput.buildTemplateUrls,
  rememberCurrentInputs: history.rememberCurrentInputs,
  getBatchUiState,
  setRunning,
  refreshState,
  setStatus
});

async function getActivePageUrl() {
  if (chrome.windows?.getAll) {
    const windows = await chrome.windows.getAll({
      populate: true,
      windowTypes: ['normal']
    });
    const focusedWindow = windows.find((window) => window.focused);
    const orderedWindows = [
      focusedWindow,
      ...windows.filter((window) => window.id !== focusedWindow?.id)
    ].filter(Boolean);
    for (const window of orderedWindows) {
      const tab = (window.tabs || []).find((item) => item.active && /^https?:\/\/|^file:\/\//.test(item.url || ''));
      if (tab?.url) return tab.url;
    }
  }

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab?.url && /^https?:\/\/|^file:\/\//.test(tab.url) ? tab.url : '';
}

const scheduleActions = createScheduleActions({
  elements,
  persistSettings,
  getSettings: () => urlInput.getSettings(),
  getUrlInputMode: () => urlInput.getMode(),
  parseUrls: urlInput.parseUrls,
  buildTemplateUrls: urlInput.buildTemplateUrls,
  rememberCurrentInputs: history.rememberCurrentInputs,
  setStatus
});

const taskHistory = createTaskHistory({
  elements,
  getBatchUiState,
  setRunning,
  setStatus
});

async function restoreSettings() {
  const merged = await loadSettings();
  await initI18n(merged.appLanguage);
  applyI18n();
  historyLimit = merged.historyLimit;
  urlInput.restoreUrlSettings(merged);
  scheduleActions.setScheduleEnabled(merged.scheduledTasksEnabled);

  elements.sequentialNextSelector.value = merged.sequentialNextSelector || '';
  elements.sequentialCaptureCount.value = merged.sequentialCaptureCount;



  if (merged.theme) {
    document.documentElement.dataset.theme = merged.theme;
  }
}

document.addEventListener('DOMContentLoaded', async () => {
  try {
    await history.loadInputHistory();
    await restoreSettings();
    await refreshState();
    await scheduleActions.refreshScheduledTask();
    await taskHistory.refreshTaskHistory();
    initTemplateResizing();
  } finally {
    document.body.classList.add('is-loaded');
  }
});

bindAutoSaveEvents(elements, saveSettings);
urlInput.bindUrlInputEvents();
history.bindHistoryEvents();
linkSelector.bindLinkSelectorEvents();
captureActions.bindCaptureEvents();
scheduleActions.bindScheduleEvents();
taskHistory.bindTaskHistoryEvents();

if (elements.dashboardCloseButton) {
  elements.dashboardCloseButton.addEventListener('click', () => {
    chrome.runtime.sendMessage({ action: 'clearCompletedStatus' }).catch(() => {});
    elements.dashboardPanel.hidden = true;
    elements.urlSection.hidden = false;
    elements.captureSettings.hidden = false;
  });
}

// Helper: inject content scripts into tab if needed, then send a message.
async function sendToActiveTab(message) {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id || !/^https?:\/\/|^file:\/\//.test(tab.url || '')) {
    return { ok: false, statusKey: 'noActivePageError' };
  }
  try {
    return await chrome.tabs.sendMessage(tab.id, message);
  } catch (_err) {
    // Content scripts not yet injected — inject them and retry.
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: CONTENT_SCRIPT_FILES
    });
    return await chrome.tabs.sendMessage(tab.id, message);
  }
}

async function fillSequenceFromCurrentPage() {
  setStatus(message('sequentialRunningStatus'));
  try {
    const currentUrl = await getActivePageUrl();
    if (!currentUrl) {
      setStatus(message('noActivePageError'));
      return;
    }

    elements.sequentialStartUrl.value = currentUrl;
    const response = await sendToActiveTab({ action: 'detectNextPage' });
    if (response?.ok && response.selector) {
      elements.sequentialNextSelector.value = response.selector;
      await saveSettings();
      setStatus(message('sequenceFromCurrentPageSavedStatus'));
    } else {
      await saveSettings();
      setStatus(message('sequenceFromCurrentPagePartialStatus'));
    }
  } catch (error) {
    setStatus(error.message || message('nextPageNotFoundError'));
  }
}

async function pickNextPageSelector() {
  try {
    await saveSettings();
    chrome.runtime.sendMessage({
      action: 'pickNextPageSelectorFromPopup',
      payload: { prompt: message('nextPageSelectorPickerPrompt') }
    });
    window.close();
  } catch (error) {
    setStatus(error.message || message('nextPageSelectorError'));
  }
}

function bindSequentialEvents() {
  elements.detectNextPageButton.addEventListener('click', fillSequenceFromCurrentPage);
  elements.pickNextPageButton.addEventListener('click', pickNextPageSelector);
}

bindSequentialEvents();

chrome.runtime.onMessage.addListener((statusMessage) => {
  if (statusMessage.action !== 'batchStatus') return;
  setRunning({
    running: Boolean(statusMessage.running),
    paused: Boolean(statusMessage.paused),
    statusKey: statusMessage.statusKey || (statusMessage.paused ? 'pausedStatus' : 'runningStatus'),
    statusArgs: statusMessage.statusArgs || [],
    statusText: statusMessage.statusText || '',
    logs: statusMessage.logs || [],
    total: statusMessage.total || 0,
    completed: Boolean(statusMessage.completed)
  });
});

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName !== 'local') {
    return;
  }

  if (changes.taskHistory) {
    taskHistory.refreshTaskHistory().catch(() => {});
  }

  if (!changes.settings) {
    return;
  }

  const newValue = changes.settings.newValue || {};

  if ('scheduledTasksEnabled' in newValue) {
    const isEnabled = Boolean(newValue.scheduledTasksEnabled);
    scheduleActions.setScheduleEnabled(isEnabled);
    if (isEnabled) {
      scheduleActions.refreshScheduledTask().catch(() => {});
    }
  }
});

document.addEventListener('click', () => {
  history.closeHistoryMenus();
  taskHistory.closeTaskHistory();
});

document.addEventListener('keydown', (event) => {
  if (event.key !== 'Escape') {
    return;
  }

  if (!elements.taskHistoryPanel.hidden) {
    taskHistory.closeTaskHistory();
    return;
  }

  if (!elements.linkSelectorPanel.hidden) {
    linkSelector.closeLinkSelector();
    return;
  }
  
  if (!elements.urlPreviewPanel.hidden) {
    urlInput.closePreviewPanel();
    return;
  }
  
  history.closeHistoryMenus();
});
