let activePickerCleanup = null;


function closestSubmitElement(target) {
  if (!(target instanceof Element)) {
    return null;
  }

  return target.closest('button,input[type="button"],input[type="submit"],[role="button"],a');
}

function closestTemplateFieldElement(target) {
  if (!(target instanceof Element)) {
    return null;
  }

  const field = target.closest('input,textarea,select,[contenteditable=""],[contenteditable="true"],[role="searchbox"],[role="textbox"],[role="combobox"]');
  if (!field || !isVisibleElement(field)) {
    return null;
  }

  if (field instanceof HTMLInputElement) {
    return ['button', 'submit', 'reset', 'hidden', 'image', 'file'].includes(field.type) ? null : field;
  }

  return field;
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
  const textContainer = document.createElement('div');
  const text = document.createElement('span');
  const badge = document.createElement('span');
  const skipButton = document.createElement('button');
  const closeButton = document.createElement('button');

  bar.style.cssText = [
    'position:fixed',
    'top:16px',
    'left:50%',
    'transform:translateX(-50%)',
    'z-index:2147483647',
    'display:flex',
    'align-items:center',
    'gap:12px',
    'max-width:min(600px,calc(100vw - 32px))',
    'padding:10px 18px',
    'border-radius:10px',
    'background:#FFFFFF',
    'color:#111827',
    'font:0.875rem/1.45 system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif',
    'box-shadow:0 12px 32px rgba(0,0,0,0.15), 0 0 0 1px rgba(0,0,0,0.05)',
    'border-left:4px solid #2563EB',
    'border-right:4px solid #2563EB'
  ].join(';');

  textContainer.style.cssText = [
    'flex:1 1 auto',
    'min-width:0'
  ].join(';');

  text.textContent = messages.prompt || '';
  text.style.cssText = [
    'overflow-wrap:anywhere'
  ].join(';');

  badge.style.cssText = [
    'display:none',
    'color:#2563EB',
    'font-weight:600',
    'margin-top:6px',
    'white-space:nowrap'
  ].join(';');

  skipButton.type = 'button';
  skipButton.textContent = i18nMessage('buttonPickerSkip', 'Skip', messages.skip);
  skipButton.style.cssText = [
    'flex:0 0 auto',
    'height:30px',
    'min-width:54px',
    'padding:0 12px',
    'border:1px solid rgba(59,130,246,0.3)',
    'border-radius:6px',
    'background:transparent',
    'color:#2563EB',
    'font:600 0.8125rem/1 system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif',
    'white-space:nowrap',
    'cursor:pointer',
    'transition:all 0.15s ease'
  ].join(';');

  skipButton.onmouseenter = () => {
    skipButton.style.background = 'rgba(59,130,246,0.05)';
    skipButton.style.borderColor = 'rgba(59,130,246,0.5)';
  };
  skipButton.onmouseleave = () => {
    skipButton.style.background = 'transparent';
    skipButton.style.borderColor = 'rgba(59,130,246,0.3)';
  };

  closeButton.type = 'button';
  closeButton.textContent = i18nMessage('linkSelectorCancelButton', 'Cancel', messages.cancel);
  closeButton.style.cssText = [
    'flex:0 0 auto',
    'height:30px',
    'padding:0 8px',
    'border:none',
    'background:transparent',
    'color:#6B7280',
    'font:500 0.8125rem/1 system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif',
    'white-space:nowrap',
    'cursor:pointer',
    'transition:all 0.15s ease'
  ].join(';');

  closeButton.onmouseenter = () => {
    closeButton.style.color = '#374151';
    closeButton.style.textDecoration = 'underline';
  };
  closeButton.onmouseleave = () => {
    closeButton.style.color = '#6B7280';
    closeButton.style.textDecoration = 'none';
  };

  textContainer.append(text, badge);
  bar.append(textContainer, skipButton, closeButton);
  document.documentElement.append(bar);
  return { bar, text, badge, skipButton, closeButton };
}

function pickSearchTemplateSelectors(messages = {}) {
  if (activePickerCleanup) {
    activePickerCleanup();
  }

  return new Promise((resolve) => {
    const prompt = i18nMessage(
      'templateSelectorPickerPrompt',
      'Click each form input field you want to fill in, one by one. When done, click the submit/search button to select it and finish. If no button is needed, click "Skip" to use the Enter key instead.',
      messages.prompt
    );
    const { bar, text, badge, skipButton, closeButton } = createPickerBar({ ...messages, prompt });
    const fields = Array.isArray(messages.initialSelectors)
      ? messages.initialSelectors.filter(Boolean)
      : [];
    let hoverTarget = null;

    function updatePrompt() {
      if (fields.length) {
        const template = messages.counterTemplate || `{count} field(s) selected`;
        badge.textContent = template.replace('{count}', String(fields.length));
        badge.style.display = 'block';
      } else {
        badge.style.display = 'none';
      }
    }

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

      const field = closestTemplateFieldElement(event.target);
      if (field) {
        setHoverTarget(field, '#16a34a');
        return;
      }

      const button = closestSubmitElement(event.target);
      if (button) {
        setHoverTarget(button, '#2563eb');
      }
    }

    function handleClick(event) {
      event.preventDefault();
      event.stopPropagation();

      if (event.target === closeButton || closeButton.contains(event.target)) {
        finish({ ok: false, cancelled: true });
        return;
      }

      if (event.target === skipButton || skipButton.contains(event.target)) {
        finish({ ok: true, selectors: fields, buttonSelector: '' });
        return;
      }

      if (bar.contains(event.target)) {
        return;
      }

      const field = closestTemplateFieldElement(event.target);
      if (field) {
        const selector = selectorForElement(field);
        if (!selector) {
          finish({ ok: false, statusKey: 'searchInputSelectorError' });
          return;
        }
        if (!fields.includes(selector)) {
          fields.push(selector);
        }
        updatePrompt();
        return;
      }

      const button = closestSubmitElement(event.target);
      const selector = selectorForElement(button);
      finish(selector
        ? { ok: true, selectors: fields, buttonSelector: selector }
        : { ok: false, statusKey: 'searchButtonSelectorError' });
    }

    function handleKeyDown(event) {
      if (event.key !== 'Escape') {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      finish({ ok: false, cancelled: true });
    }

    updatePrompt();
    activePickerCleanup = cleanup;
    document.addEventListener('click', handleClick, true);
    document.addEventListener('mouseover', handleMouseOver, true);
    document.addEventListener('keydown', handleKeyDown, true);
  });
}
