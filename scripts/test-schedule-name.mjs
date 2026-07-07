import assert from 'assert';
import {
  defaultTaskName,
  taskDisplayName,
  defaultTaskNameIndex,
  nextDefaultTaskName,
  setScheduleNameValue
} from '../popup/schedule-name.js';

// Setup mock chrome API for i18n
globalThis.chrome = {
  i18n: {
    getMessage: (key, substitutions) => {
      if (key === 'scheduledTaskDefaultName') {
        // Simple mock implementation
        return `任务${substitutions}`;
      }
      if (key === 'scheduleNamePlaceholder') {
        return '任务名称';
      }
      return key;
    }
  }
};

function runTests() {
  console.log('Testing defaultTaskName...');
  assert.strictEqual(defaultTaskName(5), '任务5');

  console.log('Testing taskDisplayName...');
  assert.strictEqual(taskDisplayName({ name: 'Custom Name' }), 'Custom Name');
  assert.strictEqual(taskDisplayName({ name: '' }, 3), '任务3');
  assert.strictEqual(taskDisplayName(null, 2), '任务2');

  console.log('Testing defaultTaskNameIndex...');
  assert.strictEqual(defaultTaskNameIndex('任务5'), 5);
  assert.strictEqual(defaultTaskNameIndex('Task 10'), 10);
  assert.strictEqual(defaultTaskNameIndex('Custom Task'), 0);

  console.log('Testing nextDefaultTaskName...');
  // Case 1: Empty tasks list -> should return next default name (任務1)
  assert.strictEqual(nextDefaultTaskName([]), '任务1');

  // Case 2: Some default tasks exist
  const tasks = [
    { name: '任务1' },
    { name: '任务2' }
  ];
  assert.strictEqual(nextDefaultTaskName(tasks), '任务3');

  // Case 3: Out-of-order default tasks exist
  const tasksOutOfOrder = [
    { name: '任务5' },
    { name: '任务2' }
  ];
  assert.strictEqual(nextDefaultTaskName(tasksOutOfOrder), '任务6');

  // Case 4: Non-default task name doesn't interfere
  const tasksWithCustom = [
    { name: 'Custom Task' },
    { name: '任务1' }
  ];
  assert.strictEqual(nextDefaultTaskName(tasksWithCustom), '任务3');

  console.log('Testing setScheduleNameValue...');
  const elements = {
    scheduleName: {
      value: '',
      placeholder: ''
    }
  };
  setScheduleNameValue(elements, 'My Task', 'Fallback');
  assert.strictEqual(elements.scheduleName.value, 'My Task');
  assert.strictEqual(elements.scheduleName.placeholder, '任务名称');

  setScheduleNameValue(elements, '', 'Fallback');
  assert.strictEqual(elements.scheduleName.value, '');
  assert.strictEqual(elements.scheduleName.placeholder, 'Fallback');

  console.log('All schedule name tests passed!');
}

runTests();
