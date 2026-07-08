// ============================================================================
// 1. Context Selector & Right-Click Tracking (context-selector)
// ============================================================================

let lastContextElement = null;
// activePickerCleanup is declared in button-picker.js (loaded before this script)

// Persist last right-click position across script re-injections.
const _ctxKey = '__batchshot_ctx__';
let lastContextX = 0;
let lastContextY = 0;
try {
  const saved = JSON.parse(sessionStorage.getItem(_ctxKey) || 'null');
  if (saved) {
    lastContextX = saved.x;
    lastContextY = saved.y;
  }
} catch (_e) { /* ignore */ }

document.addEventListener('contextmenu', (event) => {
  lastContextX = event.clientX;
  lastContextY = event.clientY;
  try {
    sessionStorage.setItem(_ctxKey, JSON.stringify({ x: lastContextX, y: lastContextY }));
  } catch (_e) { /* ignore */ }

  let target = event.target;
  if (target instanceof Node && target.nodeType === Node.TEXT_NODE) {
    target = target.parentElement;
  }
  lastContextElement = target instanceof Element
    ? target.closest('a,button,[role="button"],input[type="button"],input[type="submit"],[onclick],.pageButton') || target
    : null;
}, true);

function isDisabledElement(element) {
  if (!element) return true;
  return (
    element.disabled ||
    element.classList.contains('disabled') ||
    element.getAttribute('aria-disabled') === 'true'
  );
}

function isVisibleElement(element) {
  const rect = element.getBoundingClientRect();
  const style = window.getComputedStyle(element);
  return (
    rect.width > 0 &&
    rect.height > 0 &&
    style.visibility !== 'hidden' &&
    style.display !== 'none'
  );
}

function getContextElementSelector() {
  let el = lastContextElement;

  // Fallback: if scripts were injected after the contextmenu fired, use last known coordinates.
  if (!el && (lastContextX || lastContextY)) {
    const hit = document.elementFromPoint(lastContextX, lastContextY);
    if (hit instanceof Element) {
      el = hit.closest('a,button,[role="button"],input[type="button"],input[type="submit"],[onclick],.pageButton') || hit;
    }
  }

  if (!el || el.localName === 'html' || el.localName === 'body' || el.localName === '#document') {
    return { ok: false, statusKey: 'nextPageSelectorError' };
  }

  const selector = selectorForElement(el);
  if (!selector) {
    return { ok: false, statusKey: 'nextPageSelectorError' };
  }

  return {
    ok: true,
    selector,
    text: el.innerText?.trim() || el.textContent?.trim() || '',
    disabled: isDisabledElement(el)
  };
}

// ============================================================================
// 2. Pagination Detection & Element Scoring (pagination-detect)
// ============================================================================

/**
 * Pure function to calculate score of a candidate element.
 * Helps determine if it is likely to be the "next page" button.
 */
function getElementScore(el, currentPageNum) {
  let score = 0;

  if (el.getAttribute('rel') === 'next') {
    score += 100;
  }

  const text = (el.innerText || el.textContent || '').trim().toLowerCase();
  const title = (el.getAttribute('title') || '').trim().toLowerCase();
  const ariaLabel = (el.getAttribute('aria-label') || '').trim().toLowerCase();

  const nextTexts = ['下一页', '下页', '后一页', 'next', '›', '»', '>', 'next page'];
  if (nextTexts.some(t => text === t || title === t || ariaLabel === t)) {
    score += 50;
  } else if (nextTexts.some(t => text.includes(t) || title.includes(t) || ariaLabel.includes(t))) {
    score += 20;
  }

  const id = String(el.id || '').toLowerCase();
  const className = String(el.getAttribute('class') || '').toLowerCase();
  const nextClasses = ['next', 'pagination-next', 'page-next', 'pagebutton'];
  if (nextClasses.some(c => id.includes(c) || className.includes(c))) {
    score += 15;
  }

  if (el.classList.contains('pageButton') && text.includes('下一页')) {
    score += 30;
  }

  if (currentPageNum !== null && currentPageNum !== undefined) {
    const nextPageNum = currentPageNum + 1;
    const valAttr = el.getAttribute('value');
    if (text === String(nextPageNum) || valAttr === String(nextPageNum)) {
      score += 40;
    }
  }

  return score;
}

function detectNextPage() {
  const candidateSelectors = [
    'a[rel="next"]',
    'button[rel="next"]',
    'a',
    'button',
    '[role="button"]',
    'input[type="button"]',
    'input[type="submit"]',
    '[onclick]',
    '.pageButton'
  ];

  const elements = Array.from(document.querySelectorAll(candidateSelectors.join(',')));
  const candidates = elements.filter(el => isVisibleElement(el) && !isDisabledElement(el));

  const activeEl = document.querySelector('.active, .current, [aria-current="page"], .page-current');
  let currentPageNum = null;
  if (activeEl) {
    const activeText = activeEl.textContent?.trim();
    const parsed = parseInt(activeText, 10);
    if (!isNaN(parsed)) {
      currentPageNum = parsed;
    }
  }

  let bestCandidate = null;
  let maxScore = -1;

  for (const el of candidates) {
    const score = getElementScore(el, currentPageNum);

    if (score > maxScore) {
      maxScore = score;
      bestCandidate = el;
    }
  }

  if (bestCandidate && maxScore > 0) {
    const selector = selectorForElement(bestCandidate);
    if (selector) {
      let confidence = 'low';
      if (maxScore >= 100) {
        confidence = 'high';
      } else if (maxScore >= 40) {
        confidence = 'medium';
      }

      return {
        ok: true,
        selector,
        text: bestCandidate.innerText || bestCandidate.textContent || '',
        confidence
      };
    }
  }

  return { ok: false, statusKey: 'nextPageNotFoundError' };
}

// ============================================================================
// 3. Pagination Actions & Page Signature (pagination-action)
// ============================================================================

function clickNextPage({ selector }) {
  const element = document.querySelector(selector);
  if (!element || !isVisibleElement(element) || isDisabledElement(element)) {
    return { ok: false, statusKey: 'nextPageSelectorError' };
  }

  element.scrollIntoView({ block: 'center', inline: 'center' });
  element.dispatchEvent(new MouseEvent('mouseover', { bubbles: true, cancelable: true, view: window }));
  element.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, view: window }));
  element.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true, view: window }));
  element.click();

  return { ok: true };
}

function getPageSignature() {
  const activeEl = document.querySelector('.active, .current, [aria-current="page"], .page-current');
  const activePageText = activeEl?.textContent?.trim() || '';
  const bodyTextLength = document.body?.innerText?.length || 0;
  const contentTextSample = document.body?.innerText?.slice(0, 2000) || '';

  let hash = 0;
  for (let i = 0; i < contentTextSample.length; i++) {
    const char = contentTextSample.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash |= 0;
  }

  const signature = [
    location.href,
    activePageText,
    bodyTextLength,
    hash
  ].join('|');

  return { signature };
}

// ============================================================================
// 4. Next Page Picker UI (pagination-picker)
// ============================================================================

function pickNextPageSelector(messages = {}) {
  if (activePickerCleanup) {
    activePickerCleanup();
  }

  return new Promise((resolve) => {
    const prompt = i18nMessage(
      'nextPageSelectorPickerPrompt',
      'Click the next page button on the page. Press Esc to cancel.',
      messages.prompt
    );

    const { bar, text, badge, skipButton, closeButton } = createPickerBar({
      ...messages,
      prompt,
    });
    
    if (skipButton) {
      skipButton.style.display = 'none';
    }

    let hoverTarget = null;

    function cleanup() {
      if (hoverTarget) {
        hoverTarget.style.outline = '';
        hoverTarget.style.outlineOffset = '';
        hoverTarget.style.boxShadow = '';
        hoverTarget = null;
      }
      document.removeEventListener('click', handleClick, true);
      document.removeEventListener('mouseover', handleMouseOver, true);
      document.removeEventListener('keydown', handleKeyDown, true);
      bar.remove();
      activePickerCleanup = null;
    }

    function finish(response) {
      cleanup();
      resolve(response);
    }

    function setHoverTarget(target, color) {
      if (hoverTarget && hoverTarget !== target) {
        hoverTarget.style.outline = '';
        hoverTarget.style.outlineOffset = '';
        hoverTarget.style.boxShadow = '';
      }
      hoverTarget = target;
      hoverTarget.style.outline = `2px solid ${color}`;
      hoverTarget.style.outlineOffset = '2px';
      hoverTarget.style.boxShadow = `inset 0 0 0 9999px ${color}26`;
    }

    function handleMouseOver(event) {
      if (bar.contains(event.target)) {
        return;
      }

      const element = event.target instanceof Element
        ? event.target.closest('a,button,[role="button"],input[type="button"],input[type="submit"],[onclick],.pageButton') || event.target
        : null;

      if (element) {
        setHoverTarget(element, '#2563eb');
      }
    }

    function handleClick(event) {
      event.preventDefault();
      event.stopPropagation();

      if (event.target === closeButton || closeButton.contains(event.target)) {
        finish({ ok: false, cancelled: true });
        return;
      }

      if (bar.contains(event.target)) {
        return;
      }

      const element = event.target instanceof Element
        ? event.target.closest('a,button,[role="button"],input[type="button"],input[type="submit"],[onclick],.pageButton') || event.target
        : null;

      if (!element) {
        finish({ ok: false, statusKey: 'nextPageSelectorError' });
        return;
      }

      const selector = selectorForElement(element);
      if (!selector) {
        finish({ ok: false, statusKey: 'nextPageSelectorError' });
        return;
      }

      finish({ ok: true, selector });
    }

    function handleKeyDown(event) {
      if (event.key !== 'Escape') {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      finish({ ok: false, cancelled: true });
    }

    activePickerCleanup = cleanup;
    document.addEventListener('click', handleClick, true);
    document.addEventListener('mouseover', handleMouseOver, true);
    document.addEventListener('keydown', handleKeyDown, true);
  });
}
