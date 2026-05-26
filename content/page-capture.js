let restoreSnapshot = null;

function getPageMetrics() {
  const body = document.body || {};
  const documentElement = document.documentElement || {};

  return {
    scrollHeight: Math.max(
      body.scrollHeight || 0,
      body.offsetHeight || 0,
      documentElement.clientHeight || 0,
      documentElement.scrollHeight || 0,
      documentElement.offsetHeight || 0
    ),
    viewportHeight: window.innerHeight,
    viewportWidth: window.innerWidth,
    devicePixelRatio: window.devicePixelRatio || 1
  };
}

function preparePage() {
  cleanupPage();

  const hiddenElements = [];
  const previousScrollBehavior = document.documentElement.style.scrollBehavior;
  document.documentElement.style.scrollBehavior = 'auto';

  document.querySelectorAll('body *').forEach((element) => {
    const style = window.getComputedStyle(element);
    if (style.position !== 'fixed' && style.position !== 'sticky') {
      return;
    }

    hiddenElements.push({
      element,
      visibility: element.style.visibility,
      transition: element.style.transition
    });
    element.style.visibility = 'hidden';
    element.style.transition = 'none';
  });

  restoreSnapshot = {
    scrollX: window.scrollX,
    scrollY: window.scrollY,
    previousScrollBehavior,
    hiddenElements
  };

  return getPageMetrics();
}

function cleanupPage() {
  if (!restoreSnapshot) {
    return;
  }

  document.documentElement.style.scrollBehavior = restoreSnapshot.previousScrollBehavior;
  restoreSnapshot.hiddenElements.forEach(({ element, visibility, transition }) => {
    element.style.visibility = visibility;
    element.style.transition = transition;
  });
  window.scrollTo(restoreSnapshot.scrollX, restoreSnapshot.scrollY);
  restoreSnapshot = null;
}

async function scrollToY(y) {
  window.scrollTo(0, y);
  await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  return {
    actualScrollY: window.scrollY,
    metrics: getPageMetrics()
  };
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.action === 'prepare') {
    sendResponse({ ok: true, metrics: preparePage() });
    return true;
  }

  if (message.action === 'scrollTo') {
    scrollToY(message.y).then((response) => sendResponse({ ok: true, ...response }));
    return true;
  }

  if (message.action === 'cleanup') {
    cleanupPage();
    sendResponse({ ok: true });
    return true;
  }

  return false;
});
