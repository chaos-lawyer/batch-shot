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
    scrollWidth: Math.max(
      body.scrollWidth || 0,
      body.offsetWidth || 0,
      documentElement.clientWidth || 0,
      documentElement.scrollWidth || 0,
      documentElement.offsetWidth || 0
    ),
    viewportHeight: window.innerHeight,
    viewportWidth: window.innerWidth,
    devicePixelRatio: window.devicePixelRatio || 1
  };
}

function preparePage(options = {}) {
  cleanupPage();

  const hideFixedElements = options.hideFixedElements !== false;
  const hiddenElements = [];
  const previousScrollBehavior = document.documentElement.style.scrollBehavior;
  const scrollbarStyle = document.createElement('style');

  scrollbarStyle.dataset.batchshotCapture = 'scrollbar-hidden';
  scrollbarStyle.textContent = `
    html, body, * {
      scrollbar-width: none !important;
      -ms-overflow-style: none !important;
    }
    html::-webkit-scrollbar,
    body::-webkit-scrollbar,
    *::-webkit-scrollbar {
      display: none !important;
      width: 0 !important;
      height: 0 !important;
    }
  `;
  document.documentElement.appendChild(scrollbarStyle);

  document.documentElement.style.scrollBehavior = 'auto';

  if (hideFixedElements) {
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
  }

  restoreSnapshot = {
    scrollX: window.scrollX,
    scrollY: window.scrollY,
    previousScrollBehavior,
    scrollbarStyle,
    hiddenElements
  };

  return getPageMetrics();
}

function cleanupPage() {
  if (!restoreSnapshot) {
    return;
  }

  document.documentElement.style.scrollBehavior = restoreSnapshot.previousScrollBehavior;
  restoreSnapshot.scrollbarStyle?.remove();
  restoreSnapshot.hiddenElements.forEach(({ element, visibility, transition }) => {
    element.style.visibility = visibility;
    element.style.transition = transition;
  });
  window.scrollTo(restoreSnapshot.scrollX, restoreSnapshot.scrollY);
  restoreSnapshot = null;
}

async function scrollToPosition(x, y) {
  window.scrollTo(x, y);
  await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  return {
    actualScrollX: window.scrollX,
    actualScrollY: window.scrollY,
    metrics: getPageMetrics()
  };
}
