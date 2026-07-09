import assert from 'node:assert/strict';
import {
  clearTaskHistoryAlerts,
  createRetryAllOptions,
  createRetryOptions,
  finishCaptureTaskHistory,
  getTaskHistory,
  saveCaptureTaskHistory,
  startCaptureTaskHistory,
  updateCaptureTaskHistory
} from '../background/task-history.js';

let stored = {};
const chromeApi = {
  storage: {
    local: {
      async get(key) {
        return { [key]: stored[key] };
      },
      async set(value) {
        stored = { ...stored, ...value };
      }
    }
  }
};

await saveCaptureTaskHistory({
  options: {
    delay: 1,
    folder: 'BatchShot',
    closeBatchTabsAfterCapture: true
  },
  jobs: [
    { kind: 'url', url: 'https://ok.example', urlContext: { keyword: 'ok' } },
    { kind: 'url', url: 'https://bad.example', urlContext: { keyword: 'bad' } },
    {
      kind: 'search',
      url: 'https://search.example',
      search: {
        keyword: 'company',
        fields: [{ selector: '#q', value: 'company' }],
        submitMode: 'enter'
      },
      urlContext: { keyword: 'company' },
      waitForLoad: false
    }
  ],
  rows: [
    { index: 1, url: 'https://ok.example', status: 'ok' },
    { index: 2, url: 'https://bad.example', status: 'error', error: 'pageLoadTimeoutError' },
    { index: 3, url: 'https://search.example/result', status: 'error', error: 'capturePrepareError' }
  ]
}, chromeApi);

const tasks = await getTaskHistory(chromeApi);
assert.equal(tasks.length, 1);
assert.equal(tasks[0].successful, 1);
assert.equal(tasks[0].failed, 2);

const retryOptions = createRetryOptions(tasks[0]);
assert.equal(retryOptions.jobs.length, 2);
assert.deepEqual(retryOptions.jobs.map((job) => job.url), [
  'https://bad.example',
  'https://search.example'
]);
assert.equal(retryOptions.jobs[1].search.keyword, 'company');
assert.equal(retryOptions.closeBatchTabsAfterCapture, true);

stored = {};
const runningTask = await startCaptureTaskHistory({
  options: {
    delay: 1,
    folder: 'BatchShot',
    closeBatchTabsAfterCapture: true
  },
  jobs: [
    { kind: 'url', url: 'https://done.example' },
    { kind: 'url', url: 'https://failed.example' },
    { kind: 'url', url: 'https://unfinished.example' }
  ]
}, chromeApi);
assert.equal(runningTask.status, 'running');
assert.equal(runningTask.incomplete, 3);

await updateCaptureTaskHistory(runningTask.id, {
  index: 1,
  url: 'https://done.example',
  status: 'ok'
}, chromeApi);
await updateCaptureTaskHistory(runningTask.id, {
  index: 2,
  url: 'https://failed.example',
  status: 'error',
  error: 'pageLoadTimeoutError'
}, chromeApi);
await finishCaptureTaskHistory(runningTask.id, {}, chromeApi);

const interruptedTasks = await getTaskHistory(chromeApi);
assert.equal(interruptedTasks.length, 1);
assert.equal(interruptedTasks[0].status, 'interrupted');
assert.equal(interruptedTasks[0].successful, 1);
assert.equal(interruptedTasks[0].failed, 1);
assert.equal(interruptedTasks[0].incomplete, 1);
assert.equal(interruptedTasks[0].retryable, 2);

const resumeOptions = createRetryOptions(interruptedTasks[0]);
assert.deepEqual(resumeOptions.jobs.map((job) => job.url), [
  'https://failed.example',
  'https://unfinished.example'
]);

const retryAllOptions = createRetryAllOptions(interruptedTasks);
assert.deepEqual(retryAllOptions.jobs.map((job) => job.url), [
  'https://failed.example',
  'https://unfinished.example'
]);

await saveCaptureTaskHistory({
  options: {
    delay: 1,
    folder: 'BatchShot',
    closeBatchTabsAfterCapture: true
  },
  jobs: [
    { kind: 'url', url: 'https://clean.example' }
  ],
  rows: [
    { index: 1, url: 'https://clean.example', status: 'ok' }
  ]
}, chromeApi);

const clearedTasks = await clearTaskHistoryAlerts(chromeApi);
assert.equal(clearedTasks.length, 1);
assert.equal(clearedTasks[0].status, 'done');
assert.equal(clearedTasks[0].retryable, 0);
assert.equal(clearedTasks[0].jobs[0].url, 'https://clean.example');

// Test: Saving two failed tasks in a row must only keep the most recent one when limit is 1
stored = {};
await saveCaptureTaskHistory({
  options: {},
  jobs: [{ kind: 'url', url: 'https://failed1.example' }],
  rows: [{ index: 1, url: 'https://failed1.example', status: 'error', error: 'error1' }]
}, chromeApi);

await saveCaptureTaskHistory({
  options: {},
  jobs: [{ kind: 'url', url: 'https://failed2.example' }],
  rows: [{ index: 1, url: 'https://failed2.example', status: 'error', error: 'error2' }]
}, chromeApi);

const historyAfterTwo = await getTaskHistory(chromeApi);
assert.equal(historyAfterTwo.length, 1, 'Should only keep 1 task in history');
assert.equal(historyAfterTwo[0].rows[0].url, 'https://failed2.example', 'Should keep the most recent failed task');

console.log('Task history tests passed');
