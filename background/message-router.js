export function setupMessageRouter(deps) {
  const {
    chrome,
    getBatchState,
    loadSettings,
    saveSettings,
    sendWebhook,
    openActionPopupFromMenu,
    syncActionUi,
    scheduledTasks,
    getTaskHistory,
    getRetryAllOptions,
    getRetryOptions,
    clearTaskHistoryAlerts,
    ignoreTaskHistoryRow,
    batchStatus,
    runBatch,
    runPrepareForms,
    captureCurrentTab,
    captureCurrentWindowTabs,
    captureCurrentTabSequence,
    openCurrentTabSequence,
    setStatus,
    statusError,
    statusFromError,
    errorResponse,
    runCaptureJobs,
    waitWhilePaused,
    waitForTabComplete,
    sendTabMessage,
    rememberPreparedTabContext,
    getActiveCapturableTab,
    createReportRow,
    createUrlJobs,
    createExplicitJobs,
    createSearchJobs
  } = deps;

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message.action === 'getState') {
      sendResponse(getBatchState());
      return false;
    }

    if (message.action === 'clearCompletedStatus') {
      batchStatus.clearCompleted();
      sendResponse({ ok: true });
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

    if (message.action === 'getTaskHistory') {
      getTaskHistory()
        .then((tasks) => sendResponse({ ok: true, tasks }))
        .catch((error) => sendResponse(errorResponse(error)));
      return true;
    }

    if (message.action === 'retryFailedTask') {
      if (getBatchState().running) {
        sendResponse({ ok: false, statusKey: 'batchAlreadyRunningError', statusArgs: [] });
        return false;
      }

      getRetryOptions(message.payload?.taskId)
        .then((retryOptions) => {
          if (!retryOptions?.jobs?.length) {
            sendResponse({ ok: false, statusKey: 'taskHistoryNoRetryableFailures', statusArgs: [] });
            return;
          }

          runBatch(retryOptions);
          sendResponse({ ok: true, count: retryOptions.jobs.length });
        })
        .catch((error) => sendResponse(errorResponse(error)));
      return true;
    }

    if (message.action === 'retryAllFailedTasks') {
      if (getBatchState().running) {
        sendResponse({ ok: false, statusKey: 'batchAlreadyRunningError', statusArgs: [] });
        return false;
      }

      getRetryAllOptions()
        .then((retryOptions) => {
          if (!retryOptions?.jobs?.length) {
            sendResponse({ ok: false, statusKey: 'taskHistoryNoRetryableFailures', statusArgs: [] });
            return;
          }

          runBatch(retryOptions);
          sendResponse({ ok: true, count: retryOptions.jobs.length });
        })
        .catch((error) => sendResponse(errorResponse(error)));
      return true;
    }

    if (message.action === 'clearTaskHistoryAlerts') {
      clearTaskHistoryAlerts()
        .then((tasks) => sendResponse({ ok: true, tasks }))
        .catch((error) => sendResponse(errorResponse(error)));
      return true;
    }

    if (message.action === 'ignoreTaskHistoryRow') {
      const { taskId, url } = message.payload || {};
      ignoreTaskHistoryRow(taskId, url)
        .then((task) => sendResponse({ ok: true, task }))
        .catch((error) => sendResponse(errorResponse(error)));
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
        rememberPreparedTabContext,
        createReportRow,
        createUrlJobs,
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

    if (message.action === 'captureCurrentTabSequence') {
      captureCurrentTabSequence(message.payload)
        .then((count) => sendResponse({ ok: true, count }))
        .catch((error) => {
          const response = errorResponse(error);
          if (error && error.successful !== undefined) {
            response.successful = error.successful;
            response.failed = error.failed;
          }
          setStatus(response, false);
          sendResponse(response);
        });
      return true;
    }

    if (message.action === 'openCurrentTabSequence') {
      openCurrentTabSequence(message.payload)
        .then((count) => sendResponse({ ok: true, count }))
        .catch((error) => {
          const response = errorResponse(error);
          setStatus(response, false);
          sendResponse(response);
        });
      return true;
    }

    if (message.action === 'detectNextPage') {
      getActiveCapturableTab(chrome)
        .then((tab) => {
          if (!tab?.id) {
            sendResponse({ ok: false, statusKey: 'noActivePageError' });
            return;
          }
          return sendTabMessage(tab.id, { action: 'detectNextPage' }, deps)
            .then((res) => sendResponse(res));
        })
        .catch((error) => sendResponse(errorResponse(error, 'nextPageNotFoundError')));
      return true;
    }

    if (message.action === 'pickNextPageSelector') {
      getActiveCapturableTab(chrome)
        .then((tab) => {
          if (!tab?.id) {
            sendResponse({ ok: false, statusKey: 'noActivePageError' });
            return;
          }
          return sendTabMessage(tab.id, { action: 'pickNextPageSelector', payload: message.payload }, deps)
            .then((res) => sendResponse(res));
        })
        .catch((error) => sendResponse(errorResponse(error, 'nextPageSelectorError')));
      return true;
    }

    if (message.action === 'pickNextPageSelectorFromPopup') {
      getActiveCapturableTab(chrome)
        .then(async (tab) => {
          if (!tab?.id) {
            return;
          }
          const res = await sendTabMessage(tab.id, { action: 'pickNextPageSelector', payload: message.payload }, deps);
          if (res?.cancelled) {
            await openActionPopupFromMenu();
            return;
          }
          if (res?.ok && res.selector) {
            await saveSettings({
              sequentialNextSelector: res.selector
            });
            await openActionPopupFromMenu();
          }
        })
        .catch(() => {});
      return false;
    }

    if (message.action === 'testWebhook') {
      sendWebhook(message.payload.payload, message.payload.options)
        .then((result) => sendResponse({ ok: true, result }))
        .catch((error) => sendResponse({ ok: false, error: error.message }));
      return true;
    }

    return false;
  });
}
