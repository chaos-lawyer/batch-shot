export function waitForRelatedNewTab(sourceTab, timeoutMs = 2000, deps) {
  const { chrome } = deps;
  return new Promise((resolve) => {
    let isDone = false;
    const timeout = setTimeout(() => {
      cleanup();
      resolve(null);
    }, timeoutMs);

    function cleanup() {
      if (isDone) {
        return;
      }
      isDone = true;
      clearTimeout(timeout);
      chrome.tabs.onCreated.removeListener(handleCreated);
      chrome.tabs.onActivated.removeListener(handleActivated);
    }

    function resolveTab(tab) {
      cleanup();
      resolve(tab);
    }

    function handleCreated(tab) {
      if (!tab?.id || tab.id === sourceTab.id) {
        return;
      }

      resolveTab(tab);
    }

    function handleActivated(activeInfo) {
      if (!activeInfo?.tabId || activeInfo.tabId === sourceTab.id) {
        return;
      }

      chrome.tabs.get(activeInfo.tabId)
        .then((tab) => resolveTab(tab))
        .catch(() => {});
    }

    chrome.tabs.onCreated.addListener(handleCreated);
    chrome.tabs.onActivated.addListener(handleActivated);
  });
}

function pageLoadTimeoutMs(options = {}) {
  const seconds = Number(options.pageLoadTimeout);
  return (Number.isFinite(seconds) ? Math.min(300, Math.max(5, seconds)) : 45) * 1000;
}

export async function prepareCaptureJob(job, deps, options = {}) {
  const {
    chrome,
    waitForTabComplete,
    sendTabMessage,
    statusError,
    sleepWithControls,
    waitForTabReadyForCapture
  } = deps;

  if (job.kind === 'url') {
    const tab = await chrome.tabs.create({ url: job.url, active: true });
    return { ...job, tab, url: tab.url || job.url };
  }

  if (job.kind === 'search') {
    const tab = await chrome.tabs.create({ url: job.url, active: true });
    const timeoutMs = pageLoadTimeoutMs(options);
    await waitForTabComplete(tab.id, timeoutMs, 'searchPageLoadTimeoutError');

    const resultTabPromise = waitForRelatedNewTab(tab, 2000, deps);
    const response = await sendTabMessage(tab.id, {
      action: 'performSearch',
      payload: job.search
    });

    if (!response?.ok) {
      throw statusError(response?.statusKey || 'searchSubmitError');
    }

    await sleepWithControls(300);
    const openedTab = await resultTabPromise;
    const captureTarget = openedTab?.id
      ? await chrome.tabs.get(openedTab.id).catch(() => openedTab)
      : tab;

    await waitForTabReadyForCapture(captureTarget.id, timeoutMs, 'searchPageLoadTimeoutError');
    await sleepWithControls(Math.max(0, Number(job.searchResultDelay ?? 0)) * 1000);
    const latestTab = await chrome.tabs.get(captureTarget.id).catch(() => captureTarget);
    return {
      ...job,
      tab: latestTab,
      extraTabs: openedTab?.id ? [tab] : [],
      url: latestTab.url || captureTarget.url || tab.url || job.url
    };
  }

  return job;
}

export async function cleanupCaptureJob(job, deps) {
  const { chrome, sendTabMessage } = deps;
  const tabs = [job.tab, ...(job.extraTabs || [])]
    .filter((tab) => tab?.id)
    .filter((tab, index, list) => list.findIndex((item) => item.id === tab.id) === index);

  if (!tabs.length) {
    return;
  }

  await Promise.all(tabs.map((tab) => (
    sendTabMessage(tab.id, { action: 'cleanup' }).catch(() => {})
  )));

  if (job.closeAfterCapture) {
    await Promise.all(tabs.map((tab) => chrome.tabs.remove(tab.id).catch(() => {})));
  }
}

export async function captureSingleJob(job, index, total, options, deps) {
  const {
    chrome,
    batchStatus,
    waitForTabComplete,
    sleepWithControls,
    captureTabToDownload,
    createReportRow,
    statusFromError
  } = deps;

  let activeJob = job;
  let filename = '';
  let title = job.title || '';
  let url = job.url;

  try {
    activeJob = await prepareCaptureJob(job, deps, options);
    url = activeJob.url || activeJob.tab?.url || url;
    batchStatus.updateProgress(index, total, url);

    if (activeJob.tab?.id && activeJob.waitForLoad !== false) {
      await waitForTabComplete(activeJob.tab.id, pageLoadTimeoutMs(options));
    }

    if (activeJob.applyDelay !== false) {
      await sleepWithControls(Math.max(0, Number(options.delay) || 0) * 1000);
    }

    const result = await captureTabToDownload(activeJob.tab, index, total, options, activeJob.urlContext, deps);
    url = result.url;
    filename = result.filename;
    title = result.title;

    return createReportRow({
      index,
      url,
      title,
      filename,
      status: 'ok',
      textFilename: result.textFilename,
      textLength: result.textLength,
      textExcerpt: result.textExcerpt,
      metaDescription: result.metaDescription,
      text: result.text
    });
  } catch (error) {
    const latestTab = activeJob.tab?.id ? await chrome.tabs.get(activeJob.tab.id).catch(() => null) : null;
    url = latestTab?.url || url;
    title = title || latestTab?.title || '';
    const status = statusFromError(error);
    return createReportRow({ index, url, title, filename, status: 'error', error: status.statusKey });
  } finally {
    await cleanupCaptureJob(activeJob, deps);
  }
}

export const runCaptureJobList = (jobs, options, deps) => {
  const { runCaptureJobs, getBatchState, waitWhilePaused, onJobComplete, batchStatus } = deps;
  return runCaptureJobs(jobs, options, {
    shouldStop: () => getBatchState().stopping,
    waitWhilePaused,
    captureSingleJob: (job, index, total) => captureSingleJob(job, index, total, options, deps),
    onJobComplete: async (row, index, total) => {
      if (batchStatus && batchStatus.addLog) {
        batchStatus.addLog(row.url, row.status, row.error, row.title);
      }
      if (onJobComplete) {
        await onJobComplete(row, index, total);
      }
    }
  });
};
