import { DEFAULT_SETTINGS, DEFAULT_URL_TEMPLATE_DELIMITER } from '../utils/settings.js';
import { message } from '../utils/i18n.js';

export function parseUrls(value) {
  return value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

export function parseSearchKeywords(value) {
  return parseUrls(value);
}

function parseTemplateLines(value) {
  return value
    .split(/\r?\n/)
    .map((line, index) => ({ line: line.trim(), number: index + 1 }))
    .filter((template) => template.line);
}

function splitSearchTemplateLine(line, delimiter) {
  if (!delimiter || !line.includes(delimiter)) {
    return null;
  }

  const [startUrl = '', inputSelector = '', ...buttonSelectorParts] = line.split(delimiter);
  return {
    startUrl: startUrl.trim(),
    inputSelector: inputSelector.trim(),
    buttonSelector: buttonSelectorParts.join(delimiter).trim()
  };
}

export function buildTemplateUrlsFromValues(templateValue, itemsValue, delimiter = DEFAULT_URL_TEMPLATE_DELIMITER) {
  const templates = parseTemplateLines(templateValue);
  const items = parseUrls(itemsValue);

  if (!templates.length && !items.length) {
    return { urls: [], errorKey: 'emptyUrlError' };
  }

  if (!templates.length) {
    return { urls: [], errorKey: 'urlTemplateEmptyTemplateError' };
  }

  if (!items.length) {
    return { urls: [], errorKey: 'urlTemplateEmptyItemsError' };
  }

  const parsedTemplates = templates.map((template) => ({
    ...template,
    search: splitSearchTemplateLine(template.line, delimiter)
  }));
  const invalidSearchLines = parsedTemplates
    .filter((template) => template.search && (!template.search.startUrl || !template.search.inputSelector))
    .map((template) => template.number);

  if (invalidSearchLines.length) {
    return {
      urls: [],
      searchJobs: [],
      errorKey: 'urlTemplateSearchFormatError',
      errorArgs: invalidSearchLines.join(', ')
    };
  }

  const missingPlaceholderLines = parsedTemplates
    .filter((template) => !template.search && !template.line.includes('%s'))
    .map((template) => template.number);

  if (missingPlaceholderLines.length) {
    return {
      urls: [],
      searchJobs: [],
      errorKey: 'urlTemplateMissingPlaceholderError',
      errorArgs: missingPlaceholderLines.join(', ')
    };
  }

  const urlEntries = parsedTemplates
    .filter((template) => !template.search)
    .flatMap((template) => items.map((item) => ({
      url: template.line.replaceAll('%s', item),
      keyword: item
    })));
  const searchJobs = parsedTemplates
    .filter((template) => template.search)
    .flatMap((template) => items.map((item) => ({
      kind: 'search',
      url: template.search.startUrl,
      urlContext: { keyword: item },
      search: {
        keyword: item,
        inputSelector: template.search.inputSelector,
        submitMode: template.search.buttonSelector ? 'button' : 'enter',
        buttonSelector: template.search.buttonSelector
      }
    })));

  return {
    urls: urlEntries.map((entry) => entry.url),
    urlContexts: urlEntries.map((entry) => ({ keyword: entry.keyword })),
    searchJobs,
    errorKey: ''
  };
}

export function createUrlInput({
  elements,
  saveSettings,
  closeHistoryMenus
}) {
  let urlInputMode = DEFAULT_SETTINGS.urlInputMode;
  let urlTemplateDelimiter = DEFAULT_SETTINGS.urlTemplateDelimiter;
  function getMode() {
    return urlInputMode;
  }

  function getSettings() {
    return {
      urls: elements.urlList.value,
      urlInputMode,
      urlTemplate: elements.urlTemplate.value,
      urlTemplateItems: elements.urlTemplateItems.value,
      urlTemplateDelimiter,
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

  function updateTemplateCounts() {
    const templateCount = parseTemplateLines(elements.urlTemplate.value).length;
    const itemCount = parseUrls(elements.urlTemplateItems.value).length;
    elements.urlTemplateCountBadge.textContent = templateCount;
    elements.urlTemplateItemsCountBadge.textContent = itemCount;
    elements.urlTemplateCountBadge.classList.toggle('has-data', templateCount > 0);
    elements.urlTemplateItemsCountBadge.classList.toggle('has-data', itemCount > 0);
  }

  function buildTemplateUrls() {
    return buildTemplateUrlsFromValues(
      elements.urlTemplate.value,
      elements.urlTemplateItems.value,
      urlTemplateDelimiter
    );
  }

  function updateTemplateHelp() {
    elements.urlTemplateLabel.title = message('urlPreviewHelp', urlTemplateDelimiter);
  }

  function closePreviewPanel() {
    elements.urlPreviewPanel.hidden = true;
  }

  function showPreviewPanel() {
    const { urls, searchJobs = [], errorKey, errorArgs } = buildTemplateUrls();
    elements.previewPanelList.replaceChildren();

    if (errorKey && (elements.urlTemplate.value || elements.urlTemplateItems.value)) {
      elements.previewPanelSummary.textContent = message(errorKey, errorArgs);
    } else {
      const total = urls.length + searchJobs.length;
      elements.previewPanelSummary.textContent = message('templatePreviewCount', String(total));

      urls.forEach((url) => {
        const item = document.createElement('div');
        item.className = 'url-preview-item';
        item.textContent = url;
        elements.previewPanelList.append(item);
      });
      searchJobs.forEach((job) => {
        const item = document.createElement('div');
        item.className = 'url-preview-item';
        item.textContent = `${job.url} -> ${job.search.keyword}`;
        elements.previewPanelList.append(item);
      });
    }

    elements.urlPreviewPanel.hidden = false;
  }

  function updateTemplatePreview() {
    const { urls, searchJobs = [], errorKey, errorArgs } = buildTemplateUrls();
    updateTemplateCounts();

    if (errorKey && (elements.urlTemplate.value || elements.urlTemplateItems.value)) {
      elements.urlPreviewCount.textContent = message(errorKey, errorArgs);
      elements.showPreviewButton.disabled = true;
      return;
    }

    const total = urls.length + searchJobs.length;
    elements.urlPreviewCount.textContent = message('templatePreviewCount', String(total));
    elements.showPreviewButton.disabled = total === 0;
  }

  function setUrlInputMode(mode, shouldSave = true) {
    urlInputMode = mode === 'template' ? 'template' : 'list';
    elements.urlListPane.hidden = urlInputMode !== 'list';
    elements.urlTemplatePane.hidden = urlInputMode !== 'template';
    elements.urlSection.classList.toggle('is-template-mode', urlInputMode === 'template');
    elements.captureSettings.hidden = false;
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

  function restoreUrlSettings(settings) {
    elements.urlList.value = settings.urls;
    applyUrlListWrap(settings.urlListWrap);
    updateUrlCount();
    elements.urlTemplate.value = settings.urlTemplate;
    elements.urlTemplateItems.value = settings.urlTemplateItems;
    urlTemplateDelimiter = settings.urlTemplateDelimiter || DEFAULT_SETTINGS.urlTemplateDelimiter;
    updateTemplateHelp();
    updateTemplateCounts();
    setUrlInputMode(settings.urlInputMode || DEFAULT_SETTINGS.urlInputMode, false);
    updateTemplatePreview();
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
    elements.showPreviewButton.addEventListener('click', showPreviewPanel);
    elements.previewPanelCloseButton.addEventListener('click', closePreviewPanel);
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
    bindUrlInputEvents,
    closePreviewPanel
  };
}
