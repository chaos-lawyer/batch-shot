export function createPrepareFormJobs(options, deps) {
  const { createExplicitJobs, createSearchJobs } = deps;
  const jobs = Array.isArray(options.jobs) && options.jobs.length
    ? createExplicitJobs(options, deps)
    : options.urlInputMode === 'searchBox'
      ? createSearchJobs(options, deps)
      : [];

  return jobs
    .filter((job) => job.kind === 'search')
    .map((job) => ({
      ...job,
      closeAfterCapture: false,
      applyDelay: false,
      waitForLoad: false
    }));
}

export async function prepareSingleFormJob(job, index, total, deps) {
  const {
    chrome,
    batchStatus,
    waitForTabComplete,
    sendTabMessage,
    statusError,
    statusFromError,
    createReportRow
  } = deps;

  let tab = null;
  let url = job.url;
  let title = '';

  try {
    tab = await chrome.tabs.create({ url: job.url, active: true });
    await waitForTabComplete(tab.id, 45000, 'searchPageLoadTimeoutError');
    const latestTab = await chrome.tabs.get(tab.id).catch(() => tab);
    url = latestTab.url || tab.url || job.url;
    title = latestTab.title || '';
    batchStatus.updateProgress(index, total, url);

    const response = await sendTabMessage(tab.id, {
      action: 'fillSearchForm',
      payload: job.search
    });

    if (!response?.ok) {
      throw statusError(response?.statusKey || 'searchSubmitError');
    }

    return createReportRow({ index, url, title, status: 'ok' });
  } catch (error) {
    const latestTab = tab?.id ? await chrome.tabs.get(tab.id).catch(() => null) : null;
    url = latestTab?.url || url;
    title = title || latestTab?.title || '';
    const status = statusFromError(error);
    return createReportRow({ index, url, title, status: 'error', error: status.statusKey });
  }
}

export async function runPrepareForms(options, deps) {
  const {
    batchStatus,
    setStatus,
    statusError,
    statusFromError,
    runCaptureJobs,
    waitWhilePaused
  } = deps;

  try {
    const jobs = createPrepareFormJobs(options, deps);
    if (!jobs.length) {
      throw statusError('openFillNoSearchJobsError');
    }

    batchStatus.start('openFillRunningStatus');
    const rows = await runCaptureJobs(jobs, options, {
      shouldStop: () => batchStatus.getState().stopping,
      waitWhilePaused,
      captureSingleJob: (job, index, total) => prepareSingleFormJob(job, index, total, deps)
    });

    const successful = rows.filter((row) => row.status === 'ok').length;
    const failed = rows.length - successful;
    setStatus({
      statusKey: 'openFillDoneStatus',
      statusArgs: [String(successful), String(failed)]
    }, false, false);
  } catch (error) {
    setStatus(statusFromError(error), false, false);
  } finally {
    batchStatus.reset();
  }
}
