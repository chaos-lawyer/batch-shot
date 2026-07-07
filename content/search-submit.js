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

  setElementValue(input, keyword);

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
