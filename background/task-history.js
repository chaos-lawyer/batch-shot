export const TASK_HISTORY_STORAGE_KEY = 'taskHistory';
export const TASK_HISTORY_LIMIT = 1;

const RETRYABLE_JOB_KINDS = new Set(['url', 'search']);

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value ?? null));
}

function normalizeJob(job) {
  if (!job || typeof job !== 'object') {
    return null;
  }

  const normalized = {
    kind: job.kind === 'search' ? 'search' : 'url',
    url: String(job.url || ''),
    urlContext: job.urlContext && typeof job.urlContext === 'object'
      ? cloneJson(job.urlContext)
      : {},
    closeAfterCapture: Boolean(job.closeAfterCapture)
  };

  if (job.kind === 'search') {
    normalized.search = job.search && typeof job.search === 'object'
      ? cloneJson(job.search)
      : {};
    normalized.applyDelay = job.applyDelay;
    normalized.waitForLoad = job.waitForLoad;
    normalized.searchResultDelay = job.searchResultDelay;
  }

  return normalized.url ? normalized : null;
}

function normalizeRow(row) {
  const status = ['ok', 'error', 'ignored'].includes(row?.status) ? row.status : 'error';
  return {
    index: Number(row?.index) || 0,
    url: String(row?.url || ''),
    title: String(row?.title || ''),
    filename: String(row?.filename || ''),
    status,
    error: String(row?.error || '')
  };
}

function normalizeTask(task) {
  const rows = Array.isArray(task?.rows) ? task.rows.map(normalizeRow) : [];
  const jobs = Array.isArray(task?.jobs) ? task.jobs.map(normalizeJob).filter(Boolean) : [];
  const successful = rows.filter((row) => row.status === 'ok').length;
  const failed = rows.filter((row) => row.status === 'error').length;
  const completedIndexes = new Set(rows.map((row) => row.index).filter(Boolean));
  const incomplete = Math.max(0, jobs.length - completedIndexes.size);
  const status = ['running', 'done', 'interrupted', 'stopped'].includes(task?.status)
    ? task.status
    : (task?.completedAt ? 'done' : 'running');

  return {
    id: String(task?.id || ''),
    status,
    createdAt: String(task?.createdAt || ''),
    updatedAt: String(task?.updatedAt || task?.completedAt || task?.createdAt || ''),
    completedAt: String(task?.completedAt || ''),
    total: jobs.length || rows.length,
    successful,
    failed,
    incomplete,
    retryable: failed + incomplete,
    options: task?.options && typeof task.options === 'object' ? cloneJson(task.options) : {},
    jobs,
    rows
  };
}

async function getStoredTaskHistory(chromeApi = chrome) {
  const stored = await chromeApi.storage.local.get(TASK_HISTORY_STORAGE_KEY);
  const tasks = Array.isArray(stored[TASK_HISTORY_STORAGE_KEY])
    ? stored[TASK_HISTORY_STORAGE_KEY]
    : [];
  return tasks.map(normalizeTask).filter((task) => task.id);
}

async function writeTaskHistory(tasks, chromeApi = chrome) {
  const normalized = tasks.map(normalizeTask).filter((task) => task.id);
  const next = normalized.slice(0, TASK_HISTORY_LIMIT);
  await chromeApi.storage.local.set({ [TASK_HISTORY_STORAGE_KEY]: next });
  return next;
}

export async function getTaskHistory(chromeApi = chrome) {
  return getStoredTaskHistory(chromeApi);
}

export async function clearTaskHistoryAlerts(chromeApi = chrome) {
  const current = await getStoredTaskHistory(chromeApi);
  const next = current.filter((task) => Number(task.retryable || 0) === 0 && task.status === 'done');
  return writeTaskHistory(next, chromeApi);
}

export async function startCaptureTaskHistory({ options, jobs }, chromeApi = chrome) {
  const normalizedJobs = Array.isArray(jobs)
    ? jobs.map(normalizeJob).filter(Boolean)
    : [];
  const createdAt = new Date().toISOString();
  const record = normalizeTask({
    id: `task-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    status: 'running',
    createdAt,
    updatedAt: createdAt,
    options: {
      ...cloneJson(options || {}),
      jobs: normalizedJobs
    },
    jobs: normalizedJobs,
    rows: []
  });
  const current = await getStoredTaskHistory(chromeApi);
  const next = [record, ...current.filter((task) => task.id !== record.id)];
  await writeTaskHistory(next, chromeApi);
  return record;
}

export async function updateCaptureTaskHistory(taskId, row, chromeApi = chrome) {
  if (!taskId || !row) {
    return null;
  }

  const current = await getStoredTaskHistory(chromeApi);
  const task = current.find((item) => item.id === taskId);
  if (!task) {
    return null;
  }

  const normalizedRow = normalizeRow(row);
  const rows = [
    ...task.rows.filter((item) => item.index !== normalizedRow.index),
    normalizedRow
  ].sort((a, b) => a.index - b.index);
  const updated = normalizeTask({
    ...task,
    status: 'running',
    updatedAt: new Date().toISOString(),
    rows
  });
  const next = [updated, ...current.filter((item) => item.id !== taskId)];
  await writeTaskHistory(next, chromeApi);
  return updated;
}

export async function finishCaptureTaskHistory(taskId, { rows, stopped = false } = {}, chromeApi = chrome) {
  if (!taskId) {
    return null;
  }

  const current = await getStoredTaskHistory(chromeApi);
  const task = current.find((item) => item.id === taskId);
  if (!task) {
    return null;
  }

  const mergedRows = Array.isArray(rows) && rows.length
    ? rows.map(normalizeRow)
    : task.rows;
  const completedAt = new Date().toISOString();
  const completedIndexes = new Set(mergedRows.map((row) => row.index).filter(Boolean));
  const incomplete = Math.max(0, task.jobs.length - completedIndexes.size);
  const status = stopped ? 'stopped' : (incomplete ? 'interrupted' : 'done');
  const updated = normalizeTask({
    ...task,
    status,
    rows: mergedRows,
    updatedAt: completedAt,
    completedAt
  });
  const next = [updated, ...current.filter((item) => item.id !== taskId)];
  await writeTaskHistory(next, chromeApi);
  return updated;
}

export async function ignoreTaskHistoryRow(taskId, url, chromeApi = chrome) {
  if (!taskId || !url) {
    return null;
  }

  const current = await getStoredTaskHistory(chromeApi);
  const task = current.find((item) => item.id === taskId);
  if (!task) {
    return null;
  }

  // Check if the row already exists in task.rows
  const existingRowIndex = task.rows.findIndex((row) => row.url === url);
  let rows = [...task.rows];

  if (existingRowIndex >= 0) {
    // If it exists, update it to 'ignored'
    rows[existingRowIndex] = { ...rows[existingRowIndex], status: 'ignored' };
  } else {
    // If it doesn't exist, it's an incomplete job. Find its index in task.jobs
    const jobIndex = task.jobs.findIndex((job) => job.url === url);
    if (jobIndex >= 0) {
      // Add a dummy row with status 'ignored'
      rows.push({
        index: jobIndex + 1, // 1-based index
        url: url,
        title: '',
        filename: '',
        status: 'ignored',
        error: ''
      });
    }
  }

  const updated = normalizeTask({
    ...task,
    rows
  });
  const next = [updated, ...current.filter((item) => item.id !== taskId)];
  await writeTaskHistory(next, chromeApi);
  return updated;
}

export async function saveCaptureTaskHistory({ options, jobs, rows }, chromeApi = chrome) {
  if (!Array.isArray(rows) || !rows.length) {
    return [];
  }

  const normalizedJobs = Array.isArray(jobs)
    ? jobs.map(normalizeJob).filter(Boolean)
    : [];
  const normalizedRows = rows.map(normalizeRow);
  const completedAt = new Date().toISOString();
  const record = normalizeTask({
    id: `task-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    createdAt: completedAt,
    completedAt,
    options: {
      ...cloneJson(options || {}),
      jobs: normalizedJobs
    },
    jobs: normalizedJobs,
    rows: normalizedRows
  });

  const current = await getStoredTaskHistory(chromeApi);
  const next = [record, ...current.filter((task) => task.id !== record.id)];
  return writeTaskHistory(next, chromeApi);
}

export function createRetryOptions(task) {
  const normalizedTask = normalizeTask(task);
  const completedIndexes = new Set(normalizedTask.rows.map((row) => row.index).filter(Boolean));
  const failedIndexes = normalizedTask.rows
    .filter((row) => row.status === 'error')
    .map((row) => row.index);
  const incompleteIndexes = normalizedTask.jobs
    .map((_job, index) => index + 1)
    .filter((index) => !completedIndexes.has(index));
  const retryIndexes = [...new Set([...failedIndexes, ...incompleteIndexes])];
  const retryJobs = retryIndexes
    .map((index) => normalizedTask.jobs[index - 1])
    .filter((job) => job && RETRYABLE_JOB_KINDS.has(job.kind));

  if (!retryJobs.length) {
    return null;
  }

  return {
    ...cloneJson(normalizedTask.options || {}),
    jobs: retryJobs
  };
}

export function createRetryAllOptions(tasks) {
  const retryOptionsList = (Array.isArray(tasks) ? tasks : [])
    .map(createRetryOptions)
    .filter((options) => Array.isArray(options?.jobs) && options.jobs.length);

  if (!retryOptionsList.length) {
    return null;
  }

  return {
    ...cloneJson(retryOptionsList[0]),
    jobs: retryOptionsList.flatMap((options) => options.jobs)
  };
}

export async function getRetryOptions(taskId, chromeApi = chrome) {
  const tasks = await getTaskHistory(chromeApi);
  const task = tasks.find((item) => item.id === taskId);
  if (!task) {
    return null;
  }

  return createRetryOptions(task);
}

export async function getRetryAllOptions(chromeApi = chrome) {
  const tasks = await getTaskHistory(chromeApi);
  return createRetryAllOptions(tasks);
}
