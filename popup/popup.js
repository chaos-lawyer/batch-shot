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
  urlTemplateClearButton: $('urlTemplateClearButton'),
  urlTemplateHistoryMenu: $('urlTemplateHistoryMenu'),
  urlTemplateItems: $('urlTemplateItems'),
  urlTemplateItemsHistoryButton: $('urlTemplateItemsHistoryButton'),
  urlTemplateItemsClearButton: $('urlTemplateItemsClearButton'),
  urlTemplateItemsHistoryMenu: $('urlTemplateItemsHistoryMenu'),
  urlPreviewCount: $('urlPreviewCount'),
  urlPreviewList: $('urlPreviewList'),
  extractLinksButton: $('extractLinksButton'),
  urlListHistoryButton: $('urlListHistoryButton'),
  urlListClearButton: $('urlListClearButton'),
  urlListHistoryMenu: $('urlListHistoryMenu'),
  linkSelectorPanel: $('linkSelectorPanel'),
  linkSelectorSummary: $('linkSelectorSummary'),
  linkSelectorCloseButton: $('linkSelectorCloseButton'),
  linkSelectorSearch: $('linkSelectorSearch'),
  linkSelectorAllButton: $('linkSelectorAllButton'),
  linkSelectorNoneButton: $('linkSelectorNoneButton'),
  linkSelectorInvertButton: $('linkSelectorInvertButton'),
  linkSelectorList: $('linkSelectorList'),
  linkSelectorCancelButton: $('linkSelectorCancelButton'),
  linkSelectorApplyButton: $('linkSelectorApplyButton'),
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
let extractedLinkItems = [];

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
  elements.extractLinksButton.disabled = isRunning;
  elements.urlListClearButton.disabled = isRunning;
  elements.urlTemplateClearButton.disabled = isRunning;
  elements.urlTemplateItemsClearButton.disabled = isRunning;
  elements.linkSelectorSearch.disabled = isRunning;
  elements.linkSelectorAllButton.disabled = isRunning;
  elements.linkSelectorNoneButton.disabled = isRunning;
  elements.linkSelectorInvertButton.disabled = isRunning;
  elements.linkSelectorApplyButton.disabled = isRunning || !extractedLinkItems.some((item) => item.selected);
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

function parseTemplateLines(value) {
  return value
    .split(/\r?\n/)
    .map((line, index) => ({ line: line.trim(), number: index + 1 }))
    .filter((template) => template.line);
}

function updateUrlCount() {
  const count = parseUrls(elements.urlList.value).length;
  elements.urlCountBadge.textContent = count;
  elements.urlCountBadge.classList.toggle('has-data', count > 0);
}

async function clearInputValue(type) {
  const config = HISTORY_CONFIG[type];
  const input = config ? elements[config.input] : null;
  if (!input?.value.trim()) {
    return;
  }

  input.value = '';

  if (type === 'urls') {
    updateUrlCount();
  } else {
    updateTemplatePreview();
  }

  await saveSettings();
  closeHistoryMenus();
  elements.statusText.textContent = message('inputClearedStatus');
}

function getFilteredLinkItems() {
  const query = elements.linkSelectorSearch.value.trim().toLowerCase();
  if (!query) {
    return extractedLinkItems;
  }

  return extractedLinkItems.filter((item) => (
    item.url.toLowerCase().includes(query)
    || item.title.toLowerCase().includes(query)
    || item.host.toLowerCase().includes(query)
  ));
}

function updateLinkSelectorSummary() {
  const selectedCount = extractedLinkItems.filter((item) => item.selected).length;
  elements.linkSelectorSummary.textContent = message(
    'linkSelectorSummary',
    [String(selectedCount), String(extractedLinkItems.length)]
  );
  elements.linkSelectorApplyButton.disabled = selectedCount === 0;
}

function renderLinkSelector() {
  const items = getFilteredLinkItems();
  elements.linkSelectorList.replaceChildren();

  if (!items.length) {
    const empty = document.createElement('p');
    empty.className = 'link-selector-empty';
    empty.textContent = message('linkSelectorEmpty');
    elements.linkSelectorList.append(empty);
    updateLinkSelectorSummary();
    return;
  }

  items.forEach((item) => {
    const row = document.createElement('label');
    row.className = 'link-selector-row';

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = item.selected;
    checkbox.addEventListener('change', () => {
      item.selected = checkbox.checked;
      updateLinkSelectorSummary();
    });

    const body = document.createElement('span');
    const title = document.createElement('span');
    title.className = 'link-selector-title';
    title.textContent = item.title || item.url;

    const host = document.createElement('span');
    host.className = 'link-selector-host';
    host.textContent = item.host;

    const url = document.createElement('span');
    url.className = 'link-selector-url';
    url.textContent = item.url;

    body.append(title, host, url);
    row.append(checkbox, body);
    elements.linkSelectorList.append(row);
  });

  updateLinkSelectorSummary();
}

function showLinkSelector(items) {
  closeHistoryMenus();
  extractedLinkItems = items.map((item) => ({ ...item, selected: true }));
  elements.linkSelectorSearch.value = '';
  renderLinkSelector();
  elements.linkSelectorPanel.hidden = false;
  elements.linkSelectorSearch.focus();
}

function closeLinkSelector() {
  elements.linkSelectorPanel.hidden = true;
}

function setFilteredLinkSelection(getNextSelected) {
  getFilteredLinkItems().forEach((item) => {
    item.selected = getNextSelected(item);
  });
  renderLinkSelector();
}

async function applySelectedLinks() {
  const urls = extractedLinkItems
    .filter((item) => item.selected)
    .map((item) => item.url);

  if (!urls.length) {
    elements.statusText.textContent = message('linkSelectorNoSelectionStatus');
    return;
  }

  if (elements.urlList.value.trim()) {
    await addHistoryEntry('urls', elements.urlList.value);
  }

  elements.urlList.value = urls.join('\n');
  updateUrlCount();
  setUrlInputMode('list', false);
  await saveSettings();
  closeLinkSelector();
  elements.statusText.textContent = message('linkSelectorAppliedStatus', String(urls.length));
}

function buildTemplateUrls() {
  const templates = parseTemplateLines(elements.urlTemplate.value);
  const items = parseUrls(elements.urlTemplateItems.value);

  if (!templates.length && !items.length) {
    return { urls: [], errorKey: 'emptyUrlError' };
  }

  if (!templates.length || !items.length) {
    return { urls: [], errorKey: 'emptyUrlError' };
  }

  const missingPlaceholderLines = templates
    .filter((template) => !template.line.includes('%s'))
    .map((template) => template.number);

  if (missingPlaceholderLines.length) {
    return {
      urls: [],
      errorKey: 'urlTemplateMissingPlaceholderError',
      errorArgs: missingPlaceholderLines.join(', ')
    };
  }

  const entries = templates.flatMap((template) => (
    items.map((item) => ({
      url: template.line.replaceAll('%s', item),
      keyword: item
    }))
  ));

  return {
    urls: entries.map((entry) => entry.url),
    urlContexts: entries.map((entry) => ({ keyword: entry.keyword })),
    errorKey: ''
  };
}

function updateTemplatePreview() {
  const { urls, errorKey, errorArgs } = buildTemplateUrls();
  elements.applyTemplateButton.disabled = Boolean(errorKey);
  elements.urlPreviewList.replaceChildren();

  if (errorKey && (elements.urlTemplate.value || elements.urlTemplateItems.value)) {
    elements.urlPreviewCount.textContent = message(errorKey, errorArgs);
    return;
  }

  elements.urlPreviewCount.textContent = message('urlPreviewCount', String(urls.length));
  urls.slice(0, 4).forEach((url) => {
    const item = document.createElement('li');
    item.textContent = url;
    elements.urlPreviewList.append(item);
  });
}

function extractPageLinks() {
  const containerSelectors = ['main', 'article', '[role="main"]'];
  const containers = containerSelectors
    .flatMap((selector) => Array.from(document.querySelectorAll(selector)))
    .filter((node) => node instanceof HTMLElement);
  const scope = containers.length ? containers : [document.body].filter(Boolean);
  const ignoredRegionSelector = 'header, nav, footer, aside, script, style, noscript, template';
  const currentUrl = new URL(location.href);
  currentUrl.hash = '';
  const seen = new Set();

  return scope
    .flatMap((node) => Array.from(node.querySelectorAll('a[href]')))
    .filter((anchor) => !anchor.closest(ignoredRegionSelector))
    .filter((anchor) => {
      const rects = anchor.getClientRects();
      return rects.length > 0 && getComputedStyle(anchor).visibility !== 'hidden';
    })
    .map((anchor) => {
      const rawHref = anchor.getAttribute('href')?.trim() || '';
      if (!rawHref || rawHref.startsWith('#')) {
        return null;
      }

      try {
        const url = new URL(rawHref, document.baseURI);
        if (!['http:', 'https:'].includes(url.protocol)) {
          return null;
        }
        url.hash = '';
        return {
          url: url.href,
          host: url.hostname.replace(/^www\./, ''),
          title: (anchor.textContent || '').replace(/\s+/g, ' ').trim()
        };
      } catch {
        return null;
      }
    })
    .filter((item) => item && item.url !== currentUrl.href)
    .filter((item) => {
      if (seen.has(item.url)) {
        return false;
      }
      seen.add(item.url);
      return true;
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
    const el = elements[menu];
    el.hidden = true;
    el.style.left = '';
    el.style.right = '';
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
  const menu = elements[config.menu];
  menu.hidden = false;

  // Adjust position to avoid overflowing the viewport
  const rect = menu.getBoundingClientRect();
  const viewportWidth = document.documentElement.clientWidth || 400;
  const padding = 18; // page margin

  if (rect.left < padding) {
    const anchorRect = menu.parentElement.getBoundingClientRect();
    menu.style.left = `${padding - anchorRect.left}px`;
    menu.style.right = 'auto';
  } else if (rect.right > viewportWidth - padding) {
    const anchorRect = menu.parentElement.getBoundingClientRect();
    menu.style.right = `${anchorRect.right - (viewportWidth - padding)}px`;
    menu.style.left = 'auto';
  }

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
  elements.extractLinksButton.hidden = urlInputMode !== 'list';
  elements.urlListHistoryButton.hidden = urlInputMode !== 'list';
  elements.urlListClearButton.hidden = urlInputMode !== 'list';
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
  const { urls, errorKey, errorArgs } = buildTemplateUrls();
  if (errorKey) {
    elements.statusText.textContent = message(errorKey, errorArgs);
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
  const urlContexts = templateResult ? templateResult.urlContexts : [];

  if (!urls.length) {
    elements.statusText.textContent = message(
      templateResult?.errorKey || 'emptyUrlError',
      templateResult?.errorArgs
    );
    return;
  }

  const settings = await persistSettings(popupSettings);
  await rememberCurrentInputs();
  setRunning(true);
  await chrome.runtime.sendMessage({
    action: 'startBatch',
    payload: { ...settings, urls, urlContexts }
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

async function extractLinksFromCurrentPage() {
  elements.statusText.textContent = message('extractingLinksStatus');
  elements.extractLinksButton.disabled = true;

  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id || !/^https?:\/\//.test(tab.url || '')) {
      elements.statusText.textContent = message('extractLinksUnsupportedPageStatus');
      return;
    }

    const [result] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: extractPageLinks
    });
    const links = Array.isArray(result?.result) ? result.result : [];

    if (!links.length) {
      elements.statusText.textContent = message('noLinksExtractedStatus');
      return;
    }

    showLinkSelector(links);
    elements.statusText.textContent = message('extractedLinksStatus', String(links.length));
  } catch (error) {
    elements.statusText.textContent = error.message || message('extractLinksErrorStatus');
  } finally {
    elements.extractLinksButton.disabled = false;
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

function initTemplateResizing() {
  const wrappers = document.querySelectorAll('.template-textarea-wrapper');
  if (wrappers.length !== 2) {
    return;
  }
  const [wrapperA, wrapperB] = wrappers;
  let isSyncing = false;

  const observer = new ResizeObserver((entries) => {
    if (isSyncing) return;
    isSyncing = true;
    for (const entry of entries) {
      const height = entry.target.getBoundingClientRect().height;
      if (height === 0) {
        continue;
      }
      wrapperA.style.height = `${height}px`;
      wrapperB.style.height = `${height}px`;
    }
    isSyncing = false;
  });

  observer.observe(wrapperA);
  observer.observe(wrapperB);
}

document.addEventListener('DOMContentLoaded', async () => {
  await loadInputHistory();
  await restoreSettings();
  await refreshState();
  initTemplateResizing();
});

Object.values(elements).forEach((node) => {
  if (node?.matches?.('textarea,input,select') && !node.dataset.skipSave) {
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
elements.extractLinksButton.addEventListener('click', extractLinksFromCurrentPage);
elements.urlListClearButton.addEventListener('click', () => clearInputValue('urls'));
elements.urlTemplateClearButton.addEventListener('click', () => clearInputValue('templates'));
elements.urlTemplateItemsClearButton.addEventListener('click', () => clearInputValue('templateItems'));
elements.linkSelectorSearch.addEventListener('input', renderLinkSelector);
elements.linkSelectorAllButton.addEventListener('click', () => setFilteredLinkSelection(() => true));
elements.linkSelectorNoneButton.addEventListener('click', () => setFilteredLinkSelection(() => false));
elements.linkSelectorInvertButton.addEventListener('click', () => setFilteredLinkSelection((item) => !item.selected));
elements.linkSelectorApplyButton.addEventListener('click', applySelectedLinks);
elements.linkSelectorCancelButton.addEventListener('click', closeLinkSelector);
elements.linkSelectorCloseButton.addEventListener('click', closeLinkSelector);
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
    if (!elements.linkSelectorPanel.hidden) {
      closeLinkSelector();
      return;
    }
    closeHistoryMenus();
  }
});
