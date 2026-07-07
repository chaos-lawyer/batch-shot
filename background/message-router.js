export function setupMessageRouter(deps) {
  const {
    chrome,
    getBatchState,
    loadSettings,
    syncActionUi,
    scheduledTasks,
    batchStatus,
    runBatch,
    runPrepareForms,
    captureCurrentTab,
    captureCurrentWindowTabs,
    setStatus,
    statusError,
    statusFromError,
    errorResponse,
    runCaptureJobs,
    waitWhilePaused,
    waitForTabComplete,
    sendTabMessage,
    createReportRow,
    createExplicitJobs,
    createSearchJobs
  } = deps;

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message.action === 'getState') {
      sendResponse(getBatchState());
      return false;
    }

    if (message.action === 'syncActionUi') {
      loadSettings()
        .then(syncActionUi)
        .then(() => sendResponse({ ok: true }))
        .catch((error) => sendResponse(errorResponse(error)));
      return true;
    }

    if (message.action === 'getScheduledBatch') {
      scheduledTasks.getScheduledTasks()
        .then((tasks) => sendResponse({ ok: true, tasks, task: tasks[0] || null }))
        .catch((error) => sendResponse(errorResponse(error)));
      return true;
    }

    if (message.action === 'scheduleBatch') {
      loadSettings()
        .then((settings) => {
          if (!settings.scheduledTasksEnabled) {
            return { ok: false, statusKey: 'scheduledTasksDisabledError', statusArgs: [] };
          }
          return scheduledTasks.scheduleBatch(
            message.payload.options,
            message.payload.scheduledAt,
            message.payload.taskId,
            message.payload.taskName
          );
        })
        .then((response) => sendResponse(response))
        .catch((error) => sendResponse(errorResponse(error, 'scheduledTaskError')));
      return true;
    }

    if (message.action === 'cancelScheduledBatch') {
      scheduledTasks.clearScheduledTask(message.payload?.taskId)
        .then((tasks) => sendResponse({ ok: true, tasks }))
        .catch((error) => sendResponse(errorResponse(error, 'scheduledTaskCancelError')));
      return true;
    }

    if (message.action === 'stopBatch') {
      batchStatus.requestStop();
      sendResponse({ ok: true });
      return false;
    }

    if (message.action === 'togglePauseBatch') {
      if (!batchStatus.togglePause()) {
        sendResponse({ ok: false, statusKey: 'noBatchRunningError', statusArgs: [] });
        return false;
      }
      sendResponse({ ok: true });
      return false;
    }

    if (message.action === 'startBatch') {
      if (getBatchState().running) {
        sendResponse({ ok: false, statusKey: 'batchAlreadyRunningError', statusArgs: [] });
        return false;
      }

      runBatch(message.payload);
      sendResponse({ ok: true });
      return false;
    }

    if (message.action === 'prepareBatchForms') {
      if (getBatchState().running) {
        sendResponse({ ok: false, statusKey: 'batchAlreadyRunningError', statusArgs: [] });
        return false;
      }

      runPrepareForms(message.payload, {
        chrome,
        batchStatus,
        setStatus,
        statusError,
        statusFromError,
        runCaptureJobs,
        waitWhilePaused,
        waitForTabComplete,
        sendTabMessage,
        createReportRow,
        createExplicitJobs,
        createSearchJobs
      });
      sendResponse({ ok: true });
      return false;
    }

    if (message.action === 'captureCurrentTab') {
      captureCurrentTab(message.payload)
        .then(() => sendResponse({ ok: true }))
        .catch((error) => {
          const response = errorResponse(error);
          setStatus(response, false);
          sendResponse(response);
        });
      return true;
    }

    if (message.action === 'captureCurrentWindowTabs') {
      captureCurrentWindowTabs(message.payload)
        .then((count) => sendResponse({ ok: true, count }))
        .catch((error) => {
          const response = errorResponse(error);
          setStatus(response, false);
          sendResponse(response);
        });
      return true;
    }

    return false;
  });
}
