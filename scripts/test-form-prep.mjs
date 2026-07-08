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

const mockCreateUrlJobs = (urls) => urls.map((url) => ({ kind: 'url', url }));

const mockCreateReportRow = (row) => row;

async function runTests() {
  console.log('Testing createPrepareFormJobs...');
  const depsForJobs = {
    createExplicitJobs: mockCreateExplicitJobs,
    createSearchJobs: mockCreateSearchJobs,
    createUrlJobs: mockCreateUrlJobs,
    statusError: mockStatusError
  };

  const jobsOptions = {
    jobs: [
      { kind: 'url', url: 'https://example.com/1' },
      { kind: 'search', url: 'https://example.com/2' }
    ]
  };

  const filteredJobs = createPrepareFormJobs(jobsOptions, depsForJobs);
  assert.strictEqual(filteredJobs.length, 2, 'Should keep URL and search jobs');
  assert.strictEqual(filteredJobs[0].url, 'https://example.com/1', 'Should keep URL job');
  assert.strictEqual(filteredJobs[1].url, 'https://example.com/2', 'Should keep search job');

  const listJobs = createPrepareFormJobs({ urlInputMode: 'list', urls: ['https://example.com/list'] }, depsForJobs);
  assert.strictEqual(listJobs.length, 1, 'Should create URL jobs for list mode');
  assert.strictEqual(listJobs[0].kind, 'url', 'List mode job should be URL job');

  console.log('Testing runPrepareForms with no preparable jobs...');
  statusLog = [];
  await runPrepareForms({ urlInputMode: 'list', urls: [] }, {
    ...depsForJobs,
    batchStatus: mockBatchStatus,
    setStatus: mockSetStatus,
    statusError: mockStatusError,
    statusFromError: mockStatusFromError,
    runCaptureJobs: mockRunCaptureJobs
  });

  assert.strictEqual(statusLog.find(l => l.type === 'setStatus').statusInfo.statusKey, 'openFillNoSearchJobsError', 'Should error when no preparable jobs');

  console.log('Testing runPrepareForms with URL open, successful fill, and failed fill...');
  statusLog = [];
  rowsLog = [];
  const sentMessages = [];

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
      sentMessages.push(message);
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
      { kind: 'url', url: 'https://example.com/open' },
      { kind: 'search', url: 'https://example.com/success', search: 'success' },
      { kind: 'search', url: 'https://example.com/fail', search: 'fail' }
    ]
  }, depsForRun);

  assert.strictEqual(rowsLog.length, 3, 'Should process three rows');
  assert.strictEqual(rowsLog[0].status, 'ok', 'URL job should be ok');
  assert.strictEqual(rowsLog[1].status, 'ok', 'Successful fill job should be ok');
  assert.strictEqual(rowsLog[2].status, 'error', 'Failed fill job should be error');
  assert.strictEqual(rowsLog[2].error, 'searchSubmitError', 'Failed fill job error should match');
  assert.strictEqual(sentMessages.length, 2, 'Should only send fill messages for search jobs');

  const doneStatus = statusLog.find(l => l.type === 'setStatus' && l.statusInfo.statusKey === 'openFillDoneStatus');
  assert.ok(doneStatus, 'Should set done status');
  assert.deepStrictEqual(doneStatus.statusInfo.statusArgs, ['2', '1'], 'Should have 2 successes, 1 failure');

  console.log('All form prep tests passed!');
}

runTests().catch((error) => {
  console.error('Test failed:', error);
  process.exit(1);
});
