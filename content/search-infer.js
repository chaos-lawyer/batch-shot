let lastContextMenuTarget = null;

document.addEventListener('contextmenu', (event) => {
  lastContextMenuTarget = event.target;
}, true);

function isSearchLikeInput(element) {
  if (element?.isContentEditable) {
    return true;
  }

  if (!(element instanceof HTMLInputElement) && !(element instanceof HTMLTextAreaElement)) {
    return false;
  }

  if (element.disabled || element.readOnly) {
    return false;
  }

  if (element instanceof HTMLTextAreaElement) {
    return true;
  }

  return [
    '',
    'search',
    'text',
    'url',
    'email',
    'tel'
  ].includes(element.type);
}

function searchInputScore(element) {
  const haystack = [
    element.getAttribute('type'),
    element.getAttribute('role'),
    element.getAttribute('name'),
    element.getAttribute('id'),
    element.getAttribute('placeholder'),
    element.getAttribute('aria-label'),
    element.getAttribute('title'),
    element.className
  ].join(' ').toLowerCase();
  const strongPattern = /(search|query|keyword|\bq\b|搜索|查询|检索|关键词)/i;
  let score = strongPattern.test(haystack) ? 10 : 0;

  if (element instanceof HTMLInputElement && element.type === 'search') {
    score += 6;
  }
  if (element.getAttribute('role') === 'searchbox') {
    score += 6;
  }
  if (document.activeElement === element) {
    score += 4;
  }
  if (element.form) {
    score += 1;
  }

  return score;
}

function inferSearchInputSelector() {
  const candidates = Array.from(document.querySelectorAll('input,textarea,[contenteditable=""],[contenteditable="true"],[role="searchbox"]'))
    .filter((element) => isSearchLikeInput(element) && isVisibleElement(element))
    .map((element) => ({ element, score: searchInputScore(element) }))
    .sort((a, b) => b.score - a.score);

  if (!candidates.length) {
    return '';
  }

  const [best] = candidates;
  const shouldUseBest = best.score > 0 || candidates.length === 1;
  return shouldUseBest ? selectorForElement(best.element) : '';
}

function getSearchInputSelector() {
  const target = lastContextMenuTarget || document.activeElement;
  const isSupportedInput = target instanceof HTMLInputElement
    || target instanceof HTMLTextAreaElement
    || target?.isContentEditable;

  if (isSupportedInput) {
    const selector = selectorForElement(target);
    if (!selector) {
      return { ok: false, statusKey: 'searchInputSelectorError' };
    }

    return { ok: true, selector };
  }

  const selector = inferSearchInputSelector();
  if (!selector) {
    return { ok: false, statusKey: 'searchInputNotFoundError' };
  }

  return { ok: true, selector };
}
