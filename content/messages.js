chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.action === 'prepare') {
    sendResponse({ ok: true, metrics: preparePage(message.payload) });
    return true;
  }

  if (message.action === 'scrollTo') {
    scrollToPosition(message.x || 0, message.y || 0)
      .then((response) => sendResponse({ ok: true, ...response }));
    return true;
  }

  if (message.action === 'cleanup') {
    cleanupPage();
    sendResponse({ ok: true });
    return true;
  }

  if (message.action === 'performSearch') {
    sendResponse(performSearch(message.payload));
    return true;
  }

  if (message.action === 'fillSearchForm') {
    sendResponse(fillSearchForm(message.payload));
    return true;
  }

  if (message.action === 'getSearchInputSelector') {
    sendResponse(getSearchInputSelector());
    return true;
  }

  if (message.action === 'pickSearchButtonSelector') {
    pickSearchButtonSelector(message.payload || {}).then((response) => sendResponse(response));
    return true;
  }

  return false;
});
