import { loadSettings, saveSettings, DEFAULT_URL_TEMPLATE_DELIMITER } from '../utils/settings.js';
import { createBatchStatusState, runCaptureJobs, createReportRow } from './capture-flow.js';
import { runPrepareForms } from './form-prep-runner.js';
import { setupMessageRouter } from './message-router.js';
import { createScheduledTaskController } from './scheduled-task.js';
import { statusFromError, statusError, errorResponse } from './status-error.js';
import { captureCurrentTab, captureCurrentWindowTabs, runBatch, captureCurrentTabSequence, openCurrentTabSequence } from './capture-page-runner.js';
import { getActiveCapturableTab, sendTabMessage, waitForTabComplete } from './tab-utils.js';
import { createExplicitJobs, createSearchJobs, createUrlJobs } from './job-factory.js';
import {
  PREPARED_TAB_CONTEXT_ALARM,
  cleanupPreparedTabContexts,
  clearPreparedTabContextsForTabIds,
  ensurePreparedTabContextCleanupAlarm,
  getPreparedTabContextsForTabs,
  rememberPreparedTabContext
} from './prepared-tab-context.js';
import {
  clearTaskHistoryAlerts,
  finishCaptureTaskHistory,
  getRetryAllOptions,
  getRetryOptions,
  getTaskHistory,
  saveCaptureTaskHistory,
  startCaptureTaskHistory,
  updateCaptureTaskHistory,
  ignoreTaskHistoryRow
} from './task-history.js';

import {
  syncActionUi,
  syncActionPopup,
  openActionPopupFromMenu,
  openDetachedPopup,
  appendSearchTemplateFromContextMenu,
  setNextPageSelectorFromContextMenu,
  ACTION_MENU_OPEN_POPUP,
  ACTION_MENU_OPEN_DETACHED,
  ACTION_MENU_ADD_SEARCH_TEMPLATE,
  ACTION_MENU_SET_NEXT_PAGE
} from './action-ui.js';

const batchStatus = createBatchStatusState((state) => {
  chrome.runtime.sendMessage({ action: 'batchStatus', ...state }).catch(() => {});
});

const getBatchState = () => batchStatus.getState();
const setStatus = (...args) => batchStatus.setStatus(...args);

const waitWhilePaused = () => new Promise((resolve) => {
  const check = () => {
    if (getBatchState().paused && !getBatchState().stopping) {
      setTimeout(check, 250);
    } else {
      resolve();
    }
  };
  check();
});

function getActionUiDeps() {
  return {
    chrome,
    loadSettings,
    saveSettings,
    setStatus,
    statusFromError,
    statusError,
    sendTabMessage: (tabId, message) => sendTabMessage(tabId, message, { chrome }),
    DEFAULT_URL_TEMPLATE_DELIMITER
  };
}

function getCaptureRunnerDeps() {
  return {
    chrome,
    batchStatus,
    getPreparedTabContextsForTabs: (tabs) => getPreparedTabContextsForTabs(chrome, tabs),
    clearPreparedTabContextsForTabIds: (tabIds) => clearPreparedTabContextsForTabIds(chrome, tabIds),
    startCaptureTaskHistory: (task) => startCaptureTaskHistory(task, chrome),
    updateCaptureTaskHistory: (taskId, row) => updateCaptureTaskHistory(taskId, row, chrome),
    finishCaptureTaskHistory: (taskId, result) => finishCaptureTaskHistory(taskId, result, chrome),
    saveCaptureTaskHistory: (task) => saveCaptureTaskHistory(task, chrome)
  };
}

const scheduledTasks = createScheduledTaskController({
  getBatchState,
  runBatch: (options) => runBatch(options, getCaptureRunnerDeps()),
  setStatus
});

async function restoreScheduledAlarmIfEnabled(settings) {
  if (!settings.scheduledTasksEnabled) {
    return scheduledTasks.clearScheduledAlarms();
  }
  return scheduledTasks.restoreScheduledAlarm();
}

setupMessageRouter({
  chrome,
  getBatchState,
  loadSettings,
  saveSettings,
  openActionPopupFromMenu: () => openActionPopupFromMenu(getActionUiDeps()),
  syncActionUi: (settings) => syncActionUi(chrome, settings),
  scheduledTasks,
  getTaskHistory: () => getTaskHistory(chrome),
  getRetryAllOptions: () => getRetryAllOptions(chrome),
  getRetryOptions: (taskId) => getRetryOptions(taskId, chrome),
  clearTaskHistoryAlerts: () => clearTaskHistoryAlerts(chrome),
  ignoreTaskHistoryRow: (taskId, url) => ignoreTaskHistoryRow(taskId, url, chrome),
  batchStatus,
  runBatch: (options) => runBatch(options, getCaptureRunnerDeps()),
  runPrepareForms,
  captureCurrentTab: (options) => captureCurrentTab(options, getCaptureRunnerDeps()),
  captureCurrentWindowTabs: (options) => captureCurrentWindowTabs(options, getCaptureRunnerDeps()),
  captureCurrentTabSequence: (options) => captureCurrentTabSequence(options, getCaptureRunnerDeps()),
  openCurrentTabSequence: (options) => openCurrentTabSequence(options, getCaptureRunnerDeps()),
  setStatus,
  statusError,
  statusFromError,
  errorResponse,
  runCaptureJobs,
  waitWhilePaused,
  waitForTabComplete,
  sendTabMessage,
  rememberPreparedTabContext: (tab, job) => rememberPreparedTabContext(chrome, tab, job),
  getActiveCapturableTab,
  createReportRow,
  createUrlJobs,
  createExplicitJobs,
  createSearchJobs
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === PREPARED_TAB_CONTEXT_ALARM) {
    cleanupPreparedTabContexts(chrome)
      .catch((error) => setStatus(statusFromError(error), false));
    return;
  }

  loadSettings()
    .then((settings) => {
      if (settings.scheduledTasksEnabled) {
        return scheduledTasks.handleAlarm(alarm);
      }
    })
    .catch((error) => setStatus(statusFromError(error), false));
});

if (chrome.tabs.onRemoved?.addListener) {
  chrome.tabs.onRemoved.addListener((tabId) => {
    clearPreparedTabContextsForTabIds(chrome, [tabId])
      .catch((error) => setStatus(statusFromError(error), false));
  });
}

chrome.action.onClicked.addListener(() => {
  loadSettings()
    .then(async (settings) => {
      await syncActionPopup(chrome, settings);

      if (settings.iconClickAction === 'popup') {
        if (chrome.action.openPopup) {
          await chrome.action.openPopup();
        }
        return;
      }

      if (settings.iconClickAction === 'captureAllPages') {
        await captureCurrentWindowTabs(settings, getCaptureRunnerDeps());
        return;
      }

      await captureCurrentTab(settings, getCaptureRunnerDeps());
    })
    .catch((error) => setStatus(statusFromError(error), false));
});

chrome.commands.onCommand.addListener((command) => {
  if (command !== 'capture-current-page' && command !== 'capture-current-window') {
    return;
  }

  loadSettings()
    .then((settings) => {
      if (command === 'capture-current-window') {
        return captureCurrentWindowTabs(settings, getCaptureRunnerDeps());
      }
      return captureCurrentTab(settings, getCaptureRunnerDeps());
    })
    .catch((error) => setStatus(statusFromError(error), false));
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === ACTION_MENU_ADD_SEARCH_TEMPLATE) {
    Promise.resolve(appendSearchTemplateFromContextMenu(tab, getActionUiDeps()))
      .catch((error) => setStatus(statusFromError(error), false));
    return;
  }

  if (info.menuItemId === ACTION_MENU_SET_NEXT_PAGE) {
    Promise.resolve(setNextPageSelectorFromContextMenu(tab, getActionUiDeps()))
      .catch((error) => setStatus(statusFromError(error), false));
    return;
  }

  if (info.menuItemId === ACTION_MENU_OPEN_POPUP) {
    openActionPopupFromMenu(getActionUiDeps())
      .catch((error) => setStatus(statusFromError(error), false));
    return;
  }

  if (info.menuItemId === ACTION_MENU_OPEN_DETACHED) {
    openDetachedPopup(chrome)
      .catch((error) => setStatus(statusFromError(error), false));
    return;
  }
});

chrome.runtime.onInstalled.addListener(() => {
  loadSettings()
    .then(async (settings) => {
      await syncActionUi(chrome, settings);
      await restoreScheduledAlarmIfEnabled(settings);
      await ensurePreparedTabContextCleanupAlarm(chrome);
    })
    .catch((error) => setStatus(statusFromError(error), false));
});

chrome.runtime.onStartup.addListener(() => {
  loadSettings()
    .then(async (settings) => {
      await syncActionUi(chrome, settings);
      await restoreScheduledAlarmIfEnabled(settings);
      await ensurePreparedTabContextCleanupAlarm(chrome);
    })
    .catch((error) => setStatus(statusFromError(error), false));
});

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName !== 'local' || !changes.settings) {
    return;
  }

  loadSettings()
    .then(async (settings) => {
      await syncActionUi(chrome, settings);
      await restoreScheduledAlarmIfEnabled(settings);
    })
    .catch((error) => setStatus(statusFromError(error), false));
});

loadSettings()
  .then(async (settings) => {
    await syncActionUi(chrome, settings);
    await restoreScheduledAlarmIfEnabled(settings);
    await ensurePreparedTabContextCleanupAlarm(chrome);
  })
  .catch((error) => setStatus(statusFromError(error), false));
