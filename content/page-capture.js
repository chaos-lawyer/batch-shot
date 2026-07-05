let restoreSnapshot = null;
let lastContextMenuTarget = null;
let activePickerCleanup = null;

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

function querySelectorOrError(selector, statusKey) {
  try {
    return document.querySelector(selector);
  } catch (_error) {
    return { error: statusKey };
  }
}

function setNativeValue(element, value) {
  const prototype = element instanceof HTMLTextAreaElement
    ? HTMLTextAreaElement.prototype
    : HTMLInputElement.prototype;
  const descriptor = Object.getOwnPropertyDescriptor(prototype, 'value');

  if (descriptor?.set) {
    descriptor.set.call(element, value);
    return;
  }

  element.value = value;
}

function performSearch(payload = {}) {
  const inputSelector = String(payload.inputSelector || '').trim();
  const keyword = String(payload.keyword ?? '');
  const submitMode = payload.submitMode === 'button' ? 'button' : 'enter';
  const buttonSelector = String(payload.buttonSelector || '').trim();

  if (!inputSelector) {
    return { ok: false, statusKey: 'searchInputSelectorError' };
  }

  const input = querySelectorOrError(inputSelector, 'searchInputSelectorError');
  if (input?.error) {
    return { ok: false, statusKey: input.error };
  }

  const isNativeInput = input instanceof HTMLInputElement || input instanceof HTMLTextAreaElement;
  if (!isNativeInput && !input.isContentEditable) {
    return { ok: false, statusKey: 'searchInputNotFoundError' };
  }

  input.focus();
  if (isNativeInput) {
    setNativeValue(input, '');
  } else {
    input.textContent = '';
  }
  input.dispatchEvent(new InputEvent('input', {
    bubbles: true,
    inputType: 'deleteContentBackward',
    data: null
  }));
  if (isNativeInput) {
    setNativeValue(input, keyword);
  } else {
    input.textContent = keyword;
  }
  input.dispatchEvent(new InputEvent('input', {
    bubbles: true,
    inputType: 'insertText',
    data: keyword
  }));
  input.dispatchEvent(new Event('change', { bubbles: true }));

  if (submitMode === 'button') {
    if (!buttonSelector) {
      return { ok: false, statusKey: 'searchButtonSelectorError' };
    }

    const button = querySelectorOrError(buttonSelector, 'searchButtonSelectorError');
    if (button?.error) {
      return { ok: false, statusKey: button.error };
    }

    if (!button || typeof button.click !== 'function') {
      return { ok: false, statusKey: 'searchButtonNotFoundError' };
    }

    button.click();
    return { ok: true };
  }

  const enterWasNotCanceled = input.dispatchEvent(new KeyboardEvent('keydown', {
    key: 'Enter',
    code: 'Enter',
    bubbles: true,
    cancelable: true
  }));
  input.dispatchEvent(new KeyboardEvent('keyup', {
    key: 'Enter',
    code: 'Enter',
    bubbles: true,
    cancelable: true
  }));

  if (enterWasNotCanceled && input.form?.requestSubmit) {
    input.form.requestSubmit();
  }

  return { ok: true };
}

function cssEscape(value) {
  if (globalThis.CSS?.escape) {
    return CSS.escape(value);
  }

  return String(value).replace(/[^a-zA-Z0-9_-]/g, '\\$&');
}

function cssString(value) {
  return String(value)
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\n/g, '\\a ');
}

function selectorIsUnique(selector, element) {
  try {
    const matches = document.querySelectorAll(selector);
    return matches.length === 1 && matches[0] === element;
  } catch (_error) {
    return false;
  }
}

function selectorForElement(element) {
  if (!(element instanceof Element)) {
    return '';
  }

  if (element.id) {
    const selector = `#${cssEscape(element.id)}`;
    if (selectorIsUnique(selector, element)) {
      return selector;
    }
  }

  const tagName = element.localName;
  const attributes = ['name', 'aria-label', 'placeholder', 'role', 'type'];
  for (const attribute of attributes) {
    const value = element.getAttribute(attribute);
    if (!value) {
      continue;
    }

    const selector = `${tagName}[${attribute}="${cssString(value)}"]`;
    if (selectorIsUnique(selector, element)) {
      return selector;
    }
  }

  const parts = [];
  let current = element;
  while (current && current instanceof Element && current !== document.body) {
    let part = current.localName;
    if (current.id) {
      part += `#${cssEscape(current.id)}`;
      parts.unshift(part);
      break;
    }

    const siblings = Array.from(current.parentElement?.children || [])
      .filter((sibling) => sibling.localName === current.localName);
    if (siblings.length > 1) {
      part += `:nth-of-type(${siblings.indexOf(current) + 1})`;
    }

    parts.unshift(part);
    current = current.parentElement;
  }

  return parts.join(' > ');
}

function closestClickableElement(target) {
  if (!(target instanceof Element)) {
    return null;
  }

  return target.closest('button,input[type="button"],input[type="submit"],[role="button"],a') || target;
}

function getSearchInputSelector() {
  const target = lastContextMenuTarget || document.activeElement;
  const isSupportedInput = target instanceof HTMLInputElement
    || target instanceof HTMLTextAreaElement
    || target?.isContentEditable;

  if (!isSupportedInput) {
    return { ok: false, statusKey: 'searchInputNotFoundError' };
  }

  const selector = selectorForElement(target);
  if (!selector) {
    return { ok: false, statusKey: 'searchInputSelectorError' };
  }

  return { ok: true, selector };
}

function i18nMessage(key, fallback) {
  try {
    return chrome.i18n.getMessage(key) || fallback;
  } catch (_error) {
    return fallback;
  }
}

function createPickerBar() {
  const bar = document.createElement('div');
  const text = document.createElement('span');
  const skipButton = document.createElement('button');

  bar.style.cssText = [
    'position:fixed',
    'top:12px',
    'left:50%',
    'transform:translateX(-50%)',
    'z-index:2147483647',
    'display:flex',
    'align-items:center',
    'gap:10px',
    'max-width:min(560px,calc(100vw - 24px))',
    'padding:10px 12px',
    'border:1px solid #d1d5db',
    'border-radius:8px',
    'background:#111827',
    'color:#fff',
    'font:13px/1.4 system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif',
    'box-shadow:0 12px 28px rgba(0,0,0,.24)'
  ].join(';');

  text.textContent = i18nMessage(
    'buttonPickerPrompt',
    'Click the search button, or skip to submit with Enter.'
  );
  skipButton.type = 'button';
  skipButton.textContent = i18nMessage('buttonPickerSkip', 'Skip');
  skipButton.style.cssText = [
    'height:28px',
    'padding:0 10px',
    'border:1px solid rgba(255,255,255,.32)',
    'border-radius:6px',
    'background:#fff',
    'color:#111827',
    'font:600 12px/1 system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif',
    'cursor:pointer'
  ].join(';');

  bar.append(text, skipButton);
  document.documentElement.append(bar);
  return { bar, skipButton };
}

function pickSearchButtonSelector() {
  if (activePickerCleanup) {
    activePickerCleanup();
  }

  return new Promise((resolve) => {
    const { bar, skipButton } = createPickerBar();
    let hoverTarget = null;

    function cleanup() {
      if (hoverTarget) {
        hoverTarget.style.outline = '';
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

    function handleMouseOver(event) {
      const target = closestClickableElement(event.target);
      if (!(target instanceof Element) || bar.contains(target)) {
        return;
      }

      if (hoverTarget && hoverTarget !== target) {
        hoverTarget.style.outline = '';
      }
      hoverTarget = target;
      hoverTarget.style.outline = '2px solid #2563eb';
    }

    function handleClick(event) {
      event.preventDefault();
      event.stopPropagation();

      if (event.target === skipButton || skipButton.contains(event.target)) {
        finish({ ok: true, selector: '' });
        return;
      }

      if (bar.contains(event.target)) {
        return;
      }

      const target = closestClickableElement(event.target);
      const selector = selectorForElement(target);
      finish(selector
        ? { ok: true, selector }
        : { ok: false, statusKey: 'searchButtonSelectorError' });
    }

    function handleKeyDown(event) {
      if (event.key !== 'Escape') {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      finish({ ok: true, selector: '' });
    }

    activePickerCleanup = cleanup;
    document.addEventListener('click', handleClick, true);
    document.addEventListener('mouseover', handleMouseOver, true);
    document.addEventListener('keydown', handleKeyDown, true);
  });
}

document.addEventListener('contextmenu', (event) => {
  lastContextMenuTarget = event.target;
}, true);

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

  if (message.action === 'performSearch') {
    sendResponse(performSearch(message.payload));
    return true;
  }

  if (message.action === 'getSearchInputSelector') {
    sendResponse(getSearchInputSelector());
    return true;
  }

  if (message.action === 'pickSearchButtonSelector') {
    pickSearchButtonSelector().then((response) => sendResponse(response));
    return true;
  }

  return false;
});
