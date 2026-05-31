import { stitchImages } from './stitch.js';

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.action !== 'stitch') {
    return false;
  }

  stitchImages(message.segments, message.metrics, message.options)
    .then((dataUrl) => sendResponse({ ok: true, dataUrl }))
    .catch((error) => sendResponse({ ok: false, error: error.message }));

  return true;
});
