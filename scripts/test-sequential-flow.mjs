import assert from 'node:assert/strict';
import { captureCurrentTabSequence } from '../background/capture-page-runner.js';
import { SequentialCaptureError } from '../background/status-error.js';

// Mock chrome API
const mockTab = { id: 123, url: 'http://localhost/list', title: 'Test List' };
let tabMessageSent = [];
globalThis.chrome = {
  tabs: {
    query: async () => [mockTab],
    get: async () => mockTab,
    update: async () => mockTab,
    captureVisibleTab: async () => 'data:image/png;base64,...',
    sendMessage: async (tabId, msg) => {
      return mockDeps.sendTabMessage(tabId, msg);
    }
  },
  downloads: {
    download: async () => 1
  },
  scripting: {
    executeScript: async () => [{ result: {} }]
  },
  runtime: {
    getURL: () => 'offscreen/offscreen.html',
    getContexts: async () => [],
    sendMessage: async (msg) => {
      if (msg.action === 'stitch') {
        return { ok: true, dataUrl: 'data:image/png;base64,...' };
      }
      return { ok: true };
    }
  },
  offscreen: {
    createDocument: async () => {},
    closeDocument: async () => {}
  },
  windows: {
    update: async () => {}
  }
};

// Mock other dependencies
let batchStatusState = {
  running: false,
  paused: false,
  stopping: false,
  statusKey: 'idleStatus',
  statusArgs: []
};

const mockBatchStatus = {
  getState() {
    return batchStatusState;
  },
  start(statusKey) {
    batchStatusState.running = true;
    batchStatusState.statusKey = statusKey;
  },
  updateProgress(index, total, url) {
    batchStatusState.statusArgs = [String(index), String(total)];
  },
  setStatus(args, running, paused) {
    batchStatusState.statusKey = args.statusKey;
    batchStatusState.statusArgs = args.statusArgs;
    batchStatusState.running = running;
    batchStatusState.paused = paused;
  },
  reset() {
    batchStatusState.running = false;
  }
};

// Control variables for dynamic mock behaviors
let clickNextPageResult = { ok: true };
let getPageSignatureBehavior = 'dynamic'; // 'dynamic', 'static', 'null'
let maxWaitSetting = 20;
let pollIntervalSetting = 5;

const mockDeps = {
  batchStatus: mockBatchStatus,
  getBatchState() {
    return batchStatusState;
  },
  statusError(key) {
    return new Error(key);
  },
  statusFromError(err) {
    return { statusKey: err.message };
  },
  maxWait: maxWaitSetting,
  pollInterval: pollIntervalSetting,
  sendTabMessage: async (tabId, message) => {
    tabMessageSent.push(message);
    if (message.action === 'prepare') {
      return { ok: true, metrics: { scrollHeight: 1000, scrollWidth: 1200, viewportHeight: 800, viewportWidth: 1200, devicePixelRatio: 1 } };
    }
    if (message.action === 'scrollTo') {
      return { ok: true, actualScrollX: message.x, actualScrollY: message.y };
    }
    if (message.action === 'getPageSignature') {
      if (getPageSignatureBehavior === 'null') {
        return null;
      }
      if (getPageSignatureBehavior === 'static') {
        return { signature: 'constant-signature' };
      }
      return { signature: 'sig-' + tabMessageSent.length };
    }
    if (message.action === 'clickNextPage') {
      return clickNextPageResult;
    }
    if (message.action === 'detectNextPage') {
      return { ok: true, selector: '.pageButton' };
    }
    return { ok: true };
  },
  waitWhilePaused: async () => {},
  sleepWithControls: async () => {},
  activateTab: async (tab) => tab,
  captureViewport: async () => 'data:image/png;base64,...',
  captureFullPage: async () => 'data:image/png;base64,...',
  buildFilename: () => 'BatchShot/test.png',
  waitForTabReadyForCapture: async () => {}
};

async function resetTestState() {
  tabMessageSent = [];
  batchStatusState = {
    running: false,
    paused: false,
    stopping: false,
    statusKey: 'idleStatus',
    statusArgs: []
  };
  clickNextPageResult = { ok: true };
  getPageSignatureBehavior = 'dynamic';
  mockDeps.maxWait = 20;
  mockDeps.pollInterval = 5;
}

// ----------------------------------------------------
// Test 1: Successful run with count = 2
// ----------------------------------------------------
await resetTestState();
const options = {
  sequentialCaptureCount: 2,
  delay: 0.1,
  sequentialNextSelector: '.nextButton',
  folder: 'BatchShot',
  reportEnabled: false
};

const result = await captureCurrentTabSequence(options, mockDeps);
assert.equal(result, 2, 'Should successfully capture 2 pages');

const actions = tabMessageSent.map(m => m.action);
assert.ok(actions.includes('getPageSignature'), 'Should query page signature');
assert.ok(actions.includes('clickNextPage'), 'Should click next page');

// ----------------------------------------------------
// Test 2: clickNextPage fails (returns ok: false)
// ----------------------------------------------------
await resetTestState();
clickNextPageResult = { ok: false, statusKey: 'nextPageClickError' };

try {
  await captureCurrentTabSequence(options, mockDeps);
  assert.fail('Should have thrown an error');
} catch (error) {
  assert.ok(error instanceof SequentialCaptureError, 'Should throw SequentialCaptureError');
  assert.equal(error.statusKey, 'nextPageClickError');
  assert.equal(error.successful, 1);
  assert.equal(error.failed, 1);
}

// ----------------------------------------------------
// Test 3: nextPageWaitTimeoutError (signature doesn't change)
// ----------------------------------------------------
await resetTestState();
getPageSignatureBehavior = 'static';

try {
  await captureCurrentTabSequence(options, mockDeps);
  assert.fail('Should have thrown an error');
} catch (error) {
  assert.ok(error instanceof SequentialCaptureError, 'Should throw SequentialCaptureError');
  assert.equal(error.statusKey, 'nextPageWaitTimeoutError');
  assert.equal(error.successful, 1);
  assert.equal(error.failed, 1);
}

// ----------------------------------------------------
// Test 4: getPageSignature returns null / fails
// ----------------------------------------------------
await resetTestState();
getPageSignatureBehavior = 'null';

try {
  await captureCurrentTabSequence(options, mockDeps);
  assert.fail('Should have thrown an error');
} catch (error) {
  assert.ok(error instanceof SequentialCaptureError, 'Should throw SequentialCaptureError');
  assert.equal(error.statusKey, 'nextPageSelectorError');
  assert.equal(error.successful, 1);
  assert.equal(error.failed, 1);
}

// ----------------------------------------------------
// Test 5: User stops capturing (stopping = true)
// ----------------------------------------------------
await resetTestState();
// Set stopping to true in batchStatusState
batchStatusState.stopping = true;

try {
  await captureCurrentTabSequence(options, mockDeps);
  assert.fail('Should have thrown an error');
} catch (error) {
  assert.ok(error instanceof SequentialCaptureError, 'Should throw SequentialCaptureError');
  assert.equal(error.statusKey, 'captureStoppedError');
  assert.equal(error.successful, 0);
  assert.equal(error.failed, 2);
}

console.log('Sequential capture flow tests passed!');
