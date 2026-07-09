import { message } from '../utils/i18n.js';
import { el, icon } from './dom-helpers.js';

function summarizeFailures(task) {
  return (task.rows || [])
    .filter((row) => row.status === 'error')
    .map((row) => ({
      url: row.url || task.jobs?.[row.index - 1]?.url || '',
      error: row.error || message('unknownCaptureError')
    }));
}

function summarizeIncomplete(task, includeRunningIncomplete) {
  if (task.status === 'running' && !includeRunningIncomplete) {
    return [];
  }

  const completedIndexes = new Set((task.rows || []).map((row) => row.index).filter(Boolean));
  return (task.jobs || [])
    .map((job, index) => ({ index: index + 1, url: job.url }))
    .filter((job) => !completedIndexes.has(job.index))
    .map((job) => ({
      url: job.url,
      error: message('taskHistoryIncompleteItem')
    }));
}

function summarizeRetryItems(task, includeRunningIncomplete) {
  return [
    ...summarizeFailures(task),
    ...summarizeIncomplete(task, includeRunningIncomplete)
  ];
}

function getRetryableCount(task, includeRunningIncomplete) {
  const incomplete = task.status === 'running' && !includeRunningIncomplete
    ? 0
    : Number(task.incomplete || 0);
  return Number(task.failed || 0) + incomplete;
}

function getRetryableTasks(tasks, includeRunningIncomplete) {
  return tasks.filter((task) => getRetryableCount(task, includeRunningIncomplete) > 0);
}

export function createTaskHistory({
  elements,
  getBatchUiState,
  setRunning,
  setStatus
}) {
  let tasks = [];

  function closeTaskHistory() {
    elements.taskHistoryPanel.hidden = true;
    elements.taskHistoryButton.setAttribute('aria-expanded', 'false');
  }

  function openTaskHistory() {
    elements.taskHistoryPanel.hidden = false;
    elements.taskHistoryButton.setAttribute('aria-expanded', 'true');
  }

  function toggleTaskHistory() {
    if (elements.taskHistoryPanel.hidden) {
      openTaskHistory();
      return;
    }

    closeTaskHistory();
  }

  function createFailureRow(row, taskId) {
    const cleanUrl = (row.url || '-').replace(/^https?:\/\/(www\.)?/, '');
    const errText = row.error || message('unknownCaptureError');
    const friendlyError = message(errText) || errText;

    return el('div', { className: 'task-history-failure' }, [
      el('div', { className: 'task-history-failure-content' }, [
        el('span', { className: 'task-history-url', textContent: cleanUrl }),
        el('span', { className: 'task-history-error', textContent: friendlyError })
      ]),
      el('div', { className: 'task-history-failure-actions' }, [
        el('button', {
          type: 'button',
          className: 'history-button task-history-retry',
          title: message('taskHistoryRetryFailedButton'),
          attrs: { 'aria-label': message('taskHistoryRetryFailedButton') },
          dataset: { taskId }
        }, [icon('update', 15)]),
        el('button', {
          type: 'button',
          className: 'history-button task-history-ignore',
          title: message('taskHistoryIgnoreFailedButton') || 'Delete',
          attrs: { 'aria-label': message('taskHistoryIgnoreFailedButton') || 'Delete' },
          dataset: { taskId, url: row.url, action: 'ignore' }
        }, [icon('trash', 14)])
      ])
    ]);
  }

  function render() {
    const includeRunningIncomplete = !getBatchUiState().running;
    const retryableTasks = getRetryableTasks(tasks, includeRunningIncomplete);
    const retryableCount = retryableTasks.reduce((sum, task) => (
      sum + getRetryableCount(task, includeRunningIncomplete)
    ), 0);

    elements.taskHistoryButton.hidden = retryableCount === 0;
    elements.taskHistoryButton.dataset.count = String(retryableCount);
    elements.taskHistoryList.replaceChildren();

    if (!retryableTasks.length) {
      elements.taskHistorySummary.textContent = message('taskHistoryEmpty');
      elements.taskHistoryList.append(el('div', {
        className: 'task-history-empty',
        textContent: message('taskHistoryEmptyDetail')
      }));
      closeTaskHistory();
      return;
    }

    elements.taskHistorySummary.textContent = message('taskHistoryRetrySummary', String(retryableCount));
    
    // Since TASK_HISTORY_LIMIT is 1, there is at most 1 retryable task
    const task = retryableTasks[0];
    const retryItems = summarizeRetryItems(task, includeRunningIncomplete);
    const visibleRetryItems = retryItems.slice(0, 4);
    const hiddenRetryCount = Math.max(0, retryItems.length - visibleRetryItems.length);

    elements.taskHistoryList.append(
      ...visibleRetryItems.map((row) => createFailureRow(row, task.id))
    );

    if (hiddenRetryCount > 0) {
      elements.taskHistoryList.append(el('div', {
        className: 'task-history-more',
        textContent: message('taskHistoryMoreFailures', String(hiddenRetryCount))
      }));
    }
  }

  async function refreshTaskHistory() {
    const response = await chrome.runtime.sendMessage({ action: 'getTaskHistory' });
    tasks = response?.ok && Array.isArray(response.tasks) ? response.tasks : [];
    render();
  }

  async function retryFailedTask(taskId) {
    const response = await chrome.runtime.sendMessage({
      action: 'retryFailedTask',
      payload: { taskId }
    });

    if (!response?.ok) {
      setStatus(message(response?.statusKey || 'unknownCaptureError', response?.statusArgs || []));
      return;
    }

    setRunning({ running: true });
    setStatus(message('taskHistoryRetryStartedStatus', String(response.count || 0)));
    closeTaskHistory();
  }

  async function ignoreFailedTaskRow(taskId, url) {
    const response = await chrome.runtime.sendMessage({
      action: 'ignoreTaskHistoryRow',
      payload: { taskId, url }
    });

    if (!response?.ok) {
      setStatus(message(response?.statusKey || 'unknownCaptureError', response?.statusArgs || []));
      return;
    }

    await refreshTaskHistory();
  }

  async function retryAllFailedTasks() {
    const response = await chrome.runtime.sendMessage({ action: 'retryAllFailedTasks' });

    if (!response?.ok) {
      setStatus(message(response?.statusKey || 'unknownCaptureError', response?.statusArgs || []));
      return;
    }

    setRunning({ running: true });
    setStatus(message('taskHistoryRetryStartedStatus', String(response.count || 0)));
    closeTaskHistory();
  }

  async function clearTaskHistoryAlerts() {
    const response = await chrome.runtime.sendMessage({ action: 'clearTaskHistoryAlerts' });
    if (!response?.ok) {
      setStatus(message(response?.statusKey || 'unknownCaptureError', response?.statusArgs || []));
      return;
    }

    tasks = Array.isArray(response.tasks) ? response.tasks : [];
    render();
    setStatus(message('taskHistoryClearStatus'));
  }

  function bindTaskHistoryEvents() {
    elements.taskHistoryRetryAllButton.addEventListener('click', () => {
      retryAllFailedTasks().catch(() => setStatus(message('unknownCaptureError')));
    });

    elements.taskHistoryClearButton.addEventListener('click', () => {
      clearTaskHistoryAlerts().catch(() => setStatus(message('unknownCaptureError')));
    });

    elements.taskHistoryButton.addEventListener('click', (event) => {
      event.stopPropagation();
      toggleTaskHistory();
    });

    elements.taskHistoryPanel.addEventListener('click', (event) => {
      event.stopPropagation();
    });

    elements.taskHistoryList.addEventListener('click', (event) => {
      const button = event.target.closest('[data-task-id]');
      if (!button) {
        return;
      }
      
      const { taskId, url, action } = button.dataset;
      if (action === 'ignore') {
        ignoreFailedTaskRow(taskId, url).catch(() => setStatus(message('unknownCaptureError')));
      } else {
        retryFailedTask(taskId).catch(() => setStatus(message('unknownCaptureError')));
      }
    });
  }

  return {
    bindTaskHistoryEvents,
    closeTaskHistory,
    refreshTaskHistory
  };
}
