import { message } from '../utils/i18n.js';
import { buildBatchOptions } from './batch-options.js';

function toDatetimeLocalValue(timestamp) {
  const date = new Date(timestamp);
  const offsetDate = new Date(date.getTime() - date.getTimezoneOffset() * 60 * 1000);
  return offsetDate.toISOString().slice(0, 16);
}

function formatScheduledAt(timestamp) {
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  }).format(new Date(timestamp));
}

function taskUrlPreview(task) {
  if (Array.isArray(task?.urlPreview) && task.urlPreview.length) {
    return task.urlPreview;
  }

  return Array.isArray(task?.options?.urls) ? task.options.urls.slice(0, 3) : [];
}

export function createScheduleActions({
  elements,
  persistSettings,
  getSettings,
  getUrlInputMode,
  parseUrls,
  buildTemplateUrls,
  rememberCurrentInputs,
  setStatus
}) {
  let scheduledTasks = [];
  let selectedTaskId = '';
  let isScheduleEnabled = false;

  function selectedTask() {
    return scheduledTasks.find((task) => task.id === selectedTaskId) || null;
  }

  function setDefaultScheduleTime() {
    if (elements.scheduleAt.value) {
      return;
    }

    elements.scheduleAt.value = toDatetimeLocalValue(Date.now() + 10 * 60 * 1000);
  }

  function setSchedulePanelOpen(isOpen) {
    if (!isScheduleEnabled) {
      isOpen = false;
    }

    elements.schedulePanel.hidden = !isOpen;
    elements.scheduleButton.setAttribute('aria-expanded', String(isOpen));

    if (isOpen) {
      setDefaultScheduleTime();
      elements.scheduleAt.focus();
    }
  }

  function responseStatus(response, fallbackKey) {
    if (response?.statusKey) {
      return message(response.statusKey, response.statusArgs || []);
    }

    return response?.error || message(fallbackKey);
  }

  function renderUrlPreview(task) {
    elements.scheduleUrlPreview.replaceChildren();

    if (!task) {
      return;
    }

    const list = document.createElement('ol');
    taskUrlPreview(task).forEach((url) => {
      const item = document.createElement('li');
      item.textContent = url;
      list.append(item);
    });

    if ((task.urlCount || 0) > 3) {
      const item = document.createElement('li');
      item.textContent = message('scheduledTaskMoreUrls', String(task.urlCount - 3));
      list.append(item);
    }

    elements.scheduleUrlPreview.append(list);
  }

  function renderTaskList() {
    elements.scheduleTaskList.replaceChildren();

    scheduledTasks.forEach((task) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'schedule-task-item';
      button.classList.toggle('is-selected', task.id === selectedTaskId);
      button.dataset.taskId = task.id;

      const time = document.createElement('span');
      time.className = 'schedule-task-time';
      time.textContent = formatScheduledAt(task.scheduledAt);

      const count = document.createElement('span');
      count.className = 'schedule-task-count';
      count.textContent = message('scheduledTaskUrlCount', String(task.urlCount || 0));

      button.append(time, count);
      elements.scheduleTaskList.append(button);
    });
  }

  function renderScheduledTasks(tasks, preferredTaskId = selectedTaskId) {
    scheduledTasks = [...tasks].sort((a, b) => a.scheduledAt - b.scheduledAt);
    const hasPreferred = scheduledTasks.some((task) => task.id === preferredTaskId);
    selectedTaskId = hasPreferred ? preferredTaskId : scheduledTasks[0]?.id || '';
    const task = selectedTask();
    const hasTasks = scheduledTasks.length > 0;

    elements.cancelScheduleButton.hidden = !task;
    elements.scheduleNewButton.hidden = !hasTasks;
    elements.scheduleButton.classList.toggle('is-active', hasTasks);
    elements.scheduleSummary.textContent = task
      ? message('scheduledTaskPanelCurrent', formatScheduledAt(task.scheduledAt))
      : message('scheduledTaskPanelEmpty');
    elements.scheduleSaveButton.textContent = message(task ? 'scheduleUpdateButton' : 'scheduleButton');

    if (task) {
      elements.scheduleAt.value = toDatetimeLocalValue(task.scheduledAt);
      elements.scheduleButton.title = message('scheduleButtonActive', String(scheduledTasks.length));
      elements.scheduleButton.setAttribute('aria-label', message('scheduleButtonActive', String(scheduledTasks.length)));
    } else {
      elements.scheduleButton.title = message('scheduleButton');
      elements.scheduleButton.setAttribute('aria-label', message('scheduleButton'));
      setDefaultScheduleTime();
    }

    renderTaskList();
    renderUrlPreview(task);
  }

  async function refreshScheduledTask() {
    if (!isScheduleEnabled) {
      renderScheduledTasks([]);
      return;
    }

    const response = await chrome.runtime.sendMessage({ action: 'getScheduledBatch' });
    renderScheduledTasks(response?.tasks || (response?.task ? [response.task] : []));
  }

  function setScheduleEnabled(isEnabled) {
    isScheduleEnabled = Boolean(isEnabled);
    elements.scheduleButton.hidden = !isScheduleEnabled;
    elements.scheduleButton.parentElement?.classList.toggle('has-schedule-trigger', isScheduleEnabled);

    if (!isScheduleEnabled) {
      setSchedulePanelOpen(false);
      renderScheduledTasks([]);
    }
  }

  function clearSelectionForNewTask() {
    selectedTaskId = '';
    elements.scheduleAt.value = toDatetimeLocalValue(Date.now() + 10 * 60 * 1000);
    elements.scheduleSummary.textContent = scheduledTasks.length
      ? message('scheduledTaskPanelNew')
      : message('scheduledTaskPanelEmpty');
    elements.scheduleSaveButton.textContent = message('scheduleButton');
    elements.cancelScheduleButton.hidden = true;
    renderTaskList();
    renderUrlPreview(null);
    elements.scheduleAt.focus();
  }

  async function scheduleBatch() {
    const task = selectedTask();
    const scheduledAt = new Date(elements.scheduleAt.value).getTime();
    if (!Number.isFinite(scheduledAt)) {
      setStatus(message('scheduledTaskMissingTimeError'));
      return;
    }

    let options = task?.options || null;

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
        options
      }
    });

    if (!response?.ok) {
      setStatus(responseStatus(response, 'scheduledTaskError'));
      return;
    }

    renderScheduledTasks(response.tasks || [response.task], response.task.id);
    setSchedulePanelOpen(false);
    setStatus(message(
      task ? 'scheduledTaskUpdatedStatus' : 'scheduledTaskSavedStatus',
      formatScheduledAt(response.task.scheduledAt)
    ));
  }

  async function cancelScheduledBatch() {
    const task = selectedTask();
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

    renderScheduledTasks(response.tasks || [], '');
    setStatus(message('scheduledTaskCanceledStatus'));
  }

  function bindScheduleEvents() {
    setDefaultScheduleTime();
    elements.scheduleButton.addEventListener('click', (event) => {
      event.stopPropagation();
      setSchedulePanelOpen(elements.schedulePanel.hidden);
    });
    elements.scheduleTaskList.addEventListener('click', (event) => {
      const button = event.target.closest('.schedule-task-item');
      if (!button) {
        return;
      }

      selectedTaskId = button.dataset.taskId;
      renderScheduledTasks(scheduledTasks, selectedTaskId);
    });
    elements.schedulePanel.addEventListener('click', (event) => event.stopPropagation());
    elements.schedulePanelCloseButton.addEventListener('click', () => setSchedulePanelOpen(false));
    elements.scheduleNewButton.addEventListener('click', clearSelectionForNewTask);
    elements.scheduleSaveButton.addEventListener('click', scheduleBatch);
    elements.cancelScheduleButton.addEventListener('click', cancelScheduledBatch);
    document.addEventListener('click', () => setSchedulePanelOpen(false));
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') {
        setSchedulePanelOpen(false);
      }
    });
  }

  return {
    bindScheduleEvents,
    refreshScheduledTask,
    setScheduleEnabled
  };
}
