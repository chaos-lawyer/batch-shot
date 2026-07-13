import assert from 'node:assert/strict';
import { createBatchStatusState, createReportRow, runCaptureJobs } from '../background/capture-flow.js';

assert.deepEqual(createReportRow({
  index: 0,
  url: 'https://example.com',
  title: 'Example',
  filename: 'BatchShot/example.png',
  status: 'ok'
}), {
  index: 1,
  url: 'https://example.com',
  title: 'Example',
  filename: 'BatchShot/example.png',
  status: 'ok',
  error: ''
});

assert.deepEqual(createReportRow({
  index: 1,
  url: 'https://bad.example',
  status: 'error',
  error: 'capturePrepareError'
}), {
  index: 2,
  url: 'https://bad.example',
  title: '',
  filename: '',
  status: 'error',
  error: 'capturePrepareError'
});

let pausedWaits = 0;
let stop = false;
const rows = await runCaptureJobs(['a', 'b', 'c'], {}, {
  shouldStop: () => stop,
  waitWhilePaused: async () => {
    pausedWaits += 1;
  },
  captureSingleJob: async (job, index) => {
    if (job === 'b') {
      stop = true;
    }
    return createReportRow({ index, url: job, status: 'ok' });
  }
});
assert.equal(pausedWaits, 2);
assert.deepEqual(rows.map((row) => row.url), ['a', 'b']);

const emitted = [];
const batch = createBatchStatusState((state) => emitted.push(state));
batch.start('runningStatus');
assert.equal(batch.getState().running, true);
assert.equal(batch.getState().statusKey, 'runningStatus');

assert.equal(batch.togglePause(), true);
assert.equal(batch.getState().paused, true);
assert.equal(batch.getState().statusKey, 'pausedStatus');

assert.equal(batch.togglePause(), true);
assert.equal(batch.getState().paused, false);
assert.equal(batch.getState().statusKey, 'runningStatus');

batch.updateProgress(1, 3, 'https://example.com');
assert.deepEqual(batch.getState().statusArgs, ['2', '3', 'https://example.com']);

batch.finish([
  createReportRow({ index: 0, url: 'ok', status: 'ok' }),
  createReportRow({ index: 1, url: 'bad', status: 'error', error: 'capturePrepareError' })
], true);
assert.equal(batch.getState().running, false);
assert.equal(batch.getState().statusKey, 'batchDoneWithReportStatus');
assert.deepEqual(batch.getState().statusArgs, ['1', '1']);

batch.start('runningStatus');
batch.addLog('https://bad.example', 'error', 'pageLoadTimeoutError', 'Bad page');
let stopSignals = 0;
batch.onStop(() => {
  stopSignals += 1;
});
batch.requestStop();
assert.equal(batch.getState().stopping, true);
assert.equal(batch.getState().statusKey, 'stoppingStatus');
assert.equal(stopSignals, 1);
assert.deepEqual(batch.getState().logs, [{
  url: 'https://bad.example',
  status: 'error',
  error: 'pageLoadTimeoutError',
  title: 'Bad page'
}]);
assert.equal(batch.togglePause(), false);
assert.ok(emitted.length >= 6);

console.log('Capture flow tests passed');
