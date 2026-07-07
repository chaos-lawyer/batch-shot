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
