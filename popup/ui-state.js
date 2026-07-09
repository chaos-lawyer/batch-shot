import { message } from '../utils/i18n.js';
import { icon } from './dom-helpers.js';

export function createPopupUiState({ elements, hasSelectedLinks, getUrlInputMode }) {
  const isDetached = new URLSearchParams(window.location.search).get('detached') === 'true';

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
    elements.openFillButton.hidden = running || !['list', 'template', 'sequential'].includes(mode);
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
    
    if (elements.sequentialStartUrlHistoryButton) elements.sequentialStartUrlHistoryButton.disabled = running;
    if (elements.sequentialStartUrlClearButton) elements.sequentialStartUrlClearButton.disabled = running;
    if (elements.sequentialClearButton) elements.sequentialClearButton.disabled = running;
    elements.sequentialNextSelector.disabled = running;
    elements.sequentialCaptureCount.disabled = running;
    elements.detectNextPageButton.disabled = running;
    elements.pickNextPageButton.disabled = running;
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

  function renderDashboardLog(logs, currentUrl) {
    if (!elements.dashboardLogList || !logs) {
      return;
    }

    elements.dashboardLogList.innerHTML = '';
    logs.forEach((log) => {
      const logItem = document.createElement('div');
      logItem.className = 'log-item';
      
      const iconSpan = document.createElement('span');
      iconSpan.className = `log-icon ${log.status === 'ok' ? 'success' : 'error'}`;
      
      const contentDiv = document.createElement('div');
      contentDiv.className = 'log-content';
      
      const titleSpan = document.createElement('span');
      titleSpan.className = 'log-title';
      let displayName = log.title || '';
      if (!displayName && log.url) {
        try {
          displayName = new URL(log.url).hostname;
        } catch (e) {
          displayName = log.url;
        }
      }
      titleSpan.textContent = displayName || log.url || 'Page';
      
      if (log.status !== 'ok') {
        titleSpan.textContent += ` - ${message(log.error) || log.error || 'Failed'}`;
      }
      
      contentDiv.appendChild(titleSpan);
      
      if (log.url) {
        const urlSpan = document.createElement('span');
        urlSpan.className = 'log-url';
        urlSpan.textContent = log.url;
        contentDiv.appendChild(urlSpan);
      }
      
      logItem.appendChild(iconSpan);
      logItem.appendChild(contentDiv);
      
      elements.dashboardLogList.appendChild(logItem);
    });

    if (currentUrl) {
      const logItem = document.createElement('div');
      logItem.className = 'log-item capturing';
      
      const iconSpan = document.createElement('span');
      iconSpan.className = 'log-icon capturing';
      
      const contentDiv = document.createElement('div');
      contentDiv.className = 'log-content';
      
      const titleSpan = document.createElement('span');
      titleSpan.className = 'log-title';
      let displayName = '';
      try {
        displayName = new URL(currentUrl).hostname;
      } catch (e) {
        displayName = currentUrl;
      }
      titleSpan.textContent = displayName || 'Page';
      titleSpan.textContent += ` - ${message('dashboardLogStatusCapturing') || 'Capturing...'}`;
      
      contentDiv.appendChild(titleSpan);
      
      const urlSpan = document.createElement('span');
      urlSpan.className = 'log-url';
      urlSpan.textContent = currentUrl;
      contentDiv.appendChild(urlSpan);
      
      logItem.appendChild(iconSpan);
      logItem.appendChild(contentDiv);
      
      elements.dashboardLogList.appendChild(logItem);
    }

    const container = elements.dashboardLogList.parentElement;
    if (container) {
      container.scrollTop = container.scrollHeight;
    }
  }

  function renderDashboard({ running, completed, statusKey, statusArgs, logs, total }) {
    if (!elements.dashboardPanel || elements.dashboardPanel.hidden) {
      return;
    }

    let currentProgress = 0;
    let totalProgress = total || 0;

    if (statusKey === 'batchProgressStatus' && statusArgs.length >= 2) {
      currentProgress = Number(statusArgs[0]) || 0;
      totalProgress = Number(statusArgs[1]) || totalProgress;
    } else if (logs && logs.length > 0) {
      currentProgress = logs.length;
    }

    if (totalProgress > 0) {
      if (elements.dashboardProgressText) {
        elements.dashboardProgressText.textContent = `${currentProgress} / ${totalProgress}`;
      }
      if (elements.dashboardProgressBar) {
        const pct = Math.min(100, Math.max(0, (currentProgress / totalProgress) * 100));
        elements.dashboardProgressBar.style.width = `${pct}%`;
      }
    } else {
      if (elements.dashboardProgressText) {
        elements.dashboardProgressText.textContent = '-- / --';
      }
      if (elements.dashboardProgressBar) {
        elements.dashboardProgressBar.style.width = '0%';
      }
    }

    const currentUrl = (running && !completed && statusArgs && statusArgs[2]) ? statusArgs[2] : null;
    renderDashboardLog(logs, currentUrl);
  }

  function setRunning({
    running,
    paused = false,
    statusKey = running ? 'runningStatus' : 'idleStatus',
    statusArgs = [],
    statusText = '',
    logs = [],
    total = 0,
    completed = false
  }) {
    batchUiState.running = running;
    batchUiState.paused = paused;
    document.body.classList.toggle('is-running', running);
    document.body.classList.toggle('is-paused', running && paused);
    renderRunningControls(batchUiState);
    renderStatusText(statusText || message(statusKey, statusArgs));

    const showDashboard = running || completed;
    if (elements.dashboardPanel && elements.urlSection) {
      elements.dashboardPanel.hidden = !showDashboard;
      elements.urlSection.hidden = showDashboard;
      if (elements.captureSettings) {
        elements.captureSettings.hidden = showDashboard;
      }
    }

    if (elements.dashboardCloseButton) {
      elements.dashboardCloseButton.hidden = !completed;
    }

    if (elements.currentTabButton) {
      elements.currentTabButton.hidden = showDashboard;
    }
    if (elements.currentWindowTabsButton) {
      elements.currentWindowTabsButton.hidden = showDashboard;
    }

    renderDashboard({ running, completed, statusKey, statusArgs, logs, total });
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
  const wrappers = document.querySelectorAll('#urlTemplatePane .template-textarea-wrapper');
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
