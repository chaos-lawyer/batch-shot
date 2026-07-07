import { message } from '../utils/i18n.js';
import { icon } from './dom-helpers.js';

export function createPopupUiState({ elements, hasSelectedLinks, getUrlInputMode }) {
  const batchUiState = {
    running: false,
    paused: false
  };

  const renderStatusText = (text) => {
    elements.statusText.textContent = text;
    elements.statusText.removeAttribute('title');
    if (elements.statusText.scrollHeight > elements.statusText.clientHeight) {
      elements.statusText.title = text;
    }
  };

  function renderActionVisibility(running) {
    const mode = getUrlInputMode ? getUrlInputMode() : 'list';
    elements.openFillButton.hidden = running || mode !== 'template';
  }

  function renderRunningControls({ running, paused }) {
    elements.currentTabButton.disabled = running;
    elements.currentWindowTabsButton.disabled = running;
    elements.extractLinksButton.disabled = running;
    elements.urlListClearButton.disabled = running;
    elements.urlTemplateClearButton.disabled = running;
    elements.urlTemplateItemsClearButton.disabled = running;
    elements.linkSelectorSearch.disabled = running;
    elements.linkSelectorAllButton.disabled = running;
    elements.linkSelectorNoneButton.disabled = running;
    elements.linkSelectorInvertButton.disabled = running;
    elements.linkSelectorApplyButton.disabled = running || !hasSelectedLinks();
    elements.scheduleButton.disabled = running;
    elements.scheduleName.disabled = running;
    elements.scheduleNewButton.disabled = running;
    elements.scheduleSaveButton.disabled = running;
    elements.openFillButton.disabled = running;
    elements.startButton.disabled = running;
    elements.pauseButton.disabled = !running;
    elements.stopButton.disabled = !running;
    const pauseLabel = message(paused ? 'resumeButton' : 'pauseButton');
    elements.pauseButton.title = pauseLabel;
    elements.pauseButton.setAttribute('aria-label', pauseLabel);
    const pauseSvg = elements.pauseButton.querySelector('svg');
    if (pauseSvg) {
      const newIcon = icon(paused ? 'play' : 'pause', 18);
      pauseSvg.replaceWith(newIcon);
    }
    renderActionVisibility(running);
  }

  function setRunning({
    running,
    paused = false,
    statusKey = running ? 'runningStatus' : 'idleStatus',
    statusArgs = [],
    statusText = ''
  }) {
    batchUiState.running = running;
    batchUiState.paused = paused;
    document.body.classList.toggle('is-running', running);
    document.body.classList.toggle('is-paused', running && paused);
    renderRunningControls(batchUiState);
    renderStatusText(statusText || message(statusKey, statusArgs));
  }

  function getBatchUiState() {
    return { ...batchUiState };
  }

  return {
    getBatchUiState,
    renderStatusText,
    setRunning,
    renderActionVisibility: () => renderActionVisibility(batchUiState.running)
  };
}

export function bindAutoSaveEvents(elements, saveSettings) {
  Object.values(elements).forEach((node) => {
    if (node?.matches?.('textarea,input,select') && !node.dataset.skipSave) {
      node.addEventListener('change', saveSettings);
      node.addEventListener('input', saveSettings);
    }
  });
}

export function initTemplateResizing() {
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
      if (height > 0) {
        wrapperA.style.height = `${height}px`;
        wrapperB.style.height = `${height}px`;
      }
    }
    isSyncing = false;
  });

  observer.observe(wrapperA);
  observer.observe(wrapperB);
}
