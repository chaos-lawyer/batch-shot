import { message } from '../utils/i18n.js';
import { buildBatchOptions } from './batch-options.js';

const UPDATE_ICON = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 1 1-2.64-6.36"></path><polyline points="21 3 21 9 15 9"></polyline></svg>';
const CHECK_ICON = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"></path></svg>';
const CANCEL_ICON = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18"></path><path d="m6 6 12 12"></path></svg>';
const TRASH_ICON = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg>';

function toDatetimeLocalValue(timestamp) {
  const date = new Date(timestamp);
  const offsetDate = new Date(date.getTime() - date.getTimezoneOffset() * 60 * 1000);
  return offsetDate.toISOString().slice(0, 16);
}

function formatScheduledAt(timestamp) {
  const locale = document.documentElement.lang || undefined;
  return new Intl.DateTimeFormat(locale, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23'
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
  let pendingUpdateTaskId = '';
  let scheduleNameTouched = false;

  function selectedTask() {
    return scheduledTasks.find((task) => task.id === selectedTaskId) || null;
  }

  function defaultTaskName(index) {
    return message('scheduledTaskDefaultName', String(index));
  }

  function taskDisplayName(task, index = 0) {
    return String(task?.name || '').trim() || defaultTaskName(index || 1);
  }

  function defaultTaskNameIndex(name) {
    const normalized = String(name || '').trim();
    const match = normalized.match(/^任务(\d+)$/) || normalized.match(/^Task\s+(\d+)$/i);
    return match ? Number(match[1]) : 0;
  }

  function nextDefaultTaskName() {
    const usedNames = new Set(scheduledTasks.map((task, index) => taskDisplayName(task, index + 1)));
    const maxDefaultIndex = [...usedNames]
      .map(defaultTaskNameIndex)
      .reduce((max, index) => Math.max(max, index), 0);
    let index = Math.max(scheduledTasks.length, maxDefaultIndex) + 1;
    while (usedNames.has(defaultTaskName(index))) {
      index += 1;
    }
    return defaultTaskName(index);
  }

  function setScheduleNameValue(value, fallbackName = nextDefaultTaskName()) {
    elements.scheduleName.value = String(value || '').trim();
    elements.scheduleName.placeholder = elements.scheduleName.value ? message('scheduleNamePlaceholder') : fallbackName;
    scheduleNameTouched = false;
  }

  function clearPendingUpdate(shouldRender = true) {
    if (!pendingUpdateTaskId) {
      return;
    }

    pendingUpdateTaskId = '';
    if (shouldRender) {
      renderTaskList();
    }
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

    if (!isOpen) {
      clearPendingUpdate();
    }

    if (isOpen) {
      setDefaultScheduleTime();
      elements.scheduleAt.focus();
    }
  }

  async function openSchedulePanel() {
    if (!isScheduleEnabled) {
      setSchedulePanelOpen(false);
      return;
    }

    try {
      await refreshScheduledTask();
    } catch (_) {
      setStatus(message('scheduledTaskError'));
    }

    setSchedulePanelOpen(true);
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

    scheduledTasks.forEach((task, index) => {
      const isConfirming = task.id === pendingUpdateTaskId;
      const button = document.createElement('div');
      button.className = 'schedule-task-item';
      button.classList.toggle('is-selected', task.id === selectedTaskId);
      button.classList.toggle('is-confirming', isConfirming);
      button.dataset.taskId = task.id;

      const time = document.createElement('span');
      time.className = 'schedule-task-time';
      time.textContent = isConfirming ? message('scheduleUpdateButton') : taskDisplayName(task, index + 1);

      const count = document.createElement('span');
      count.className = 'schedule-task-count';
      count.textContent = isConfirming
        ? ''
        : `${formatScheduledAt(task.scheduledAt)} · ${message('scheduledTaskUrlCount', String(task.urlCount || 0))}`;

      const updateBtn = document.createElement('button');
      const updateLabel = message('scheduleUpdateButton');
      updateBtn.type = 'button';
      updateBtn.className = 'icon-button schedule-task-update-button';
      updateBtn.title = updateLabel;
      updateBtn.setAttribute('aria-label', updateLabel);
      updateBtn.dataset.taskId = task.id;
      updateBtn.innerHTML = task.id === pendingUpdateTaskId ? CHECK_ICON : UPDATE_ICON;

      updateBtn.addEventListener('click', (event) => {
        event.stopPropagation();
        updateScheduledBatch(task.id);
      });

      const deleteBtn = document.createElement('button');
      const deleteLabel = message(isConfirming ? 'cancelUpdateConfirmButton' : 'cancelScheduleButton');
      deleteBtn.type = 'button';
      deleteBtn.className = 'icon-button schedule-task-cancel-button';
      deleteBtn.title = deleteLabel;
      deleteBtn.setAttribute('aria-label', deleteLabel);
      deleteBtn.dataset.taskId = task.id;
      deleteBtn.innerHTML = isConfirming ? CANCEL_ICON : TRASH_ICON;

      deleteBtn.addEventListener('click', (event) => {
        event.stopPropagation();
        if (isConfirming) {
          clearPendingUpdate();
        } else {
          cancelScheduledBatch(task.id);
        }
      });

      button.append(time, count, updateBtn, deleteBtn);
      elements.scheduleTaskList.append(button);
    });
  }

  function renderScheduledTasks(tasks, preferredTaskId = selectedTaskId) {
    scheduledTasks = [...tasks].sort((a, b) => a.scheduledAt - b.scheduledAt);
    const hasPreferred = scheduledTasks.some((task) => task.id === preferredTaskId);
    selectedTaskId = hasPreferred ? preferredTaskId : scheduledTasks[0]?.id || '';
    if (pendingUpdateTaskId !== selectedTaskId) {
      clearPendingUpdate(false);
    }
    const task = selectedTask();
    const hasTasks = scheduledTasks.length > 0;

    elements.scheduleNewButton.hidden = !hasTasks;
    elements.scheduleSaveButton.hidden = Boolean(task);
    elements.scheduleButton.classList.toggle('is-active', hasTasks);
    elements.scheduleSaveButton.title = message('scheduleButton');
    elements.scheduleSaveButton.dataset.i18nTitle = 'scheduleButton';

    if (task) {
      elements.scheduleAt.value = toDatetimeLocalValue(task.scheduledAt);
      setScheduleNameValue('', nextDefaultTaskName());
      elements.scheduleButton.title = message('scheduleButtonActive', String(scheduledTasks.length));
      elements.scheduleButton.setAttribute('aria-label', message('scheduleButtonActive', String(scheduledTasks.length)));
    } else {
      setScheduleNameValue('', nextDefaultTaskName());
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

  async function submitScheduledBatch(task = null) {
    const scheduledAt = new Date(elements.scheduleAt.value).getTime();
    if (!Number.isFinite(scheduledAt)) {
      setStatus(message('scheduledTaskMissingTimeError'));
      return;
    }

    let options = task?.options || null;
    const taskName = task
      ? (scheduleNameTouched && elements.scheduleName.value.trim()
        ? elements.scheduleName.value.trim()
        : taskDisplayName(task, scheduledTasks.indexOf(task) + 1))
      : (scheduleNameTouched && elements.scheduleName.value.trim()
        ? elements.scheduleName.value.trim()
        : nextDefaultTaskName());

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
    clearPendingUpdate(false);
    renderScheduledTasks(nextTasks, response.task.id);
    setSchedulePanelOpen(false);

    setStatus(task
      ? message('scheduledTaskUpdatedStatus')
      : message('scheduledTaskSavedStatus', formatScheduledAt(response.task.scheduledAt)));
  }

  async function cancelScheduledBatch(taskId) {
    const task = taskId ? scheduledTasks.find((t) => t.id === taskId) : selectedTask();
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

  function scheduleBatch() {
    clearPendingUpdate(false);
    return submitScheduledBatch(null);
  }

  function updateScheduledBatch(taskId) {
    const task = scheduledTasks.find((item) => item.id === taskId);
    if (!task) {
      return;
    }

    if (selectedTaskId !== task.id) {
      selectedTaskId = task.id;
      renderScheduledTasks(scheduledTasks, task.id);
    }

    if (pendingUpdateTaskId !== task.id) {
      pendingUpdateTaskId = task.id;
      renderTaskList();
      return;
    }

    return submitScheduledBatch(task);
  }

  function bindScheduleEvents() {
    setDefaultScheduleTime();
    elements.scheduleButton.addEventListener('click', (event) => {
      event.stopPropagation();
      if (elements.schedulePanel.hidden) {
        openSchedulePanel();
      } else {
        setSchedulePanelOpen(false);
      }
    });
    elements.scheduleTaskList.addEventListener('click', (event) => {
      const button = event.target.closest('.schedule-task-item');
      if (!button) {
        return;
      }

      clearPendingUpdate(false);
      selectedTaskId = button.dataset.taskId;
      renderScheduledTasks(scheduledTasks, selectedTaskId);
    });
    elements.schedulePanel.addEventListener('click', (event) => event.stopPropagation());
    elements.schedulePanelCloseButton.addEventListener('click', () => setSchedulePanelOpen(false));
    elements.scheduleNewButton.addEventListener('click', scheduleBatch);
    elements.scheduleSaveButton.addEventListener('click', scheduleBatch);
    elements.scheduleName.addEventListener('input', () => {
      scheduleNameTouched = true;
      clearPendingUpdate();
    });
    const clearPendingUpdateOnTimeChange = () => clearPendingUpdate();
    elements.scheduleAt.addEventListener('input', clearPendingUpdateOnTimeChange);
    elements.scheduleAt.addEventListener('change', clearPendingUpdateOnTimeChange);
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
