import { message } from '../utils/i18n.js';

export function defaultTaskName(index) {
  return message('scheduledTaskDefaultName', String(index));
}

export function taskDisplayName(task, index = 0) {
  return String(task?.name || '').trim() || defaultTaskName(index || 1);
}

export function defaultTaskNameIndex(name) {
  const normalized = String(name || '').trim();
  const match = normalized.match(/^任务(\d+)$/) || normalized.match(/^Task\s+(\d+)$/i);
  return match ? Number(match[1]) : 0;
}

export function nextDefaultTaskName(scheduledTasks) {
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

export function setScheduleNameValue(elements, value, fallbackName) {
  elements.scheduleName.value = String(value || '').trim();
  elements.scheduleName.placeholder = elements.scheduleName.value ? message('scheduleNamePlaceholder') : fallbackName;
}
