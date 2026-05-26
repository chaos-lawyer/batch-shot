let activeMessages = null;

function normalizeLanguage(language) {
  if (language === 'en' || language === 'zh_CN') {
    return language;
  }

  return 'auto';
}

function applySubstitutions(text, placeholders = {}, substitutions) {
  if (substitutions === undefined) {
    return text;
  }

  const values = Array.isArray(substitutions) ? substitutions : [substitutions];
  let output = text;

  Object.entries(placeholders).forEach(([name, placeholder]) => {
    const match = String(placeholder.content || '').match(/^\$(\d+)$/);
    if (!match) {
      return;
    }

    output = output.replaceAll(`$${name.toUpperCase()}$`, values[Number(match[1]) - 1] ?? '');
  });

  values.forEach((value, index) => {
    output = output.replaceAll(`$${index + 1}`, value ?? '');
  });

  return output;
}

export async function initI18n(language) {
  const normalized = normalizeLanguage(language);
  activeMessages = null;

  if (normalized === 'auto') {
    document.documentElement.lang = chrome.i18n.getUILanguage();
    return;
  }

  document.documentElement.lang = normalized === 'zh_CN' ? 'zh-CN' : 'en';
  const response = await fetch(chrome.runtime.getURL(`_locales/${normalized}/messages.json`));
  activeMessages = await response.json();
}

export function message(key, substitutions) {
  if (!activeMessages) {
    return chrome.i18n.getMessage(key, substitutions) || key;
  }

  const entry = activeMessages[key];
  if (!entry) {
    return chrome.i18n.getMessage(key, substitutions) || key;
  }

  return applySubstitutions(entry.message, entry.placeholders, substitutions);
}

export function applyI18n(root = document) {
  root.querySelectorAll('[data-i18n]').forEach((node) => {
    node.textContent = message(node.dataset.i18n);
  });

  root.querySelectorAll('[data-i18n-placeholder]').forEach((node) => {
    node.placeholder = message(node.dataset.i18nPlaceholder);
  });

  root.querySelectorAll('[data-i18n-title]').forEach((node) => {
    const text = message(node.dataset.i18nTitle);
    node.title = text;
    if (node.hasAttribute('aria-label')) {
      node.setAttribute('aria-label', text);
    }
  });
}
