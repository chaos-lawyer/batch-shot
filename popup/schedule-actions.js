import { message } from '../utils/i18n.js';
import { nextDefaultTaskName, taskDisplayName } from './schedule-name.js';
import { buildBatchOptions } from './batch-options.js';

function responseStatus(response, fallbackKey) {
  if (response?.statusKey) {
    return message(response.statusKey, response.statusArgs || []);
  }
  return response?.error || message(fallbackKey);
}

export function createScheduleActionsBound({
  state,
  elements,
  persistSettings,
  getSettings,
  getUrlInputMode,
  parseUrls,
  buildTemplateUrls,
  rememberCurrentInputs,
  setStatus,
  renderScheduledTasks
}) {
  async function refreshScheduledTask() {
    if (!state.isScheduleEnabled) {
      state.scheduledTasks = [];
      renderScheduledTasks();
      return;
    }

    const response = await chrome.runtime.sendMessage({ action: 'getScheduledBatch' });
    const tasks = response?.tasks || (response?.task ? [response.task] : []);
    state.scheduledTasks = [...tasks].sort((a, b) => a.scheduledAt - b.scheduledAt);
    renderScheduledTasks();
  }

  async function submitScheduledBatch(task = null) {
    const scheduledAt = new Date(elements.scheduleAt.value).getTime();
    if (!Number.isFinite(scheduledAt)) {
      setStatus(message('scheduledTaskMissingTimeError'));
      return;
    }

    let options = task?.options || null;
    const taskName = task
      ? (state.scheduleNameTouched && elements.scheduleName.value.trim()
        ? elements.scheduleName.value.trim()
        : taskDisplayName(task, state.scheduledTasks.indexOf(task) + 1))
      : (state.scheduleNameTouched && elements.scheduleName.value.trim()
        ? elements.scheduleName.value.trim()
        : nextDefaultTaskName(state.scheduledTasks));

    if (!options) {
      const popupSettings = getSettings();
      const batchResult = buildBatchOptions(popupSettings, getUrlInputMode(), parseUrls, buildTemplateUrls);

      if (!batchResult.options) {
        setStatus(message(batchResult.errorKey, batchResult.errorArgs));
        return;
      }

      const settings = await persistSettings(popupSettings);
      await rememberCurrentInputs();
      options = { ...settings, ...batchResult.options };
    }

    const response = await chrome.runtime.sendMessage({
      action: 'scheduleBatch',
      payload: {
        taskId: task?.id || '',
        scheduledAt,
        taskName,
        options
      }
    });

    if (!response?.ok) {
      setStatus(responseStatus(response, 'scheduledTaskError'));
      return;
    }

    const nextTasks = response.tasks || [response.task];
    state.pendingUpdateTaskId = '';
    state.scheduledTasks = [...nextTasks].sort((a, b) => a.scheduledAt - b.scheduledAt);
    state.selectedTaskId = response.task.id;
    renderScheduledTasks();

    setStatus(task
      ? message('scheduledTaskUpdatedStatus')
      : message('scheduledTaskSavedStatus', new Intl.DateTimeFormat(document.documentElement.lang || undefined, {
          month: 'short',
          day: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
          hourCycle: 'h23'
        }).format(new Date(response.task.scheduledAt))));
  }

  async function cancelScheduledBatch(taskId) {
    const task = taskId ? state.scheduledTasks.find((t) => t.id === taskId) : state.selectedTask();
    if (!task) {
      return;
    }

    const response = await chrome.runtime.sendMessage({
      action: 'cancelScheduledBatch',
      payload: { taskId: task.id }
    });

    if (!response?.ok) {
      setStatus(responseStatus(response, 'scheduledTaskCancelError'));
      return;
    }

    const nextTasks = response.tasks || [];
    state.scheduledTasks = [...nextTasks].sort((a, b) => a.scheduledAt - b.scheduledAt);
    state.selectedTaskId = '';
    renderScheduledTasks();
    setStatus(message('scheduledTaskCanceledStatus'));
  }

  return {
    refreshScheduledTask,
    submitScheduledBatch,
    cancelScheduledBatch
  };
}
