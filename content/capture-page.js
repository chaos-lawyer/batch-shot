let restoreSnapshot = null;

function parseZIndex(value) {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function hasBackgroundMedia(element, style) {
  const backgroundImage = style.backgroundImage || '';
  if (backgroundImage && backgroundImage !== 'none') {
    return true;
  }

  return element.matches?.('img, video, canvas, picture, svg')
    || Boolean(element.querySelector?.('img, video, canvas, picture, svg'));
}

function isLikelyViewportBackgroundLayer(element, style) {
  if (style.position !== 'fixed') {
    return false;
  }

  const rect = element.getBoundingClientRect?.();
  if (!rect) {
    return false;
  }

  const viewportWidth = window.innerWidth || document.documentElement.clientWidth || 0;
  const viewportHeight = window.innerHeight || document.documentElement.clientHeight || 0;
  if (!viewportWidth || !viewportHeight) {
    return false;
  }

  const coversViewport = rect.width >= viewportWidth * 0.8
    && rect.height >= viewportHeight * 0.8
    && rect.left <= viewportWidth * 0.2
    && rect.top <= viewportHeight * 0.2
    && rect.right >= viewportWidth * 0.8
    && rect.bottom >= viewportHeight * 0.8;

  if (!coversViewport || !hasBackgroundMedia(element, style)) {
    return false;
  }

  const zIndex = parseZIndex(style.zIndex);
  return zIndex === null || zIndex <= 0;
}

function findScrollContainers() {
  const containers = [];
  const elements = document.querySelectorAll('*');
  elements.forEach((el) => {
    if (el === document.documentElement || el === document.body) {
      return;
    }
    const style = window.getComputedStyle(el);
    const overflowY = style.overflowY;
    const overflowX = style.overflowX;
    const hasScrollY = (overflowY === 'auto' || overflowY === 'scroll' || overflowY === 'overlay') && el.scrollHeight > el.clientHeight;
    const hasScrollX = (overflowX === 'auto' || overflowX === 'scroll' || overflowX === 'overlay') && el.scrollWidth > el.clientWidth;
    
    if (hasScrollY || hasScrollX) {
      const rect = el.getBoundingClientRect();
      const topOffset = rect.top + window.scrollY;
      const leftOffset = rect.left + window.scrollX;
      containers.push({
        el,
        hasScrollY,
        hasScrollX,
        topOffset,
        leftOffset,
        originalScrollTop: el.scrollTop,
        originalScrollLeft: el.scrollLeft,
        scrollHeight: el.scrollHeight,
        scrollWidth: el.scrollWidth
      });
    }
  });
  return containers;
}

function getPageMetrics() {
  const body = document.body || {};
  const documentElement = document.documentElement || {};

  // Check the scroll containers saved during preparePage
  const containers = restoreSnapshot?.scrollContainers || [];
  let maxContainerHeight = 0;
  let maxContainerWidth = 0;

  containers.forEach((container) => {
    if (container.hasScrollY) {
      const totalHeight = container.topOffset + container.scrollHeight;
      if (totalHeight > maxContainerHeight) {
        maxContainerHeight = totalHeight;
      }
    }
    if (container.hasScrollX) {
      const totalWidth = container.leftOffset + container.scrollWidth;
      if (totalWidth > maxContainerWidth) {
        maxContainerWidth = totalWidth;
      }
    }
  });

  // Traverse body's direct children to find the real content bottom.
  // This guards against overflow:hidden on body/html truncating scrollHeight.
  const bodyChildren = body.children || [];
  let childrenBottom = 0;
  for (let i = 0; i < bodyChildren.length; i += 1) {
    const child = bodyChildren[i];
    if (!child.getBoundingClientRect) {
      continue;
    }
    const rect = child.getBoundingClientRect();
    const bottom = rect.bottom + window.scrollY;
    if (bottom > childrenBottom) {
      childrenBottom = bottom;
    }
  }

  return {
    scrollHeight: Math.max(
      body.scrollHeight || 0,
      body.offsetHeight || 0,
      documentElement.clientHeight || 0,
      documentElement.scrollHeight || 0,
      documentElement.offsetHeight || 0,
      Math.ceil(childrenBottom),
      Math.ceil(maxContainerHeight)
    ),
    scrollWidth: Math.max(
      body.scrollWidth || 0,
      body.offsetWidth || 0,
      documentElement.clientWidth || 0,
      documentElement.scrollWidth || 0,
      documentElement.offsetWidth || 0,
      Math.ceil(maxContainerWidth)
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
  const previousHtmlOverflow = document.documentElement.style.overflow;
  const previousBodyOverflow = document.body?.style?.overflow || '';
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

  // Find scroll containers before modifying styles or scrolling
  const scrollContainers = findScrollContainers();

  // Temporarily lift overflow:hidden on html/body so that scrollHeight
  // reflects the real content height instead of being clamped to viewport.
  const computedHtmlOverflow = window.getComputedStyle(document.documentElement)?.overflow || '';
  const computedBodyOverflow = document.body
    ? window.getComputedStyle(document.body)?.overflow || ''
    : '';
  if (computedHtmlOverflow === 'hidden') {
    document.documentElement.style.overflow = 'visible';
  }
  if (document.body?.style && computedBodyOverflow === 'hidden') {
    document.body.style.overflow = 'visible';
  }

  if (hideFixedElements) {
    document.querySelectorAll('body *').forEach((element) => {
      const style = window.getComputedStyle(element);
      if (style.position !== 'fixed' && style.position !== 'sticky') {
        return;
      }

      if (isLikelyViewportBackgroundLayer(element, style)) {
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
    previousHtmlOverflow,
    previousBodyOverflow,
    scrollbarStyle,
    hiddenElements,
    scrollContainers
  };

  return getPageMetrics();
}

function cleanupPage() {
  if (!restoreSnapshot) {
    return;
  }

  document.documentElement.style.scrollBehavior = restoreSnapshot.previousScrollBehavior;
  document.documentElement.style.overflow = restoreSnapshot.previousHtmlOverflow;
  if (document.body?.style) {
    document.body.style.overflow = restoreSnapshot.previousBodyOverflow;
  }
  
  if (restoreSnapshot.scrollContainers) {
    restoreSnapshot.scrollContainers.forEach((container) => {
      try {
        container.el.scrollTop = container.originalScrollTop;
        container.el.scrollLeft = container.originalScrollLeft;
      } catch (_error) {
        // Ignore if element is no longer in DOM
      }
    });
  }

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

  let maxScrollX = window.scrollX;
  let maxScrollY = window.scrollY;

  if (restoreSnapshot && restoreSnapshot.scrollContainers) {
    restoreSnapshot.scrollContainers.forEach((container) => {
      if (container.hasScrollX) {
        container.el.scrollLeft = x;
        if (container.el.scrollLeft > maxScrollX) {
          maxScrollX = container.el.scrollLeft;
        }
      }
      if (container.hasScrollY) {
        container.el.scrollTop = y;
        if (container.el.scrollTop > maxScrollY) {
          maxScrollY = container.el.scrollTop;
        }
      }
    });
  }

  await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));

  if (restoreSnapshot && restoreSnapshot.scrollContainers) {
    restoreSnapshot.scrollContainers.forEach((container) => {
      if (container.hasScrollX && container.el.scrollLeft > maxScrollX) {
        maxScrollX = container.el.scrollLeft;
      }
      if (container.hasScrollY && container.el.scrollTop > maxScrollY) {
        maxScrollY = container.el.scrollTop;
      }
    });
  }

  return {
    actualScrollX: Math.max(window.scrollX, maxScrollX),
    actualScrollY: Math.max(window.scrollY, maxScrollY),
    metrics: getPageMetrics()
  };
}
