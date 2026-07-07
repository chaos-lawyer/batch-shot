import { statusError } from './status-error.js';

const CAPTURABLE_PROTOCOLS = new Set(['http:', 'https:', 'file:']);

export const CONTENT_SCRIPT_FILES = [
  'content/capture-page.js',
  'content/form-fill.js',
  'content/search-submit.js',
  'content/selector-builder.js',
  'content/search-infer.js',
  'content/button-picker.js',
  'content/messages.js'
];

export function isCapturableTab(tab) {
  if (!tab?.id || !tab.url) {
    return false;
  }

  try {
    return CAPTURABLE_PROTOCOLS.has(new URL(tab.url).protocol);
  } catch (_error) {
    return false;
  }
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export async function activateTab(tab) {
  await chrome.windows.update(tab.windowId, { focused: true }).catch(() => {});
  await chrome.tabs.update(tab.id, { active: true });
  await sleep(300);
  return chrome.tabs.get(tab.id);
}

export async function sendTabMessage(tabId, message) {
  try {
    return await chrome.tabs.sendMessage(tabId, message);
  } catch (_error) {
    await chrome.scripting.executeScript({
      target: { tabId },
      files: CONTENT_SCRIPT_FILES
    });
    return chrome.tabs.sendMessage(tabId, message);
  }
}

export async function waitForTabComplete(tabId, timeoutMs = 45000, timeoutStatusKey = 'pageLoadTimeoutError') {
  const initial = await chrome.tabs.get(tabId);
  if (initial.status === 'complete') {
    return;
  }

  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      chrome.tabs.onUpdated.removeListener(listener);
      reject(statusError(timeoutStatusKey));
    }, timeoutMs);

    function listener(updatedTabId, changeInfo) {
      if (updatedTabId === tabId && changeInfo.status === 'complete') {
        clearTimeout(timeout);
        chrome.tabs.onUpdated.removeListener(listener);
        resolve();
      }
    }

    chrome.tabs.onUpdated.addListener(listener);
  });
}

export async function waitForTabReadyForCapture(tabId, timeoutMs = 45000, timeoutStatusKey = 'pageLoadTimeoutError') {
  function isReady(tab) {
    const url = String(tab?.url || tab?.pendingUrl || '');
    return tab?.status === 'complete' && url && url !== 'about:blank';
  }

  const initial = await chrome.tabs.get(tabId);
  if (isReady(initial)) {
    return;
  }

  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      chrome.tabs.onUpdated.removeListener(listener);
      reject(statusError(timeoutStatusKey));
    }, timeoutMs);

    function listener(updatedTabId) {
      if (updatedTabId !== tabId) {
        return;
      }

      chrome.tabs.get(tabId)
        .then((tab) => {
          if (!isReady(tab)) {
            return;
          }
          clearTimeout(timeout);
          chrome.tabs.onUpdated.removeListener(listener);
          resolve();
        })
        .catch(() => {});
    }

    chrome.tabs.onUpdated.addListener(listener);
  });
}
