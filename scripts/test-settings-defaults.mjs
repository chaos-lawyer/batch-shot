import assert from 'assert';
import { DEFAULT_SETTINGS, loadSettings } from '../utils/settings.js';

assert.strictEqual(DEFAULT_SETTINGS.metadataEnabled, true, 'Metadata should be enabled by default');
assert.strictEqual(DEFAULT_SETTINGS.pageLoadTimeout, 45, 'Page access timeout should default to 45 seconds');

globalThis.chrome = {
  storage: {
    local: {
      get: async () => ({ settings: {} })
    }
  }
};

assert.strictEqual(
  (await loadSettings()).metadataEnabled,
  true,
  'A new installation should load metadata as enabled'
);

globalThis.chrome.storage.local.get = async () => ({ settings: { pageLoadTimeout: 2 } });
assert.strictEqual((await loadSettings()).pageLoadTimeout, 5, 'Page timeout should clamp to at least 5 seconds');

globalThis.chrome.storage.local.get = async () => ({ settings: { pageLoadTimeout: 999 } });
assert.strictEqual((await loadSettings()).pageLoadTimeout, 300, 'Page timeout should clamp to at most 300 seconds');

globalThis.chrome.storage.local.get = async () => ({ settings: { metadataEnabled: false } });
assert.strictEqual(
  (await loadSettings()).metadataEnabled,
  false,
  'An existing explicit disabled preference should be preserved'
);

console.log('Settings default tests passed!');
