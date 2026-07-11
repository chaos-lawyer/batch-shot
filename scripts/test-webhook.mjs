import assert from 'node:assert/strict';
import { sendWebhook, triggerWebhookIfNeeded } from '../background/webhook.js';

// Mock fetch environment
let fetchCall = null;
globalThis.fetch = async (url, options) => {
  fetchCall = { url, options };
  return {
    ok: true,
    status: 200
  };
};

const payload = {
  runId: '123',
  taskName: 'Task "Quotes" & \nNewlines',
  status: 'success',
  startedAt: '2026-07-11T00:00:00Z',
  finishedAt: '2026-07-11T00:01:00Z',
  durationMs: 60000,
  total: 1,
  success: 1,
  failed: 0,
  cancelled: false,
  folder: 'TestFolder',
  reportFilename: 'report.csv',
  items: [
    {
      index: 1,
      url: 'https://example.com',
      title: 'Title',
      status: 'ok',
      filename: 'img.png',
      textFilename: 'txt.txt',
      textExcerpt: 'Excerpt text',
      text: 'Full huge text content...'
    }
  ]
};

// Test 1: URL Protocol Validation
await assert.rejects(
  sendWebhook(payload, { webhookUrl: 'ftp://example.com' }),
  /Webhook URL protocol must be http: or https:/
);

// Test 2: Method Validation
await assert.rejects(
  sendWebhook(payload, { webhookUrl: 'http://example.com', webhookMethod: 'DELETE' }),
  /Unsupported webhook method: DELETE/
);

// Test 3: Headers Validation
await assert.rejects(
  sendWebhook(payload, { webhookUrl: 'http://example.com', webhookHeaders: 'null' }),
  /Webhook headers must be a JSON object/
);
await assert.rejects(
  sendWebhook(payload, { webhookUrl: 'http://example.com', webhookHeaders: '[]' }),
  /Webhook headers must be a JSON object/
);
await assert.rejects(
  sendWebhook(payload, { webhookUrl: 'http://example.com', webhookHeaders: '{"x": {"y": 1}}' }),
  /nested objects\/arrays are not supported/
);

// Header value conversion
fetchCall = null;
await sendWebhook(payload, {
  webhookUrl: 'http://example.com',
  webhookHeaders: '{"Content-Type": "application/json", "X-Num": 123, "X-Bool": true}'
});
assert.equal(fetchCall.options.headers['Content-Type'], 'application/json');
assert.equal(fetchCall.options.headers['X-Num'], '123');
assert.equal(fetchCall.options.headers['X-Bool'], 'true');

// Test 4: Placeholder escaping and JSON validation
fetchCall = null;
const bodyTemplate = '{\n  "name": "{taskName}",\n  "remaining": "{unfinishedTasksCount}"\n}';
const payloadWithUnfinished = { ...payload, unfinishedTasksCount: 5 };
await sendWebhook(payloadWithUnfinished, {
  webhookUrl: 'http://example.com',
  webhookBodyTemplate: bodyTemplate
});
assert.ok(fetchCall.options.body);
const parsedBody = JSON.parse(fetchCall.options.body);
assert.equal(parsedBody.name, 'Task "Quotes" & \nNewlines');
assert.equal(parsedBody.remaining, '5');

// Test 5: Body JSON syntax error checking
await assert.rejects(
  sendWebhook(payload, {
    webhookUrl: 'http://example.com',
    webhookBodyTemplate: '{"invalid": "{taskName"'
  }),
  /Failed to parse final webhook body as JSON/
);

// Test 6: triggerWebhookIfNeeded error propagation (IgnoreErrors = false)
globalThis.fetch = async () => {
  throw new Error('Network Failure');
};

const rows = [{ index: 1, url: 'a', title: 'b', status: 'ok', filename: 'c', text: 'secret' }];
const context = { taskName: 'T', runId: 'R', startedAt: new Date().toISOString(), isCancelled: false };

await assert.rejects(
  triggerWebhookIfNeeded(rows, {
    webhookEnabled: true,
    webhookUrl: 'http://example.com',
    webhookIgnoreErrors: false
  }, context, {}),
  /Network Failure/
);

// triggerWebhookIfNeeded handles and logs but swallows if IgnoreErrors = true
let logMessage = null;
const deps = {
  batchStatus: {
    addLog: (source, type, msg) => {
      logMessage = msg;
    }
  }
};

await triggerWebhookIfNeeded(rows, {
  webhookEnabled: true,
  webhookUrl: 'http://example.com',
  webhookIgnoreErrors: true
}, context, deps);

assert.equal(logMessage, 'Network Failure');

// Test 7: triggerWebhookIfNeeded items metadata copy does NOT include full text, and unfinishedTasksCount is mapped
let capturedPayload = null;
globalThis.fetch = async (url, options) => {
  capturedPayload = JSON.parse(options.body);
  return { ok: true, status: 200 };
};

const mockDeps = {
  scheduledTasks: {
    getScheduledTasks: async () => [ { id: 'task1' }, { id: 'task2' } ]
  }
};

await triggerWebhookIfNeeded(rows, {
  webhookEnabled: true,
  webhookUrl: 'http://example.com',
  webhookIgnoreErrors: true
}, context, mockDeps);

assert.ok(capturedPayload);
assert.equal(capturedPayload.items[0].text, undefined);
assert.equal(capturedPayload.unfinishedTasksCount, 2);

console.log('Webhook tests passed successfully!');
