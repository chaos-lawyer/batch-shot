import { DEFAULT_SETTINGS, loadSettings, saveSettings as persistSettings } from '../utils/settings.js';
import { applyI18n, initI18n, message } from '../utils/i18n.js';

const $ = (id) => document.getElementById(id);

const elements = {
  urlList: $('urlList'),
  urlListPane: $('urlListPane'),
  urlTemplatePane: $('urlTemplatePane'),
  urlCountBadge: $('urlCountBadge'),
  listModeButton: $('listModeButton'),
  templateModeButton: $('templateModeButton'),
  urlTemplate: $('urlTemplate'),
  urlTemplateHistoryButton: $('urlTemplateHistoryButton'),
  urlTemplateHistoryMenu: $('urlTemplateHistoryMenu'),
  urlTemplateItems: $('urlTemplateItems'),
  urlTemplateItemsHistoryButton: $('urlTemplateItemsHistoryButton'),
  urlTemplateItemsHistoryMenu: $('urlTemplateItemsHistoryMenu'),
  urlPreviewCount: $('urlPreviewCount'),
  urlPreviewList: $('urlPreviewList'),
  urlListHistoryButton: $('urlListHistoryButton'),
  urlListHistoryMenu: $('urlListHistoryMenu'),
  applyTemplateButton: $('applyTemplateButton'),
  captureSettings: $('captureSettings'),
  captureMode: $('captureMode'),
  delay: $('delay'),
  folder: $('folder'),
  currentTabButton: $('currentTabButton'),
  currentWindowTabsButton: $('currentWindowTabsButton'),
  settingsButton: $('settingsButton'),
  startButton: $('startButton'),
  pauseButton: $('pauseButton'),
  stopButton: $('stopButton'),
  statusText: $('statusText')
};

const HISTORY_STORAGE_KEY = 'inputHistory';
const HISTORY_CONFIG = {
  urls: {
    input: 'urlList',
    button: 'urlListHistoryButton',
    menu: 'urlListHistoryMenu',
    emptyKey: 'historyUrlsEmpty'
  },
  templates: {
    input: 'urlTemplate',
    button: 'urlTemplateHistoryButton',
    menu: 'urlTemplateHistoryMenu',
    emptyKey: 'historyTemplatesEmpty'
  },
  templateItems: {
    input: 'urlTemplateItems',
    button: 'urlTemplateItemsHistoryButton',
    menu: 'urlTemplateItemsHistoryMenu',
    emptyKey: 'historyTemplateItemsEmpty'
  }
};

let urlInputMode = DEFAULT_SETTINGS.urlInputMode;
let historyLimit = DEFAULT_SETTINGS.historyLimit;
let urlListWrap = DEFAULT_SETTINGS.urlListWrap;
let inputHistory = {
  urls: [],
  templates: [],
  templateItems: []
};
let openHistoryType = '';

function getSettings() {
  return {
    urls: elements.urlList.value,
    urlInputMode,
    urlTemplate: elements.urlTemplate.value,
    urlTemplateItems: elements.urlTemplateItems.value,
    captureMode: elements.captureMode.value,
    delay: Number(elements.delay.value) || 0,
    folder: elements.folder.value.trim()
  };
}

async function saveSettings() {
  await persistSettings(getSettings());
}

function applyUrlListWrap(isEnabled) {
  urlListWrap = isEnabled;
  elements.urlList.classList.toggle('no-wrap', !urlListWrap);
  elements.urlListPane.classList.toggle('has-no-wrap', !urlListWrap);
  elements.urlList.setAttribute('wrap', urlListWrap ? 'soft' : 'off');
}

async function restoreSettings() {
  const merged = await loadSettings();
  await initI18n(merged.appLanguage);
  applyI18n();
  historyLimit = merged.historyLimit;

  elements.urlList.value = merged.urls;
  applyUrlListWrap(merged.urlListWrap);
  updateUrlCount();
  elements.urlTemplate.value = merged.urlTemplate;
  elements.urlTemplateItems.value = merged.urlTemplateItems;
  setUrlInputMode(merged.urlInputMode || DEFAULT_SETTINGS.urlInputMode, false);
  updateTemplatePreview();
  elements.captureMode.value = merged.captureMode;
  elements.delay.value = merged.delay;
  elements.folder.value = merged.folder;
  
  if (merged.theme) {
    document.documentElement.dataset.theme = merged.theme;
  }
}

function setRunning(isRunning, statusKey = isRunning ? 'runningStatus' : 'idleStatus', isPaused = false) {
  elements.currentTabButton.disabled = isRunning;
  elements.currentWindowTabsButton.disabled = isRunning;
  elements.startButton.disabled = isRunning;
  elements.pauseButton.disabled = !isRunning;
  elements.stopButton.disabled = !isRunning;
  elements.pauseButton.querySelector('.pause-icon').hidden = isPaused;
  elements.pauseButton.querySelector('.resume-icon').hidden = !isPaused;
  const pauseLabel = message(isPaused ? 'resumeButton' : 'pauseButton');
  elements.pauseButton.title = pauseLabel;
  elements.pauseButton.setAttribute('aria-label', pauseLabel);
  elements.statusText.textContent = message(statusKey);
}

function parseUrls(value) {
  return value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function updateUrlCount() {
  const count = parseUrls(elements.urlList.value).length;
  elements.urlCountBadge.textContent = count;
  elements.urlCountBadge.classList.toggle('has-data', count > 0);
}

function buildTemplateUrls() {
  const template = elements.urlTemplate.value.trim();
  const items = parseUrls(elements.urlTemplateItems.value);

  if (!template && !items.length) {
    return { urls: [], errorKey: 'emptyUrlError' };
  }

  if (!template.includes('%s')) {
    return { urls: [], errorKey: 'urlTemplateMissingPlaceholderError' };
  }

  if (!items.length) {
    return { urls: [], errorKey: 'emptyUrlError' };
  }

  return {
    urls: items.map((item) => template.replaceAll('%s', item)),
    errorKey: ''
  };
}

function updateTemplatePreview() {
  const { urls, errorKey } = buildTemplateUrls();
  elements.applyTemplateButton.disabled = Boolean(errorKey);
  elements.urlPreviewList.replaceChildren();

  if (errorKey && (elements.urlTemplate.value || elements.urlTemplateItems.value)) {
    elements.urlPreviewCount.textContent = message(errorKey);
    return;
  }

  elements.urlPreviewCount.textContent = message('urlPreviewCount', String(urls.length));
  urls.slice(0, 4).forEach((url) => {
    const item = document.createElement('li');
    item.textContent = url;
    elements.urlPreviewList.append(item);
  });
}

function normalizeHistory(history) {
  const normalizeEntries = (entries) => entries
    .filter((entry) => entry?.value)
    .map((entry) => ({
      value: String(entry.value),
      name: String(entry.name || ''),
      updatedAt: entry.updatedAt || ''
    }));

  return {
    urls: Array.isArray(history?.urls) ? normalizeEntries(history.urls) : [],
    templates: Array.isArray(history?.templates) ? normalizeEntries(history.templates) : [],
    templateItems: Array.isArray(history?.templateItems) ? normalizeEntries(history.templateItems) : []
  };
}

async function loadInputHistory() {
  const stored = await chrome.storage.local.get(HISTORY_STORAGE_KEY);
  inputHistory = normalizeHistory(stored[HISTORY_STORAGE_KEY]);
}

async function saveInputHistory() {
  await chrome.storage.local.set({ [HISTORY_STORAGE_KEY]: inputHistory });
}

function summarizeHistoryValue(value) {
  const lines = value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  return {
    title: lines[0] || value.trim(),
    meta: lines.length > 1 ? message('historyLineCount', String(lines.length)) : ''
  };
}

async function addHistoryEntry(type, value) {
  const trimmed = value.trim();
  if (!trimmed || !HISTORY_CONFIG[type]) {
    return;
  }

  const existing = inputHistory[type].find((entry) => entry.value === trimmed);
  const withoutDuplicate = inputHistory[type].filter((entry) => entry.value !== trimmed);
  inputHistory[type] = [
    { value: trimmed, name: existing?.name || '', updatedAt: new Date().toISOString() },
    ...withoutDuplicate
  ].slice(0, historyLimit);
  await saveInputHistory();
  renderHistoryMenu(type);
}

async function rememberCurrentInputs() {
  if (urlInputMode === 'template') {
    await addHistoryEntry('templates', elements.urlTemplate.value);
    await addHistoryEntry('templateItems', elements.urlTemplateItems.value);
    return;
  }

  await addHistoryEntry('urls', elements.urlList.value);
}

function closeHistoryMenus() {
  openHistoryType = '';
  Object.values(HISTORY_CONFIG).forEach(({ button, menu }) => {
    elements[menu].hidden = true;
    elements[button].setAttribute('aria-expanded', 'false');
  });
}

function renderHistoryMenu(type) {
  const config = HISTORY_CONFIG[type];
  const menu = elements[config.menu];
  const entries = inputHistory[type];
  menu.replaceChildren();

  if (!entries.length) {
    const empty = document.createElement('div');
    empty.className = 'history-empty';
    empty.textContent = message(config.emptyKey);
    menu.append(empty);
    return;
  }

  const list = document.createElement('div');
  list.className = 'history-list';
  entries.forEach((entry, index) => {
    const row = document.createElement('div');
    row.className = 'history-row';

    const item = document.createElement('button');
    item.type = 'button';
    item.className = 'history-item';
    item.dataset.historyAction = 'use';
    item.dataset.historyType = type;
    item.dataset.historyIndex = String(index);

    const summary = summarizeHistoryValue(entry.value);
    const title = document.createElement('span');
    title.className = 'history-title';
    title.textContent = entry.name || summary.title;
    item.append(title);

    const meta = document.createElement('span');
    meta.className = 'history-meta';
    meta.textContent = entry.name ? summary.title : summary.meta;
    item.append(meta);

    const renameButton = document.createElement('button');
    renameButton.type = 'button';
    renameButton.className = 'history-action-button';
    renameButton.dataset.historyAction = 'rename';
    renameButton.dataset.historyType = type;
    renameButton.dataset.historyIndex = String(index);
    renameButton.title = message('historyRenameButton');
    renameButton.setAttribute('aria-label', message('historyRenameButton'));
    renameButton.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"></path></svg>`;

    const deleteButton = document.createElement('button');
    deleteButton.type = 'button';
    deleteButton.className = 'history-action-button';
    deleteButton.dataset.historyAction = 'delete';
    deleteButton.dataset.historyType = type;
    deleteButton.dataset.historyIndex = String(index);
    deleteButton.title = message('historyDeleteButton');
    deleteButton.setAttribute('aria-label', message('historyDeleteButton'));
    deleteButton.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"></path><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"></path><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg>`;

    row.append(item, renameButton, deleteButton);
    list.append(row);
  });
  menu.append(list);

  const clearButton = document.createElement('button');
  clearButton.type = 'button';
  clearButton.className = 'history-clear';
  clearButton.dataset.historyAction = 'clear';
  clearButton.dataset.historyType = type;
  clearButton.textContent = message('historyClearButton');
  menu.append(clearButton);
}

function openHistoryMenu(type) {
  const config = HISTORY_CONFIG[type];
  const isOpen = openHistoryType === type && !elements[config.menu].hidden;
  closeHistoryMenus();

  if (isOpen) {
    return;
  }

  renderHistoryMenu(type);
  elements[config.menu].hidden = false;
  elements[config.button].setAttribute('aria-expanded', 'true');
  openHistoryType = type;
}

async function useHistoryEntry(type, index) {
  const entry = inputHistory[type]?.[index];
  const config = HISTORY_CONFIG[type];
  if (!entry || !config) {
    return;
  }

  if (type === 'urls') {
    elements[config.input].value = entry.value;
    updateUrlCount();
  } else {
    elements[config.input].value = entry.value;
    updateTemplatePreview();
  }

  await saveSettings();
  closeHistoryMenus();
}

async function deleteHistoryEntry(type, index) {
  if (!inputHistory[type]) {
    return;
  }

  inputHistory[type].splice(index, 1);
  await saveInputHistory();
  renderHistoryMenu(type);
}

async function renameHistoryEntry(type, index) {
  const entry = inputHistory[type]?.[index];
  if (!entry) {
    return;
  }

  const summary = summarizeHistoryValue(entry.value);
  const nextName = window.prompt(message('historyRenamePrompt'), entry.name || summary.title);
  if (nextName === null) {
    return;
  }

  entry.name = nextName.trim();
  entry.updatedAt = new Date().toISOString();
  await saveInputHistory();
  renderHistoryMenu(type);
}

async function clearHistory(type) {
  if (!inputHistory[type]) {
    return;
  }

  inputHistory[type] = [];
  await saveInputHistory();
  renderHistoryMenu(type);
}

function setUrlInputMode(mode, shouldSave = true) {
  urlInputMode = mode === 'template' ? 'template' : 'list';
  elements.urlListPane.hidden = urlInputMode !== 'list';
  elements.urlTemplatePane.hidden = urlInputMode !== 'template';
  elements.captureSettings.hidden = urlInputMode !== 'list';
  elements.urlCountBadge.hidden = urlInputMode !== 'list';
  elements.urlListHistoryButton.hidden = urlInputMode !== 'list';
  elements.listModeButton.classList.toggle('active', urlInputMode === 'list');
  elements.templateModeButton.classList.toggle('active', urlInputMode === 'template');
  elements.listModeButton.setAttribute('aria-selected', String(urlInputMode === 'list'));
  elements.templateModeButton.setAttribute('aria-selected', String(urlInputMode === 'template'));

  if (urlInputMode !== 'list' && openHistoryType === 'urls') {
    closeHistoryMenus();
  }

  if (shouldSave) {
    saveSettings();
  }
}

async function applyTemplateToList() {
  const { urls, errorKey } = buildTemplateUrls();
  if (errorKey) {
    elements.statusText.textContent = message(errorKey);
    return;
  }

  await addHistoryEntry('templates', elements.urlTemplate.value);
  await addHistoryEntry('templateItems', elements.urlTemplateItems.value);
  elements.urlList.value = urls.join('\n');
  updateUrlCount();
  setUrlInputMode('list', false);
  await saveSettings();
}

async function refreshState() {
  const response = await chrome.runtime.sendMessage({ action: 'getState' });
  const isPaused = Boolean(response?.paused);
  const statusKey = response?.running
    ? (isPaused ? 'pausedStatus' : 'runningStatus')
    : 'idleStatus';
  setRunning(Boolean(response?.running), statusKey, isPaused);
  if (response?.statusText) {
    elements.statusText.textContent = response.statusText;
  }
}

async function startCapture() {
  const popupSettings = getSettings();
  const templateResult = urlInputMode === 'template' ? buildTemplateUrls() : null;
  const urls = templateResult ? templateResult.urls : parseUrls(popupSettings.urls);

  if (!urls.length) {
    elements.statusText.textContent = message(templateResult?.errorKey || 'emptyUrlError');
    return;
  }

  const settings = await persistSettings(popupSettings);
  await rememberCurrentInputs();
  setRunning(true);
  await chrome.runtime.sendMessage({
    action: 'startBatch',
    payload: { ...settings, urls }
  });
}

async function captureCurrentTab() {
  const settings = await persistSettings(getSettings());
  setRunning(true, 'currentTabRunningStatus');

  try {
    const response = await chrome.runtime.sendMessage({
      action: 'captureCurrentTab',
      payload: settings
    });

    if (!response?.ok) {
      elements.statusText.textContent = response?.error || message('currentTabErrorStatus');
      setRunning(false);
      return;
    }

    setRunning(false);
    elements.statusText.textContent = message('currentTabDoneStatus');
  } catch (error) {
    elements.statusText.textContent = error.message || message('currentTabErrorStatus');
    setRunning(false);
  }
}

async function captureCurrentWindowTabs() {
  const settings = await persistSettings(getSettings());
  setRunning(true, 'currentWindowTabsRunningStatus');

  try {
    const response = await chrome.runtime.sendMessage({
      action: 'captureCurrentWindowTabs',
      payload: settings
    });

    if (!response?.ok) {
      elements.statusText.textContent = response?.error || message('currentWindowTabsErrorStatus');
      setRunning(false);
      return;
    }

    setRunning(false);
    elements.statusText.textContent = message('currentWindowTabsDoneStatus', String(response.count || 0));
  } catch (error) {
    elements.statusText.textContent = error.message || message('currentWindowTabsErrorStatus');
    setRunning(false);
  }
}

async function stopCapture() {
  elements.statusText.textContent = message('stoppingStatus');
  await chrome.runtime.sendMessage({ action: 'stopBatch' });
}

async function togglePauseCapture() {
  const isPaused = elements.pauseButton.querySelector('.resume-icon').hidden === false;
  setRunning(true, isPaused ? 'runningStatus' : 'pausedStatus', !isPaused);
  const response = await chrome.runtime.sendMessage({ action: 'togglePauseBatch' });

  if (!response?.ok) {
    await refreshState();
  }
}

async function openSettings() {
  await chrome.runtime.openOptionsPage();
}

document.addEventListener('DOMContentLoaded', async () => {
  await loadInputHistory();
  await restoreSettings();
  await refreshState();
});

Object.values(elements).forEach((node) => {
  if (node?.matches?.('textarea,input,select')) {
    node.addEventListener('change', saveSettings);
    node.addEventListener('input', saveSettings);
  }
});

elements.urlList.addEventListener('input', updateUrlCount);
elements.urlList.addEventListener('change', updateUrlCount);

elements.listModeButton.addEventListener('click', () => setUrlInputMode('list'));
elements.templateModeButton.addEventListener('click', () => setUrlInputMode('template'));
elements.urlTemplate.addEventListener('input', updateTemplatePreview);
elements.urlTemplateItems.addEventListener('input', updateTemplatePreview);
elements.applyTemplateButton.addEventListener('click', applyTemplateToList);
Object.entries(HISTORY_CONFIG).forEach(([type, config]) => {
  elements[config.button].addEventListener('click', (event) => {
    event.stopPropagation();
    openHistoryMenu(type);
  });
  elements[config.menu].addEventListener('click', (event) => {
    event.stopPropagation();
    const actionButton = event.target.closest('[data-history-action]');
    if (!actionButton) {
      return;
    }

    const actionType = actionButton.dataset.historyType;
    const index = Number(actionButton.dataset.historyIndex);
    const action = actionButton.dataset.historyAction;

    if (action === 'use') {
      useHistoryEntry(actionType, index);
    } else if (action === 'rename') {
      renameHistoryEntry(actionType, index);
    } else if (action === 'delete') {
      deleteHistoryEntry(actionType, index);
    } else if (action === 'clear') {
      clearHistory(actionType);
    }
  });
});
elements.currentTabButton.addEventListener('click', captureCurrentTab);
elements.currentWindowTabsButton.addEventListener('click', captureCurrentWindowTabs);
elements.startButton.addEventListener('click', startCapture);
elements.pauseButton.addEventListener('click', togglePauseCapture);
elements.stopButton.addEventListener('click', stopCapture);
elements.settingsButton.addEventListener('click', openSettings);

chrome.runtime.onMessage.addListener((message) => {
  if (message.action !== 'batchStatus') return;
  elements.statusText.textContent = message.statusText;
  setRunning(message.running, message.paused ? 'pausedStatus' : 'runningStatus', Boolean(message.paused));
  elements.statusText.textContent = message.statusText;
});

document.addEventListener('click', closeHistoryMenus);

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') {
    closeHistoryMenus();
  }
});
