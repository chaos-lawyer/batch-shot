import { message } from '../utils/i18n.js';
import { createScheduleState } from './schedule-state.js';
import { nextDefaultTaskName, setScheduleNameValue } from './schedule-name.js';
import { renderScheduledTasks, renderTaskList } from './schedule-render.js';
import { createScheduleActionsBound } from './schedule-actions.js';

function toDatetimeLocalValue(timestamp) {
  const date = new Date(timestamp);
  const offsetDate = new Date(date.getTime() - date.getTimezoneOffset() * 60 * 1000);
  return offsetDate.toISOString().slice(0, 16);
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
  const state = createScheduleState();

  const boundActions = createScheduleActionsBound({
    state,
    elements,
    persistSettings,
    getSettings,
    getUrlInputMode,
    parseUrls,
    buildTemplateUrls,
    rememberCurrentInputs,
    setStatus,
    renderScheduledTasks: () => renderScheduledTasks(state, elements, {
      onUpdate: handleUpdate,
      onCancel: handleCancel
    })
  });

  function clearPendingUpdate(shouldRender = true) {
    if (!state.pendingUpdateTaskId) {
      return;
    }
    state.pendingUpdateTaskId = '';
    if (shouldRender) {
      renderTaskList(state, elements, {
        onUpdate: handleUpdate,
        onCancel: handleCancel
      });
    }
  }

  function setDefaultScheduleTime() {
    if (elements.scheduleAt.value) {
      return;
    }
    elements.scheduleAt.value = toDatetimeLocalValue(Date.now() + 10 * 60 * 1000);
  }

  function setSchedulePanelOpen(isOpen) {
    if (!state.isScheduleEnabled) {
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
    if (!state.isScheduleEnabled) {
      setSchedulePanelOpen(false);
      return;
    }

    try {
      await boundActions.refreshScheduledTask();
    } catch (_) {
      setStatus(message('scheduledTaskError'));
    }

    setSchedulePanelOpen(true);
  }

  function handleUpdate(taskId) {
    const task = state.scheduledTasks.find((item) => item.id === taskId);
    if (!task) {
      return;
    }

    if (state.selectedTaskId !== task.id) {
      state.selectedTaskId = task.id;
      renderScheduledTasks(state, elements, {
        onUpdate: handleUpdate,
        onCancel: handleCancel
      });
    }

    if (state.pendingUpdateTaskId !== task.id) {
      state.pendingUpdateTaskId = task.id;
      renderTaskList(state, elements, {
        onUpdate: handleUpdate,
        onCancel: handleCancel
      });
      return;
    }

    clearPendingUpdate(false);
    return boundActions.submitScheduledBatch(task);
  }

  function handleCancel(taskId, isConfirming) {
    if (isConfirming) {
      clearPendingUpdate();
    } else {
      boundActions.cancelScheduledBatch(taskId);
    }
  }

  function scheduleBatch() {
    clearPendingUpdate(false);
    return boundActions.submitScheduledBatch(null);
  }

  function setScheduleEnabled(isEnabled) {
    state.isScheduleEnabled = Boolean(isEnabled);
    elements.scheduleButton.hidden = !state.isScheduleEnabled;
    elements.scheduleButton.parentElement?.classList.toggle('has-schedule-trigger', state.isScheduleEnabled);

    if (!state.isScheduleEnabled) {
      setSchedulePanelOpen(false);
      state.scheduledTasks = [];
      renderScheduledTasks(state, elements, {
        onUpdate: handleUpdate,
        onCancel: handleCancel
      });
    }
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
      state.selectedTaskId = button.dataset.taskId;
      renderScheduledTasks(state, elements, {
        onUpdate: handleUpdate,
        onCancel: handleCancel
      });
    });

    elements.schedulePanel.addEventListener('click', (event) => event.stopPropagation());
    elements.schedulePanelCloseButton.addEventListener('click', () => setSchedulePanelOpen(false));
    elements.scheduleNewButton.addEventListener('click', scheduleBatch);
    elements.scheduleSaveButton.addEventListener('click', scheduleBatch);
    
    elements.scheduleName.addEventListener('input', () => {
      state.scheduleNameTouched = true;
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
    refreshScheduledTask: boundActions.refreshScheduledTask,
    setScheduleEnabled
  };
}
