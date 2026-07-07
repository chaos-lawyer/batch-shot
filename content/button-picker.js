let activePickerCleanup = null;

function closestClickableElement(target) {
  if (!(target instanceof Element)) {
    return null;
  }

  return target.closest('button,input[type="button"],input[type="submit"],[role="button"],a') || target;
}

function isVisibleElement(element) {
  const rect = element.getBoundingClientRect();
  const style = window.getComputedStyle(element);
  return rect.width > 0
    && rect.height > 0
    && style.visibility !== 'hidden'
    && style.display !== 'none';
}

function i18nMessage(key, fallback, provided = '') {
  if (provided) {
    return provided;
  }

  try {
    return chrome.i18n.getMessage(key) || fallback;
  } catch (_error) {
    return fallback;
  }
}

function createPickerBar(messages = {}) {
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
    'Click the search button, or skip to submit with Enter.',
    messages.prompt
  );
  skipButton.type = 'button';
  skipButton.textContent = i18nMessage('buttonPickerSkip', 'Skip', messages.skip);
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

function pickSearchButtonSelector(messages = {}) {
  if (activePickerCleanup) {
    activePickerCleanup();
  }

  return new Promise((resolve) => {
    const { bar, skipButton } = createPickerBar(messages);
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
