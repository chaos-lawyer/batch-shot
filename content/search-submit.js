function performSearch(payload = {}) {
  const fields = Array.isArray(payload.fields) && payload.fields.length
    ? payload.fields
    : [{ selector: payload.inputSelector, value: payload.keyword }];
  const submitMode = payload.submitMode === 'button' ? 'button' : 'enter';
  const buttonSelector = String(payload.buttonSelector || '').trim();

  if (!fields.length || fields.some((field) => !String(field.selector || '').trim())) {
    return { ok: false, statusKey: 'searchInputSelectorError' };
  }

  let input = null;
  for (const field of fields) {
    const selector = String(field.selector || '').trim();
    input = querySelectorOrError(selector, 'searchInputSelectorError');
    if (input?.error) {
      return { ok: false, statusKey: input.error };
    }

    const isNativeInput = input instanceof HTMLInputElement || input instanceof HTMLTextAreaElement;
    if (!isNativeInput && !(input instanceof HTMLSelectElement) && !input.isContentEditable) {
      return { ok: false, statusKey: 'searchInputNotFoundError' };
    }

    setElementValue(input, field.value);
  }

  input?.focus?.();

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
