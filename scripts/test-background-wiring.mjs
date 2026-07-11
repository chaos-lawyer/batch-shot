import assert from 'assert';

// 1. Setup mock browser globals
globalThis.document = {
  documentElement: { lang: 'en' },
  querySelectorAll: () => []
};

let messageListener = null;
let downloadCalls = [];
let tabCreatedUrls = [];
let executeScriptCalls = [];

let localStorageMock = { settings: { theme: 'dark' } };

globalThis.chrome = {
  storage: {
    local: {
      get: async (keys) => {
        if (!keys) return localStorageMock;
        if (typeof keys === 'string') return { [keys]: localStorageMock[keys] };
        if (Array.isArray(keys)) {
          const res = {};
          keys.forEach(k => { res[k] = localStorageMock[k]; });
          return res;
        }
        return localStorageMock;
      },
      set: async (val) => {
        localStorageMock = { ...localStorageMock, ...val };
      }
    },
    onChanged: { addListener: () => {} }
  },
  action: {
    setIcon: async () => {},
    setPopup: async () => {},
    openPopup: async () => {},
    onClicked: { addListener: () => {} }
  },
  i18n: {
    getMessage: (key) => key
  },
  windows: {
    update: async () => {}
  },
  alarms: {
    create: async () => {},
    clear: async () => {},
    clearAll: async () => {},
    getAll: async () => [],
    onAlarm: { addListener: () => {} }
  },
  contextMenus: {
    create: () => {},
    removeAll: () => {},
    onClicked: { addListener: () => {} }
  },
  runtime: {
    onInstalled: { addListener: () => {} },
    onStartup: { addListener: () => {} },
    onMessage: {
      addListener: (listener) => {
        messageListener = listener;
      }
    },
    sendMessage: async (msg) => {
      if (msg.action === 'batchStatus' && msg.statusKey === 'batchProgressStatus') {
        console.log('Progress:', msg.statusArgs);
      } else if (msg.action === 'batchStatus') {
        console.log('Status update:', msg);
      }
      return { ok: true, dataUrl: 'data:image/png;base64,mock' };
    },
    getURL: (path) => path,
    getContexts: async () => []
  },
  commands: {
    onCommand: { addListener: () => {} }
  },
  tabs: {
    query: async () => [ { id: 1, url: 'https://example.com/active', windowId: 1, active: true } ],
    create: async (opts) => {
      tabCreatedUrls.push(opts.url);
      return { id: 2, url: opts.url || 'https://example.com/created', windowId: 1 };
    },
    get: async (id) => ({ id, url: 'https://example.com/got', windowId: 1, status: 'complete' }),
    update: async () => {},
    remove: async () => {},
    sendMessage: async () => ({ ok: true, metrics: { scrollWidth: 500, scrollHeight: 500, viewportWidth: 500, viewportHeight: 500 } }),
    captureVisibleTab: async () => 'data:image/png;base64,mock',
    onUpdated: { addListener: () => {}, removeListener: () => {} },
    onCreated: { addListener: () => {}, removeListener: () => {} },
    onActivated: { addListener: () => {}, removeListener: () => {} }
  },
  downloads: {
    download: async (options) => {
      downloadCalls.push(options);
      return 123;
    }
  },
  offscreen: {
    createDocument: async () => {},
    closeDocument: async () => {}
  },
  scripting: {
    executeScript: async (args) => {
      executeScriptCalls.push(args);
      return [ { result: { scrollHeight: 1000, scrollWidth: 1000, viewportHeight: 500, viewportWidth: 500, devicePixelRatio: 1 } } ];
    }
  }
};

globalThis.fetch = async () => {
  return {
    json: async () => ({})
  };
};

// 2. Import service-worker.js to trigger initialization and setup message router
console.log('Importing service-worker.js...');
await import('../background/service-worker.js');

// Helper to wait
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function runTests() {
  assert.ok(messageListener, 'Message listener should be registered');

  console.log('Testing startBatch wiring (runBatch)...');
  downloadCalls = [];
  tabCreatedUrls = [];
  
  const responsePromise = new Promise((resolve) => {
    messageListener({
      action: 'startBatch',
      payload: {
        urls: ['https://example.com/1', 'https://example.com/2'],
        urlInputMode: 'list',
        reportEnabled: true,
        reportFormat: 'csv',
        delay: 0.1,
        filenameTemplate: '{title}'
      }
    }, {}, (res) => resolve(res));
  });

  const response = await responsePromise;
  await sleep(2500);
  console.log('startBatch response:', response);
  console.log('downloadCalls:', downloadCalls);
  console.log('tabCreatedUrls:', tabCreatedUrls);
  
  assert.strictEqual(tabCreatedUrls.length, 2, 'Should create tabs for 2 URLs');
  assert.strictEqual(tabCreatedUrls[0], 'https://example.com/1');
  assert.strictEqual(tabCreatedUrls[1], 'https://example.com/2');
  
  assert.strictEqual(downloadCalls.length, 3, 'Should trigger 3 downloads (2 screenshots + 1 report)');
  assert.ok(downloadCalls[2].url.startsWith('data:text/csv'), 'Last download should be the CSV report');
  
  // Verify startBatch wrote taskHistory
  const storedHistory = localStorageMock.taskHistory || [];
  assert.strictEqual(storedHistory.length, 1, 'startBatch should write to taskHistory');

  console.log('Testing prepareBatchForms wiring (runPrepareForms)...');
  tabCreatedUrls = [];
  delete localStorageMock.taskHistory;
  
  await new Promise((resolve) => {
    messageListener({
      action: 'prepareBatchForms',
      payload: {
        jobs: [
          { kind: 'search', url: 'https://example.com/search1', search: { keyword: 'abc', inputSelector: 'input' } }
        ]
      }
    }, {}, (res) => resolve(res));
  });

  await sleep(1000);
  assert.strictEqual(tabCreatedUrls.length, 1, 'Should create 1 tab for search form preparation');
  assert.strictEqual(tabCreatedUrls[0], 'https://example.com/search1');
  assert.ok(!localStorageMock.taskHistory, 'prepareBatchForms should not write to taskHistory');

  console.log('Testing captureCurrentWindowTabs wiring...');
  tabCreatedUrls = [];
  downloadCalls = [];
  delete localStorageMock.taskHistory;
  
  await new Promise((resolve) => {
    messageListener({
      action: 'captureCurrentWindowTabs',
      payload: {
        reportEnabled: false,
        delay: 0.1,
        filenameTemplate: '{title}'
      }
    }, {}, (res) => resolve(res));
  });

  await sleep(1000);
  assert.strictEqual(downloadCalls.length, 1, 'Should trigger 1 screenshot download from current active tab');
  assert.ok(!localStorageMock.taskHistory, 'captureCurrentWindowTabs should not write to taskHistory');

  console.log('All background wiring tests passed!');
}

runTests().catch((error) => {
  console.error('Wiring test failed:', error);
  process.exit(1);
});
