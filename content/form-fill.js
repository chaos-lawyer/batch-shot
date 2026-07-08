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

function setElementValue(element, value) {
  const normalizedValue = String(value ?? '');

  if (element instanceof HTMLSelectElement) {
    const matchingOption = Array.from(element.options).find((option) => (
      option.value === normalizedValue || option.textContent.trim() === normalizedValue
    ));
    element.value = matchingOption?.value ?? normalizedValue;
    element.dispatchEvent(new Event('change', { bubbles: true }));
    return;
  }

  if (element instanceof HTMLInputElement && (element.type === 'checkbox' || element.type === 'radio')) {
    element.checked = ['true', '1', 'yes', 'on', element.value].includes(normalizedValue.toLowerCase())
      || normalizedValue === element.value;
    element.dispatchEvent(new Event('change', { bubbles: true }));
    return;
  }

  const isNativeInput = element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement;
  element.focus();
  if (isNativeInput) {
    setNativeValue(element, '');
  } else {
    element.textContent = '';
  }
  element.dispatchEvent(new InputEvent('input', {
    bubbles: true,
    inputType: 'deleteContentBackward',
    data: null
  }));
  if (isNativeInput) {
    setNativeValue(element, normalizedValue);
  } else {
    element.textContent = normalizedValue;
  }
  element.dispatchEvent(new InputEvent('input', {
    bubbles: true,
    inputType: 'insertText',
    data: normalizedValue
  }));
  element.dispatchEvent(new Event('change', { bubbles: true }));
}

function fillSearchForm(payload = {}) {
  const fields = Array.isArray(payload.fields) && payload.fields.length
    ? payload.fields
    : [{ selector: payload.inputSelector, value: payload.keyword }];

  if (!fields.length || fields.some((field) => !String(field.selector || '').trim())) {
    return { ok: false, statusKey: 'searchInputSelectorError' };
  }

  for (const field of fields) {
    const selector = String(field.selector || '').trim();
    const input = querySelectorOrError(selector, 'searchInputSelectorError');
    if (input?.error) {
      return { ok: false, statusKey: input.error };
    }

    const isNativeInput = input instanceof HTMLInputElement || input instanceof HTMLTextAreaElement;
    if (!isNativeInput && !(input instanceof HTMLSelectElement) && !input.isContentEditable) {
      return { ok: false, statusKey: 'searchInputNotFoundError' };
    }

    setElementValue(input, field.value);
  }

  const lastField = fields.at(-1);
  document.querySelector(String(lastField.selector || '').trim())?.focus?.();
  return { ok: true };
}
