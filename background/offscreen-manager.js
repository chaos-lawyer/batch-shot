const OFFSCREEN_URL = 'offscreen/offscreen.html';

export async function ensureOffscreenDocument() {
  const url = chrome.runtime.getURL(OFFSCREEN_URL);
  const contexts = await chrome.runtime.getContexts({
    contextTypes: ['OFFSCREEN_DOCUMENT'],
    documentUrls: [url]
  });

  if (contexts.length) {
    return;
  }

  await chrome.offscreen.createDocument({
    url: OFFSCREEN_URL,
    reasons: ['BLOBS'],
    justification: 'Stitch full-page screenshots in a DOM canvas and return data URLs for downloads.'
  });
}

export async function closeOffscreenDocument() {
  const contexts = await chrome.runtime.getContexts({
    contextTypes: ['OFFSCREEN_DOCUMENT'],
    documentUrls: [chrome.runtime.getURL(OFFSCREEN_URL)]
  });

  if (contexts.length) {
    await chrome.offscreen.closeDocument();
  }
}
