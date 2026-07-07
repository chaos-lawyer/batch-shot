import { message } from '../utils/i18n.js';
import { icon } from './dom-helpers.js';
import { taskDisplayName, nextDefaultTaskName, setScheduleNameValue } from './schedule-name.js';

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

export function renderUrlPreview(task, elements) {
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

export function renderTaskList(state, elements, { onUpdate, onCancel }) {
  elements.scheduleTaskList.replaceChildren();

  state.scheduledTasks.forEach((task, index) => {
    const isConfirming = task.id === state.pendingUpdateTaskId;
    const button = document.createElement('div');
    button.className = 'schedule-task-item';
    button.classList.toggle('is-selected', task.id === state.selectedTaskId);
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
    updateBtn.append(icon(task.id === state.pendingUpdateTaskId ? 'check' : 'update'));

    updateBtn.addEventListener('click', (event) => {
      event.stopPropagation();
      onUpdate(task.id);
    });

    const deleteBtn = document.createElement('button');
    const deleteLabel = message(isConfirming ? 'cancelUpdateConfirmButton' : 'cancelScheduleButton');
    deleteBtn.type = 'button';
    deleteBtn.className = 'icon-button schedule-task-cancel-button';
    deleteBtn.title = deleteLabel;
    deleteBtn.setAttribute('aria-label', deleteLabel);
    deleteBtn.dataset.taskId = task.id;
    deleteBtn.append(icon(isConfirming ? 'cancel' : 'trash'));

    deleteBtn.addEventListener('click', (event) => {
      event.stopPropagation();
      onCancel(task.id, isConfirming);
    });

    button.append(time, count, updateBtn, deleteBtn);
    elements.scheduleTaskList.append(button);
  });
}

export function renderScheduledTasks(state, elements, callbacks) {
  const hasPreferred = state.scheduledTasks.some((task) => task.id === state.selectedTaskId);
  state.selectedTaskId = hasPreferred ? state.selectedTaskId : state.scheduledTasks[0]?.id || '';
  if (state.pendingUpdateTaskId !== state.selectedTaskId) {
    state.pendingUpdateTaskId = '';
  }
  const task = state.selectedTask();
  const hasTasks = state.scheduledTasks.length > 0;

  elements.scheduleNewButton.hidden = !hasTasks;
  elements.scheduleSaveButton.hidden = Boolean(task);
  elements.scheduleButton.classList.toggle('is-active', hasTasks);
  elements.scheduleSaveButton.title = message('scheduleButton');
  elements.scheduleSaveButton.dataset.i18nTitle = 'scheduleButton';

  if (task) {
    elements.scheduleAt.value = toDatetimeLocalValue(task.scheduledAt);
    setScheduleNameValue(elements, '', nextDefaultTaskName(state.scheduledTasks));
    elements.scheduleButton.title = message('scheduleButtonActive', String(state.scheduledTasks.length));
    elements.scheduleButton.setAttribute('aria-label', message('scheduleButtonActive', String(state.scheduledTasks.length)));
  } else {
    setScheduleNameValue(elements, '', nextDefaultTaskName(state.scheduledTasks));
    elements.scheduleButton.title = message('scheduleButton');
    elements.scheduleButton.setAttribute('aria-label', message('scheduleButton'));
    // Set default schedule time
    if (!elements.scheduleAt.value) {
      elements.scheduleAt.value = toDatetimeLocalValue(Date.now() + 10 * 60 * 1000);
    }
  }

  renderTaskList(state, elements, callbacks);
  renderUrlPreview(task, elements);
}
