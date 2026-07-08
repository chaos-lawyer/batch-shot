import { message } from '../utils/i18n.js';
import { el, iconButton, icon } from './dom-helpers.js';

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
  },
  sequentialStartUrls: {
    input: 'sequentialStartUrl',
    button: 'sequentialStartUrlHistoryButton',
    menu: 'sequentialStartUrlHistoryMenu',
    emptyKey: 'historySequentialStartUrlsEmpty'
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
    templateItems: [],
    sequentialStartUrls: []
  };
  let openHistoryType = '';

  function normalizeHistory(history) {
    const normalizeEntries = (entries) => entries
      .filter((entry) => entry?.value)
      .map((entry) => ({
        value: String(entry.value),
        name: String(entry.name || ''),
        updatedAt: entry.updatedAt || '',
        pinned: !!entry.pinned,
        ...(entry.nextSelector !== undefined ? { nextSelector: String(entry.nextSelector) } : {}),
        ...(entry.count !== undefined ? { count: Number(entry.count) } : {})
      }));

    return {
      urls: Array.isArray(history?.urls) ? normalizeEntries(history.urls) : [],
      templates: Array.isArray(history?.templates) ? normalizeEntries(history.templates) : [],
      templateItems: Array.isArray(history?.templateItems) ? normalizeEntries(history.templateItems) : [],
      sequentialStartUrls: Array.isArray(history?.sequentialStartUrls) ? normalizeEntries(history.sequentialStartUrls) : (Array.isArray(history?.sequential) ? normalizeEntries(history.sequential) : [])
    };
  }

  async function loadInputHistory() {
    const stored = await chrome.storage.local.get(HISTORY_STORAGE_KEY);
    inputHistory = normalizeHistory(stored[HISTORY_STORAGE_KEY]);
  }

  async function saveInputHistory() {
    await chrome.storage.local.set({ [HISTORY_STORAGE_KEY]: inputHistory });
  }

  function summarizeHistoryValue(type, entry) {
    const value = entry.value;
    const lines = value
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);
    
    let title = lines[0] || value.trim();
    let meta = lines.length > 1 ? message('historyLineCount', String(lines.length)) : '';

    if (type === 'sequentialStartUrls' && entry.nextSelector) {
      const delimiter = urlInputAdapter.getDelimiter ? urlInputAdapter.getDelimiter() : ' :: ';
      title = `${entry.value}${delimiter}${entry.nextSelector}`;
    }

    return { title, meta };
  }

  async function addHistoryEntry(type, value, extraFields = {}) {
    const trimmed = value.trim();
    if (!trimmed || !HISTORY_CONFIG[type]) {
      return;
    }

    const existing = inputHistory[type].find((entry) => entry.value === trimmed);
    const withoutDuplicate = inputHistory[type].filter((entry) => entry.value !== trimmed);
    const newEntry = {
      value: trimmed,
      name: existing?.name || '',
      updatedAt: new Date().toISOString(),
      pinned: !!existing?.pinned,
      ...extraFields
    };
    
    const newList = [newEntry, ...withoutDuplicate];
    const pinned = newList.filter(e => e.pinned);
    const unpinned = newList.filter(e => !e.pinned).slice(0, getHistoryLimit());
    
    inputHistory[type] = [...pinned, ...unpinned];
    await saveInputHistory();
    renderHistoryMenu(type);
  }

  async function rememberCurrentInputs() {
    if (urlInputAdapter.getMode() === 'template') {
      await addHistoryEntry('templates', elements.urlTemplate.value);
      await addHistoryEntry('templateItems', elements.urlTemplateItems.value);
      return;
    }

    if (urlInputAdapter.getMode() === 'sequential') {
      await addHistoryEntry('sequentialStartUrls', elements.sequentialStartUrl.value, {
        nextSelector: elements.sequentialNextSelector.value.trim(),
        count: Number(elements.sequentialCaptureCount.value) || 3
      });
      return;
    }

    if (urlInputAdapter.getMode() === 'searchBox') {
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
    const summary = summarizeHistoryValue(type, entry);
    const isPinned = entry.pinned;
    
    const props = { className: `history-row${isPinned ? ' is-draggable' : ''}` };
    if (isPinned) {
      props.attrs = { draggable: 'true' };
      props.dataset = { historyType: type, historyIndex: String(index) };
    }

    return el('div', props, [
      isPinned ? el('div', { className: 'history-drag-handle' }, [icon('grip-vertical', 14)]) : el('div', { className: 'history-drag-placeholder' }),
      el('button', {
        type: 'button',
        className: 'history-item',
        dataset: historyDataset('use', type, index)
      }, [
        el('span', { className: 'history-title', textContent: entry.name || summary.title }),
        el('span', { className: 'history-meta', textContent: entry.name ? summary.title : summary.meta })
      ]),
      createHistoryAction('pin', type, index, isPinned),
      createHistoryAction('rename', type, index),
      createHistoryAction('delete', type, index)
    ]);
  }

  function createHistoryAction(action, type, index, isPinned = false) {
    let messageKey, iconName;
    if (action === 'rename') {
      messageKey = 'historyRenameButton';
      iconName = 'rename';
    } else if (action === 'delete') {
      messageKey = 'historyDeleteButton';
      iconName = 'delete';
    } else if (action === 'pin') {
      messageKey = isPinned ? 'historyUnpinButton' : 'historyPinButton';
      iconName = isPinned ? 'pin-filled' : 'pin';
    }
    return iconButton({
      className: `history-action-button ${action === 'pin' && isPinned ? 'is-pinned' : ''}`,
      title: message(messageKey),
      dataset: historyDataset(action, type, index),
      iconName: iconName
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

    if (type === 'sequentialStartUrls') {
      elements.sequentialStartUrl.value = entry.value;
      elements.sequentialStartUrl.dispatchEvent(new Event('input', { bubbles: true }));
      elements.sequentialNextSelector.value = entry.nextSelector || '';
      elements.sequentialNextSelector.dispatchEvent(new Event('input', { bubbles: true }));
      elements.sequentialCaptureCount.value = entry.count || 3;
      elements.sequentialCaptureCount.dispatchEvent(new Event('input', { bubbles: true }));
    } else {
      elements[config.input].value = entry.value;
      elements[config.input].dispatchEvent(new Event('input', { bubbles: true }));
      if (type === 'urls') {
        urlInputAdapter.updateUrlCount();
      } else {
        urlInputAdapter.updateTemplatePreview();
      }
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

    const summary = summarizeHistoryValue(type, entry);
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

    inputHistory[type] = inputHistory[type].filter(e => e.pinned);
    await saveInputHistory();
    renderHistoryMenu(type);
  }

  async function togglePinHistoryEntry(type, index) {
    const entry = inputHistory[type]?.[index];
    if (!entry) {
      return;
    }

    entry.pinned = !entry.pinned;
    
    const pinned = inputHistory[type].filter(e => e.pinned);
    const unpinned = inputHistory[type].filter(e => !e.pinned);
    inputHistory[type] = [...pinned, ...unpinned];
    
    await saveInputHistory();
    renderHistoryMenu(type);
  }

  async function clearInputValue(type) {
    let input;
    if (type === 'sequential') {
      input = elements.sequentialNextSelector;
    } else {
      const config = HISTORY_CONFIG[type];
      input = config ? elements[config.input] : null;
    }
    if (!input?.value.trim()) {
      return;
    }

    input.value = '';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    if (type === 'urls') {
      urlInputAdapter.updateUrlCount();
    } else if (type === 'templates' || type === 'templateItems') {
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
        } else if (action === 'pin') {
          togglePinHistoryEntry(actionType, index);
        } else if (action === 'clear') {
          clearHistory(actionType);
        }
      });

      elements[config.menu].addEventListener('dragstart', (event) => {
        const row = event.target.closest('.history-row.is-draggable');
        if (!row) return;
        event.dataTransfer.effectAllowed = 'move';
        event.dataTransfer.setData('text/plain', row.dataset.historyIndex);
        row.classList.add('is-dragging');
      });

      elements[config.menu].addEventListener('dragover', (event) => {
        const row = event.target.closest('.history-row.is-draggable');
        if (row) {
          event.preventDefault();
          event.dataTransfer.dropEffect = 'move';
          const rect = row.getBoundingClientRect();
          const midY = rect.top + rect.height / 2;
          if (event.clientY < midY) {
            row.classList.add('drag-over-top');
            row.classList.remove('drag-over-bottom');
          } else {
            row.classList.add('drag-over-bottom');
            row.classList.remove('drag-over-top');
          }
        }
      });

      elements[config.menu].addEventListener('dragleave', (event) => {
        const row = event.target.closest('.history-row.is-draggable');
        if (row && !row.contains(event.relatedTarget)) {
          row.classList.remove('drag-over-top', 'drag-over-bottom');
        }
      });

      elements[config.menu].addEventListener('dragend', (event) => {
        const row = event.target.closest('.history-row.is-draggable');
        if (row) row.classList.remove('is-dragging');
        elements[config.menu].querySelectorAll('.history-row').forEach(r => {
          r.classList.remove('drag-over-top', 'drag-over-bottom');
        });
      });

      elements[config.menu].addEventListener('drop', (event) => {
        event.preventDefault();
        const targetRow = event.target.closest('.history-row.is-draggable');
        if (!targetRow) return;
        
        targetRow.classList.remove('drag-over-top', 'drag-over-bottom');
        const fromIndex = parseInt(event.dataTransfer.getData('text/plain'), 10);
        const toIndex = parseInt(targetRow.dataset.historyIndex, 10);
        
        if (isNaN(fromIndex) || isNaN(toIndex) || fromIndex === toIndex) return;
        
        const list = inputHistory[type];
        const rect = targetRow.getBoundingClientRect();
        const midY = rect.top + rect.height / 2;
        let finalIndex = event.clientY < midY ? toIndex : toIndex + 1;
        
        if (fromIndex < finalIndex) {
          finalIndex--;
        }
        
        const [movedItem] = list.splice(fromIndex, 1);
        list.splice(finalIndex, 0, movedItem);
        
        saveInputHistory().then(() => renderHistoryMenu(type));
      });
    });

    elements.urlListClearButton.addEventListener('click', () => clearInputValue('urls'));
    elements.urlTemplateClearButton.addEventListener('click', () => clearInputValue('templates'));
    elements.urlTemplateItemsClearButton.addEventListener('click', () => clearInputValue('templateItems'));
    if (elements.sequentialStartUrlClearButton) {
      elements.sequentialStartUrlClearButton.addEventListener('click', () => clearInputValue('sequentialStartUrls'));
    }
    if (elements.sequentialClearButton) {
      elements.sequentialClearButton.addEventListener('click', () => clearInputValue('sequential'));
    }
  }

  return {
    loadInputHistory,
    addHistoryEntry,
    rememberCurrentInputs,
    closeHistoryMenus,
    bindHistoryEvents
  };
}
