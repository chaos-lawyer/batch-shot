import { message } from '../utils/i18n.js';
import { el, iconButton } from './dom-helpers.js';

const HISTORY_STORAGE_KEY = 'inputHistory';

export const HISTORY_CONFIG = {
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

export function createInputHistory({
  elements,
  getHistoryLimit,
  saveSettings,
  urlInputAdapter,
  setStatus
}) {
  let inputHistory = {
    urls: [],
    templates: [],
    templateItems: []
  };
  let openHistoryType = '';

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
    ].slice(0, getHistoryLimit());
    await saveInputHistory();
    renderHistoryMenu(type);
  }

  async function rememberCurrentInputs() {
    if (urlInputAdapter.getMode() === 'template') {
      await addHistoryEntry('templates', elements.urlTemplate.value);
      await addHistoryEntry('templateItems', elements.urlTemplateItems.value);
      return;
    }

    await addHistoryEntry('urls', elements.urlList.value);
  }

  function closeHistoryMenus(onlyType = '') {
    if (onlyType && openHistoryType !== onlyType) {
      return;
    }

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
      menu.append(el('div', { className: 'history-empty', textContent: message(config.emptyKey) }));
      return;
    }

    const list = el('div', { className: 'history-list' }, entries.map((entry, index) => (
      createHistoryRow(type, entry, index)
    )));
    menu.append(list);
    menu.append(createHistoryClearButton(type));
  }

  function historyDataset(action, type, index) {
    return {
      historyAction: action,
      historyType: type,
      ...(index === undefined ? {} : { historyIndex: String(index) })
    };
  }

  function createHistoryRow(type, entry, index) {
    const summary = summarizeHistoryValue(entry.value);
    return el('div', { className: 'history-row' }, [
      el('button', {
        type: 'button',
        className: 'history-item',
        dataset: historyDataset('use', type, index)
      }, [
        el('span', { className: 'history-title', textContent: entry.name || summary.title }),
        el('span', { className: 'history-meta', textContent: entry.name ? summary.title : summary.meta })
      ]),
      createHistoryAction('rename', type, index),
      createHistoryAction('delete', type, index)
    ]);
  }

  function createHistoryAction(action, type, index) {
    const messageKey = action === 'rename' ? 'historyRenameButton' : 'historyDeleteButton';
    return iconButton({
      className: 'history-action-button',
      title: message(messageKey),
      dataset: historyDataset(action, type, index),
      iconName: action === 'rename' ? 'rename' : 'delete'
    });
  }

  function createHistoryClearButton(type) {
    return el('button', {
      type: 'button',
      className: 'history-clear',
      dataset: historyDataset('clear', type),
      textContent: message('historyClearButton')
    });
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

    const rect = menu.getBoundingClientRect();
    const viewportWidth = document.documentElement.clientWidth || 400;
    const padding = 18;

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

    elements[config.input].value = entry.value;
    if (type === 'urls') {
      urlInputAdapter.updateUrlCount();
    } else {
      urlInputAdapter.updateTemplatePreview();
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

  async function clearInputValue(type) {
    const config = HISTORY_CONFIG[type];
    const input = config ? elements[config.input] : null;
    if (!input?.value.trim()) {
      return;
    }

    input.value = '';
    if (type === 'urls') {
      urlInputAdapter.updateUrlCount();
    } else {
      urlInputAdapter.updateTemplatePreview();
    }

    await saveSettings();
    closeHistoryMenus();
    setStatus(message('inputClearedStatus'));
  }

  function bindHistoryEvents() {
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

    elements.urlListClearButton.addEventListener('click', () => clearInputValue('urls'));
    elements.urlTemplateClearButton.addEventListener('click', () => clearInputValue('templates'));
    elements.urlTemplateItemsClearButton.addEventListener('click', () => clearInputValue('templateItems'));
  }

  return {
    loadInputHistory,
    addHistoryEntry,
    rememberCurrentInputs,
    closeHistoryMenus,
    bindHistoryEvents
  };
}
