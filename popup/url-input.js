import { DEFAULT_SETTINGS } from '../utils/settings.js';
import { message } from '../utils/i18n.js';

export function parseUrls(value) {
  return value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function parseTemplateLines(value) {
  return value
    .split(/\r?\n/)
    .map((line, index) => ({ line: line.trim(), number: index + 1 }))
    .filter((template) => template.line);
}

export function buildTemplateUrlsFromValues(templateValue, itemsValue) {
  const templates = parseTemplateLines(templateValue);
  const items = parseUrls(itemsValue);

  if (!templates.length && !items.length) {
    return { urls: [], errorKey: 'emptyUrlError' };
  }

  if (!templates.length || !items.length) {
    return { urls: [], errorKey: 'emptyUrlError' };
  }

  const missingPlaceholderLines = templates
    .filter((template) => !template.line.includes('%s'))
    .map((template) => template.number);

  if (missingPlaceholderLines.length) {
    return {
      urls: [],
      errorKey: 'urlTemplateMissingPlaceholderError',
      errorArgs: missingPlaceholderLines.join(', ')
    };
  }

  const entries = templates.flatMap((template) => (
    items.map((item) => ({
      url: template.line.replaceAll('%s', item),
      keyword: item
    }))
  ));

  return {
    urls: entries.map((entry) => entry.url),
    urlContexts: entries.map((entry) => ({ keyword: entry.keyword })),
    errorKey: ''
  };
}

export function createUrlInput({
  elements,
  saveSettings,
  addHistoryEntry,
  closeHistoryMenus,
  setStatus
}) {
  let urlInputMode = DEFAULT_SETTINGS.urlInputMode;
  function getMode() {
    return urlInputMode;
  }

  function getSettings() {
    return {
      urls: elements.urlList.value,
      urlInputMode,
      urlTemplate: elements.urlTemplate.value,
      urlTemplateItems: elements.urlTemplateItems.value,
      captureMode: elements.captureMode.value,
      delay: Number(elements.delay.value) || 0,
      folder: elements.folder.value.trim()
    };
  }

  function applyUrlListWrap(isEnabled) {
    elements.urlList.classList.toggle('no-wrap', !isEnabled);
    elements.urlListPane.classList.toggle('has-no-wrap', !isEnabled);
    elements.urlList.setAttribute('wrap', isEnabled ? 'soft' : 'off');
  }

  function updateUrlCount() {
    const count = parseUrls(elements.urlList.value).length;
    elements.urlCountBadge.textContent = count;
    elements.urlCountBadge.classList.toggle('has-data', count > 0);
  }

  function buildTemplateUrls() {
    return buildTemplateUrlsFromValues(elements.urlTemplate.value, elements.urlTemplateItems.value);
  }

  function updateTemplatePreview() {
    const { urls, errorKey, errorArgs } = buildTemplateUrls();
    elements.applyTemplateButton.disabled = Boolean(errorKey);
    elements.urlPreviewList.replaceChildren();

    if (errorKey && (elements.urlTemplate.value || elements.urlTemplateItems.value)) {
      elements.urlPreviewCount.textContent = message(errorKey, errorArgs);
      return;
    }

    elements.urlPreviewCount.textContent = message('urlPreviewCount', String(urls.length));
    urls.slice(0, 4).forEach((url) => {
      const item = document.createElement('li');
      item.textContent = url;
      elements.urlPreviewList.append(item);
    });
  }

  function setUrlInputMode(mode, shouldSave = true) {
    urlInputMode = mode === 'template' ? 'template' : 'list';
    elements.urlListPane.hidden = urlInputMode !== 'list';
    elements.urlTemplatePane.hidden = urlInputMode !== 'template';
    elements.captureSettings.hidden = urlInputMode !== 'list';
    elements.urlCountBadge.hidden = urlInputMode !== 'list';
    elements.extractLinksButton.hidden = urlInputMode !== 'list';
    elements.urlListHistoryButton.hidden = urlInputMode !== 'list';
    elements.urlListClearButton.hidden = urlInputMode !== 'list';
    elements.listModeButton.classList.toggle('active', urlInputMode === 'list');
    elements.templateModeButton.classList.toggle('active', urlInputMode === 'template');
    elements.listModeButton.setAttribute('aria-selected', String(urlInputMode === 'list'));
    elements.templateModeButton.setAttribute('aria-selected', String(urlInputMode === 'template'));

    if (urlInputMode !== 'list') {
      closeHistoryMenus('urls');
    }

    if (shouldSave) {
      saveSettings();
    }
  }

  async function applyTemplateToList() {
    const { urls, errorKey, errorArgs } = buildTemplateUrls();
    if (errorKey) {
      setStatus(message(errorKey, errorArgs));
      return;
    }

    await addHistoryEntry('templates', elements.urlTemplate.value);
    await addHistoryEntry('templateItems', elements.urlTemplateItems.value);
    elements.urlList.value = urls.join('\n');
    updateUrlCount();
    setUrlInputMode('list', false);
    await saveSettings();
  }

  function restoreUrlSettings(settings) {
    elements.urlList.value = settings.urls;
    applyUrlListWrap(settings.urlListWrap);
    updateUrlCount();
    elements.urlTemplate.value = settings.urlTemplate;
    elements.urlTemplateItems.value = settings.urlTemplateItems;
    setUrlInputMode(settings.urlInputMode || DEFAULT_SETTINGS.urlInputMode, false);
    updateTemplatePreview();
    elements.captureMode.value = settings.captureMode;
    elements.delay.value = settings.delay;
    elements.folder.value = settings.folder;
  }

  function bindUrlInputEvents() {
    elements.urlList.addEventListener('input', updateUrlCount);
    elements.urlList.addEventListener('change', updateUrlCount);
    elements.listModeButton.addEventListener('click', () => setUrlInputMode('list'));
    elements.templateModeButton.addEventListener('click', () => setUrlInputMode('template'));
    elements.urlTemplate.addEventListener('input', updateTemplatePreview);
    elements.urlTemplateItems.addEventListener('input', updateTemplatePreview);
    elements.applyTemplateButton.addEventListener('click', applyTemplateToList);
  }

  return {
    getMode,
    getSettings,
    parseUrls,
    buildTemplateUrls,
    updateUrlCount,
    updateTemplatePreview,
    setUrlInputMode,
    restoreUrlSettings,
    bindUrlInputEvents
  };
}
