import { message } from '../utils/i18n.js';
import { buildBatchOptions } from './batch-options.js';

export function createCaptureActions({
  elements,
  persistSettings,
  getSettings,
  getUrlInputMode,
  parseUrls,
  buildTemplateUrls,
  rememberCurrentInputs,
  getBatchUiState,
  setRunning,
  refreshState,
  setStatus
}) {
  function responseStatus(response, fallbackKey) {
    if (response?.statusKey) {
      return message(response.statusKey, response.statusArgs || []);
    }

    return response?.error || message(fallbackKey);
  }

  async function startSequentialCapture() {
    const popupSettings = getSettings();
    const selector = elements.sequentialNextSelector.value.trim();
    const count = Number(elements.sequentialCaptureCount.value) || 3;

    const settings = await persistSettings({
      ...popupSettings,
      sequentialNextSelector: selector,
      sequentialCaptureCount: count
    });
    await rememberCurrentInputs();

    setRunning({ running: true, statusKey: 'sequentialRunningStatus' });
    try {
      const response = await chrome.runtime.sendMessage({
        action: 'captureCurrentTabSequence',
        payload: {
          ...settings,
          sequentialNextSelector: selector,
          sequentialCaptureCount: count
        }
      });

      if (!response?.ok) {
        setStatus(responseStatus(response, 'unknownCaptureError'));
        setRunning({ running: false });
        return;
      }

      setRunning({ running: false });
    } catch (error) {
      setStatus(error.message || message('unknownCaptureError'));
      setRunning({ running: false });
    }
  }

  async function startCapture() {
    if (getUrlInputMode() === 'sequential') {
      await startSequentialCapture();
      return;
    }

    const popupSettings = getSettings();
    const batchResult = buildBatchOptions(popupSettings, getUrlInputMode(), parseUrls, buildTemplateUrls);

    if (!batchResult.options) {
      setStatus(message(batchResult.errorKey, batchResult.errorArgs));
      return;
    }

    const settings = await persistSettings(popupSettings);
    await rememberCurrentInputs();
    setRunning({ running: true });
    const response = await chrome.runtime.sendMessage({
      action: 'startBatch',
      payload: { ...settings, ...batchResult.options }
    });

    if (!response?.ok) {
      setStatus(responseStatus(response, 'unknownCaptureError'));
      setRunning({ running: false });
    }
  }

  async function openAndFillForms() {
    if (getUrlInputMode() === 'sequential') {
      await openSequentialLinks();
      return;
    }

    const popupSettings = getSettings();
    const batchResult = buildBatchOptions(
      popupSettings,
      getUrlInputMode(),
      parseUrls,
      buildTemplateUrls,
      { fillOnly: true }
    );

    if (!batchResult.options) {
      setStatus(message(batchResult.errorKey, batchResult.errorArgs));
      return;
    }

    const settings = await persistSettings(popupSettings);
    await rememberCurrentInputs();
    setRunning({ running: true, statusKey: 'openFillRunningStatus' });
    const response = await chrome.runtime.sendMessage({
      action: 'prepareBatchForms',
      payload: { ...settings, ...batchResult.options }
    });

    if (!response?.ok) {
      setStatus(responseStatus(response, 'unknownCaptureError'));
      setRunning({ running: false });
    }
  }

  async function openSequentialLinks() {
    const popupSettings = getSettings();
    const selector = elements.sequentialNextSelector.value.trim();
    const count = Number(elements.sequentialCaptureCount.value) || 3;
    const settings = await persistSettings({
      ...popupSettings,
      sequentialNextSelector: selector,
      sequentialCaptureCount: count
    });

    await rememberCurrentInputs();
    setRunning({ running: true, statusKey: 'sequentialOpenRunningStatus' });

    try {
      const response = await chrome.runtime.sendMessage({
        action: 'openCurrentTabSequence',
        payload: {
          ...settings,
          sequentialNextSelector: selector,
          sequentialCaptureCount: count
        }
      });

      if (!response?.ok) {
        setStatus(responseStatus(response, 'unknownCaptureError'));
        setRunning({ running: false });
      }
    } catch (error) {
      setStatus(error.message || message('unknownCaptureError'));
      setRunning({ running: false });
    }
  }

  async function captureCurrentTab() {
    const settings = await persistSettings(getSettings());
    setRunning({ running: true, statusKey: 'currentTabRunningStatus' });

    try {
      const response = await chrome.runtime.sendMessage({
        action: 'captureCurrentTab',
        payload: settings
      });

      if (!response?.ok) {
        setStatus(responseStatus(response, 'currentTabErrorStatus'));
        setRunning({ running: false });
        return;
      }

      setRunning({ running: false });
      setStatus(message('currentTabDoneStatus'));
    } catch (error) {
      setStatus(error.message || message('currentTabErrorStatus'));
      setRunning({ running: false });
    }
  }

  async function captureCurrentWindowTabs() {
    const settings = await persistSettings(getSettings());
    setRunning({ running: true, statusKey: 'currentWindowTabsRunningStatus' });

    try {
      const response = await chrome.runtime.sendMessage({
        action: 'captureCurrentWindowTabs',
        payload: settings
      });

      if (!response?.ok) {
        setStatus(responseStatus(response, 'currentWindowTabsErrorStatus'));
        setRunning({ running: false });
        return;
      }

      setRunning({ running: false });
      setStatus(message('currentWindowTabsDoneStatus', String(response.count || 0)));
    } catch (error) {
      setStatus(error.message || message('currentWindowTabsErrorStatus'));
      setRunning({ running: false });
    }
  }

  async function stopCapture() {
    setStatus(message('stoppingStatus'));
    await chrome.runtime.sendMessage({ action: 'stopBatch' });
  }

  async function togglePauseCapture() {
    const { running, paused } = getBatchUiState();
    if (!running) {
      await refreshState();
      return;
    }

    setRunning({
      running: true,
      paused: !paused,
      statusKey: paused ? 'runningStatus' : 'pausedStatus'
    });

    const response = await chrome.runtime.sendMessage({ action: 'togglePauseBatch' });

    if (!response?.ok) {
      await refreshState();
    }
  }

  async function openSettings() {
    await chrome.runtime.openOptionsPage();
  }

  async function openHelp() {
    await chrome.tabs.create({ url: chrome.runtime.getURL('help/help.html') });
  }

  function bindCaptureEvents() {
    elements.currentTabButton.addEventListener('click', captureCurrentTab);
    elements.currentWindowTabsButton.addEventListener('click', captureCurrentWindowTabs);
    elements.openFillButton.addEventListener('click', openAndFillForms);
    elements.startButton.addEventListener('click', startCapture);
    elements.pauseButton.addEventListener('click', togglePauseCapture);
    elements.stopButton.addEventListener('click', stopCapture);
    elements.settingsButton.addEventListener('click', openSettings);
    elements.helpButton.addEventListener('click', openHelp);
  }

  return {
    bindCaptureEvents
  };
}
