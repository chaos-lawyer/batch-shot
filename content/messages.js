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


  if (message.action === 'pickSearchTemplateSelectors') {
    pickSearchTemplateSelectors(message.payload || {}).then((response) => sendResponse(response));
    return true;
  }

  if (message.action === 'getContextElementSelector') {
    sendResponse(getContextElementSelector());
    return true;
  }

  if (message.action === 'detectNextPage') {
    sendResponse(detectNextPage());
    return true;
  }

  if (message.action === 'clickNextPage') {
    sendResponse(clickNextPage(message.payload || {}));
    return true;
  }

  if (message.action === 'getPageSignature') {
    sendResponse(getPageSignature());
    return true;
  }

  if (message.action === 'pickNextPageSelector') {
    pickNextPageSelector(message.payload || {}).then((response) => sendResponse(response));
    return true;
  }

  if (message.action === 'extractPageText') {
    sendResponse(extractPageText(message.payload || {}));
    return true;
  }

  return false;
});
