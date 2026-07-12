import assert from 'assert';
import { DEFAULT_SETTINGS, loadSettings } from '../utils/settings.js';

assert.strictEqual(DEFAULT_SETTINGS.metadataEnabled, true, 'Metadata should be enabled by default');

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

globalThis.chrome.storage.local.get = async () => ({ settings: { metadataEnabled: false } });
assert.strictEqual(
  (await loadSettings()).metadataEnabled,
  false,
  'An existing explicit disabled preference should be preserved'
);

console.log('Settings default tests passed!');
