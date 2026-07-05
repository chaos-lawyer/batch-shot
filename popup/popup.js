import { loadSettings, saveSettings as persistSettings } from '../utils/settings.js';
import { applyI18n, initI18n } from '../utils/i18n.js';
import { createCaptureActions } from './capture-actions.js';
import { getPopupElements } from './dom.js';
import { createInputHistory } from './history.js';
import { createLinkSelector } from './link-selector.js';
import { createScheduleActions } from './schedule.js';
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

const { getBatchUiState, setRunning, renderStatusText: setStatus } = createPopupUiState({
  elements,
  hasSelectedLinks: () => linkSelectorAdapter.hasSelectedLinks()
});

async function saveSettings() {
  await persistSettings(settingsAdapter.getSettings());
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
  closeHistoryMenus: history.closeHistoryMenus
});
settingsAdapter.getSettings = urlInput.getSettings;
urlInputAdapter.getMode = urlInput.getMode;
urlInputAdapter.updateUrlCount = urlInput.updateUrlCount;
urlInputAdapter.updateTemplatePreview = urlInput.updateTemplatePreview;

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
  setRunning({
    running,
    paused,
    statusKey: running ? (paused ? 'pausedStatus' : 'runningStatus') : 'idleStatus',
    statusArgs: response?.statusArgs || [],
    statusText: response?.statusText || ''
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

async function restoreSettings() {
  const merged = await loadSettings();
  await initI18n(merged.appLanguage);
  applyI18n();
  historyLimit = merged.historyLimit;
  urlInput.restoreUrlSettings(merged);
  scheduleActions.setScheduleEnabled(merged.scheduledTasksEnabled);

  if (merged.theme) {
    document.documentElement.dataset.theme = merged.theme;
  }
}

document.addEventListener('DOMContentLoaded', async () => {
  await history.loadInputHistory();
  await restoreSettings();
  await refreshState();
  await scheduleActions.refreshScheduledTask();
  initTemplateResizing();
});

bindAutoSaveEvents(elements, saveSettings);
urlInput.bindUrlInputEvents();
history.bindHistoryEvents();
linkSelector.bindLinkSelectorEvents();
captureActions.bindCaptureEvents();
scheduleActions.bindScheduleEvents();

chrome.runtime.onMessage.addListener((statusMessage) => {
  if (statusMessage.action !== 'batchStatus') return;
  setRunning({
    running: Boolean(statusMessage.running),
    paused: Boolean(statusMessage.paused),
    statusKey: statusMessage.statusKey || (statusMessage.paused ? 'pausedStatus' : 'runningStatus'),
    statusArgs: statusMessage.statusArgs || [],
    statusText: statusMessage.statusText || ''
  });
});

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName !== 'local' || !changes.settings) {
    return;
  }

  const isEnabled = Boolean(changes.settings.newValue?.scheduledTasksEnabled);
  scheduleActions.setScheduleEnabled(isEnabled);
  if (isEnabled) {
    scheduleActions.refreshScheduledTask().catch(() => {});
  }
});

document.addEventListener('click', () => history.closeHistoryMenus());

document.addEventListener('keydown', (event) => {
  if (event.key !== 'Escape') {
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
