export const SCHEDULED_BATCH_ALARM_PREFIX = 'batchshot-scheduled-batch:';
export const LEGACY_SCHEDULED_BATCH_ALARM = 'batchshot-scheduled-batch';
export const SCHEDULED_BATCH_STORAGE_KEY = 'scheduledBatchTasks';
export const LEGACY_SCHEDULED_BATCH_STORAGE_KEY = 'scheduledBatchTask';

function createTaskId() {
  if (globalThis.crypto?.randomUUID) {
    return globalThis.crypto.randomUUID();
  }

  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function alarmNameForTask(taskId) {
  return `${SCHEDULED_BATCH_ALARM_PREFIX}${taskId}`;
}

function taskIdFromAlarmName(name) {
  return String(name || '').startsWith(SCHEDULED_BATCH_ALARM_PREFIX)
    ? String(name).slice(SCHEDULED_BATCH_ALARM_PREFIX.length)
    : '';
}

function createTask(options, scheduledAt, id = createTaskId()) {
  const urls = Array.isArray(options.urls) ? options.urls : [];
  const jobs = Array.isArray(options.jobs) ? options.jobs : [];
  const searchKeywords = Array.isArray(options.searchKeywordsList)
    ? options.searchKeywordsList
    : String(options.searchKeywords || '')
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);
  const urlCount = jobs.length || (options.urlInputMode === 'searchBox' ? searchKeywords.length : urls.length);
  const urlPreview = jobs.length
    ? jobs.slice(0, 3).map((job) => job.kind === 'search'
      ? `${job.url} - ${job.search?.keyword || ''}`
      : job.url)
    : options.urlInputMode === 'searchBox'
    ? searchKeywords.slice(0, 3).map((keyword) => `${options.searchStartUrl} - ${keyword}`)
    : urls.slice(0, 3);

  return {
    id,
    options,
    scheduledAt,
    createdAt: Date.now(),
    urlCount,
    urlPreview
  };
}

function normalizeTask(task) {
  if (!task?.scheduledAt || !task?.options) {
    return null;
  }

  const urls = Array.isArray(task.options.urls) ? task.options.urls : [];
  const jobs = Array.isArray(task.options.jobs) ? task.options.jobs : [];
  const searchKeywords = Array.isArray(task.options.searchKeywordsList)
    ? task.options.searchKeywordsList
    : String(task.options.searchKeywords || '')
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);
  const urlCount = jobs.length || (task.options.urlInputMode === 'searchBox' ? searchKeywords.length : urls.length);
  const urlPreview = jobs.length
    ? jobs.slice(0, 3).map((job) => job.kind === 'search'
      ? `${job.url} - ${job.search?.keyword || ''}`
      : job.url)
    : task.options.urlInputMode === 'searchBox'
    ? searchKeywords.slice(0, 3).map((keyword) => `${task.options.searchStartUrl} - ${keyword}`)
    : urls.slice(0, 3);

  return {
    ...task,
    id: task.id || createTaskId(),
    urlCount: Number(task.urlCount) || urlCount,
    urlPreview: Array.isArray(task.urlPreview) ? task.urlPreview.slice(0, 3) : urlPreview
  };
}

export function createScheduledTaskController({
  chromeApi = globalThis.chrome,
  getBatchState,
  runBatch,
  setStatus
}) {
  async function saveTasks(tasks) {
    const sorted = tasks
      .map(normalizeTask)
      .filter(Boolean)
      .sort((a, b) => a.scheduledAt - b.scheduledAt);
    await chromeApi.storage.local.set({ [SCHEDULED_BATCH_STORAGE_KEY]: sorted });
    return sorted;
  }

  async function getScheduledTasks() {
    const result = await chromeApi.storage.local.get([
      SCHEDULED_BATCH_STORAGE_KEY,
      LEGACY_SCHEDULED_BATCH_STORAGE_KEY
    ]);
    const tasks = Array.isArray(result[SCHEDULED_BATCH_STORAGE_KEY])
      ? result[SCHEDULED_BATCH_STORAGE_KEY]
      : [];
    const legacyTask = normalizeTask(result[LEGACY_SCHEDULED_BATCH_STORAGE_KEY]);
    const normalized = [...tasks, legacyTask].filter(Boolean);

    if (legacyTask) {
      await chromeApi.storage.local.remove(LEGACY_SCHEDULED_BATCH_STORAGE_KEY);
      return saveTasks(normalized);
    }

    return normalized.sort((a, b) => a.scheduledAt - b.scheduledAt);
  }

  async function clearScheduledTask(taskId) {
    if (!taskId) {
      const tasks = await getScheduledTasks();
      await Promise.all(tasks.map((task) => chromeApi.alarms.clear(alarmNameForTask(task.id))));
      await chromeApi.storage.local.remove(SCHEDULED_BATCH_STORAGE_KEY);
      return [];
    }

    const tasks = await getScheduledTasks();
    await chromeApi.alarms.clear(alarmNameForTask(taskId));
    return saveTasks(tasks.filter((task) => task.id !== taskId));
  }

  async function scheduleBatch(options, scheduledAt, taskId = '') {
    const when = Number(scheduledAt);
    if (!Number.isFinite(when) || when <= Date.now()) {
      return { ok: false, statusKey: 'scheduledTaskPastError', statusArgs: [] };
    }

    const tasks = await getScheduledTasks();
    const existingTask = taskId ? tasks.find((task) => task.id === taskId) : null;
    const task = createTask(options, when, existingTask?.id);
    const nextTasks = existingTask
      ? tasks.map((item) => (item.id === existingTask.id ? task : item))
      : [...tasks, task];

    await saveTasks(nextTasks);
    await chromeApi.alarms.create(alarmNameForTask(task.id), { when });
    return { ok: true, task, tasks: nextTasks.sort((a, b) => a.scheduledAt - b.scheduledAt) };
  }

  async function restoreScheduledAlarm() {
    const now = Date.now();
    const tasks = (await getScheduledTasks()).filter((task) => task.scheduledAt > now);
    await saveTasks(tasks);
    await chromeApi.alarms.clear(LEGACY_SCHEDULED_BATCH_ALARM);
    await Promise.all(tasks.map((task) => (
      chromeApi.alarms.create(alarmNameForTask(task.id), { when: task.scheduledAt })
    )));
    return tasks;
  }

  async function clearScheduledAlarms() {
    const tasks = await getScheduledTasks();
    await chromeApi.alarms.clear(LEGACY_SCHEDULED_BATCH_ALARM);
    await Promise.all(tasks.map((task) => chromeApi.alarms.clear(alarmNameForTask(task.id))));
    return tasks;
  }

  async function handleAlarm(alarm) {
    const isLegacyAlarm = alarm.name === LEGACY_SCHEDULED_BATCH_ALARM;
    const taskId = isLegacyAlarm ? '' : taskIdFromAlarmName(alarm.name);
    if (!isLegacyAlarm && !taskId) {
      return;
    }

    const tasks = await getScheduledTasks();
    const task = isLegacyAlarm ? tasks[0] : tasks.find((item) => item.id === taskId);
    await saveTasks(tasks.filter((item) => item.id !== task?.id));

    const hasExplicitJobs = Array.isArray(task?.options?.jobs) && task.options.jobs.length;
    const hasUrlJobs = Array.isArray(task?.options?.urls) && task.options.urls.length;
    const hasSearchJobs = task?.options?.urlInputMode === 'searchBox'
      && (
        (Array.isArray(task.options.searchKeywordsList) && task.options.searchKeywordsList.length)
        || String(task.options.searchKeywords || '').trim()
      );

    if (!hasExplicitJobs && !hasUrlJobs && !hasSearchJobs) {
      return;
    }

    if (getBatchState().running) {
      setStatus({ statusKey: 'scheduledTaskSkippedRunning', statusArgs: [] }, false, false);
      return;
    }

    runBatch(task.options);
  }

  return {
    getScheduledTasks,
    scheduleBatch,
    clearScheduledTask,
    clearScheduledAlarms,
    restoreScheduledAlarm,
    handleAlarm
  };
}
