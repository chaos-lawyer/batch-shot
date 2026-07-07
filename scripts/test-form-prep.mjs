import assert from 'assert';
import { createPrepareFormJobs, runPrepareForms } from '../background/form-prep-runner.js';

let statusLog = [];
let rowsLog = [];

const mockBatchStatus = {
  start: (status) => statusLog.push({ type: 'start', status }),
  reset: () => statusLog.push({ type: 'reset' }),
  getState: () => ({ stopping: false }),
  updateProgress: () => {}
};

const mockSetStatus = (statusInfo) => {
  statusLog.push({ type: 'setStatus', statusInfo });
};

const mockStatusError = (key) => new Error(`statusError:${key}`);
const mockStatusFromError = (error) => ({
  statusKey: error.message.replace('statusError:', '')
});

const mockRunCaptureJobs = async (jobs, options, deps) => {
  const rows = [];
  for (let i = 0; i < jobs.length; i++) {
    const row = await deps.captureSingleJob(jobs[i], i, jobs.length);
    rows.push(row);
  }
  rowsLog.push(...rows);
  return rows;
};

const mockCreateExplicitJobs = (options, deps) => {
  assert.ok(deps && typeof deps.statusError === 'function', 'deps with statusError must be passed to createExplicitJobs');
  return options.jobs.map((job) => ({
    kind: job.kind || 'search',
    url: job.url || 'https://example.com',
    search: job.search
  }));
};

const mockCreateSearchJobs = (options, deps) => {
  assert.ok(deps && typeof deps.statusError === 'function', 'deps with statusError must be passed to createSearchJobs');
  return [];
};

const mockCreateReportRow = (row) => row;

async function runTests() {
  console.log('Testing createPrepareFormJobs...');
  const depsForJobs = {
    createExplicitJobs: mockCreateExplicitJobs,
    createSearchJobs: mockCreateSearchJobs,
    statusError: mockStatusError
  };

  const jobsOptions = {
    jobs: [
      { kind: 'url', url: 'https://example.com/1' },
      { kind: 'search', url: 'https://example.com/2' }
    ]
  };

  const filteredJobs = createPrepareFormJobs(jobsOptions, depsForJobs);
  assert.strictEqual(filteredJobs.length, 1, 'Should filter out non-search jobs');
  assert.strictEqual(filteredJobs[0].url, 'https://example.com/2', 'Should keep search job');

  console.log('Testing runPrepareForms with no search jobs...');
  statusLog = [];
  await runPrepareForms({ jobs: [{ kind: 'url' }] }, {
    ...depsForJobs,
    batchStatus: mockBatchStatus,
    setStatus: mockSetStatus,
    statusError: mockStatusError,
    statusFromError: mockStatusFromError,
    runCaptureJobs: mockRunCaptureJobs
  });

  assert.strictEqual(statusLog.find(l => l.type === 'setStatus').statusInfo.statusKey, 'openFillNoSearchJobsError', 'Should error when no search jobs');

  console.log('Testing runPrepareForms with successful and failed fill...');
  statusLog = [];
  rowsLog = [];

  const depsForRun = {
    ...depsForJobs,
    chrome: {
      tabs: {
        create: async (opts) => ({ id: Math.random() }),
        get: async (id) => ({ url: 'https://example.com/resolved', title: 'Resolved' })
      }
    },
    batchStatus: mockBatchStatus,
    setStatus: mockSetStatus,
    statusError: mockStatusError,
    statusFromError: mockStatusFromError,
    waitForTabComplete: async () => {},
    sendTabMessage: async (tabId, message) => {
      if (message.payload === 'fail') {
        return { ok: false, statusKey: 'searchSubmitError' };
      }
      return { ok: true };
    },
    runCaptureJobs: mockRunCaptureJobs,
    createReportRow: mockCreateReportRow
  };

  await runPrepareForms({
    jobs: [
      { kind: 'search', url: 'https://example.com/success', search: 'success' },
      { kind: 'search', url: 'https://example.com/fail', search: 'fail' }
    ]
  }, depsForRun);

  assert.strictEqual(rowsLog.length, 2, 'Should process two rows');
  assert.strictEqual(rowsLog[0].status, 'ok', 'First job should be ok');
  assert.strictEqual(rowsLog[1].status, 'error', 'Second job should be error');
  assert.strictEqual(rowsLog[1].error, 'searchSubmitError', 'Second job error should match');

  const doneStatus = statusLog.find(l => l.type === 'setStatus' && l.statusInfo.statusKey === 'openFillDoneStatus');
  assert.ok(doneStatus, 'Should set done status');
  assert.deepStrictEqual(doneStatus.statusInfo.statusArgs, ['1', '1'], 'Should have 1 success, 1 failure');

  console.log('All form prep tests passed!');
}

runTests().catch((error) => {
  console.error('Test failed:', error);
  process.exit(1);
});
