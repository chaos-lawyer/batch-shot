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

  const [startUrl = '', ...selectors] = line.split(delimiter);
  return {
    startUrl: startUrl.trim(),
    selectors: selectors.map((selector) => selector.trim()).filter(Boolean)
  };
}

function parseTemplateItemValues(value, delimiter) {
  const rawValue = String(value ?? '').trim();
  if (!rawValue) {
    return [];
  }

  if (delimiter && rawValue.includes(delimiter)) {
    return rawValue.split(delimiter).map((part) => part.trim());
  }

  if (rawValue.includes('\t')) {
    return rawValue.split('\t').map((part) => part.trim());
  }

  return [rawValue];
}

function getSearchTemplateSelectorCounts(templateValue, delimiter) {
  return [...new Set(parseTemplateLines(templateValue)
    .map((template) => splitSearchTemplateLine(template.line, delimiter))
    .filter((template) => template?.startUrl && template.selectors.length)
    .map((template) => template.selectors.length))]
    .sort((a, b) => a - b);
}

export function buildTemplateUrlsFromValues(
  templateValue,
  itemsValue,
  delimiter = DEFAULT_URL_TEMPLATE_DELIMITER,
  options = {}
) {
  const templates = parseTemplateLines(templateValue);
  const items = parseUrls(itemsValue);
  const fillOnly = Boolean(options.fillOnly);

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
    .filter((template) => template.search && (!template.search.startUrl || !template.search.selectors.length))
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
  const fieldCountErrors = [];
  const searchJobs = parsedTemplates
    .filter((template) => template.search)
    .flatMap((template) => items.map((item, itemIndex) => {
      const values = parseTemplateItemValues(item, delimiter);
      const selectors = template.search.selectors;
      const hasButton = !fillOnly && values.length === selectors.length - 1;
      const isFieldOnly = values.length === selectors.length;
      const isFieldOnlyWithoutButton = fillOnly && values.length === selectors.length - 1;

      if (!isFieldOnly && !hasButton && !isFieldOnlyWithoutButton) {
        fieldCountErrors.push(`${template.number}:${itemIndex + 1}`);
        return null;
      }

      const fieldSelectors = (hasButton || isFieldOnlyWithoutButton) ? selectors.slice(0, -1) : selectors;
      const fields = fieldSelectors.map((selector, index) => ({
        selector,
        value: values[index]
      }));
      const keyword = values.join(' ');

      return {
        kind: 'search',
        url: template.search.startUrl,
        urlContext: { keyword },
        search: {
          keyword,
          fields,
          inputSelector: fields[0]?.selector || '',
          submitMode: hasButton ? 'button' : 'enter',
          buttonSelector: hasButton ? selectors.at(-1) : ''
        }
      };
    }))
    .filter(Boolean);

  if (fieldCountErrors.length) {
    return {
      urls: [],
      searchJobs: [],
      errorKey: fillOnly ? 'urlTemplateFillFieldCountError' : 'urlTemplateFieldCountError',
      errorArgs: fieldCountErrors.join(', ')
    };
  }

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
  closeHistoryMenus,
  onModeChange
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
      folder: elements.folder.value.trim(),
      sequentialStartUrl: elements.sequentialStartUrl.value.trim()
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

  function buildTemplateUrls(options = {}) {
    return buildTemplateUrlsFromValues(
      elements.urlTemplate.value,
      elements.urlTemplateItems.value,
      urlTemplateDelimiter,
      options
    );
  }

  function updateTemplateHelp() {
    const helpMessage = message('urlPreviewHelp', urlTemplateDelimiter);
    elements.urlTemplateLabel.title = helpMessage;
    elements.urlTemplate.title = helpMessage;

    const selectorCounts = getSearchTemplateSelectorCounts(elements.urlTemplate.value, urlTemplateDelimiter);
    const itemsHelpMessage = selectorCounts.length
      ? message('urlTemplateItemsFieldHelp', [selectorCounts.join('/'), urlTemplateDelimiter])
      : '';
    if (itemsHelpMessage) {
      elements.urlTemplateItemsLabel.title = itemsHelpMessage;
      elements.urlTemplateItems.title = itemsHelpMessage;
    } else {
      elements.urlTemplateItemsLabel.removeAttribute('title');
      elements.urlTemplateItems.removeAttribute('title');
    }
  }

  function closePreviewPanel() {
    elements.urlPreviewPanel.hidden = true;
  }

  function showPreviewPanel() {
    const { urls, searchJobs = [] } = buildTemplateUrls();
    elements.previewPanelList.replaceChildren();

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
      const values = (job.search.fields || []).map((field) => field.value).join(' / ');
      item.textContent = `${job.url} -> ${values}`;
      elements.previewPanelList.append(item);
    });

    elements.urlPreviewPanel.hidden = false;
  }

  function updateTemplatePreview() {
    const { urls, searchJobs = [] } = buildTemplateUrls();
    updateTemplateCounts();
    updateTemplateHelp();

    const total = urls.length + searchJobs.length;
    elements.urlPreviewCount.textContent = message('templatePreviewCount', String(total));
    elements.showPreviewButton.disabled = total === 0;
  }

  function setUrlInputMode(mode, shouldSave = true) {
    if (['list', 'template', 'sequential'].includes(mode)) {
      urlInputMode = mode;
    } else {
      urlInputMode = 'list';
    }
    
    elements.urlListPane.hidden = urlInputMode !== 'list';
    elements.urlTemplatePane.hidden = urlInputMode !== 'template';
    if (elements.urlSequentialPane) {
      elements.urlSequentialPane.hidden = urlInputMode !== 'sequential';
    }
    if (elements.urlListLabelWrapper) {
      elements.urlListLabelWrapper.hidden = urlInputMode !== 'list';
    }
    
    elements.urlSection.classList.toggle('is-template-mode', urlInputMode === 'template');
    elements.captureSettings.hidden = false;
    elements.urlCountBadge.hidden = urlInputMode !== 'list';
    elements.extractLinksButton.hidden = urlInputMode !== 'list';
    elements.urlListHistoryButton.hidden = urlInputMode !== 'list';
    elements.urlListClearButton.hidden = urlInputMode !== 'list';
    
    if (onModeChange) {
      onModeChange();
    }

    elements.listModeButton.classList.toggle('active', urlInputMode === 'list');
    elements.templateModeButton.classList.toggle('active', urlInputMode === 'template');
    if (elements.sequentialModeButton) {
      elements.sequentialModeButton.classList.toggle('active', urlInputMode === 'sequential');
      elements.sequentialModeButton.setAttribute('aria-selected', String(urlInputMode === 'sequential'));
    }
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
    if (elements.sequentialStartUrl) {
      elements.sequentialStartUrl.value = settings.sequentialStartUrl || '';
    }
  }

  function bindUrlInputEvents() {
    elements.urlList.addEventListener('input', updateUrlCount);
    elements.urlList.addEventListener('change', updateUrlCount);
    elements.listModeButton.addEventListener('click', () => setUrlInputMode('list'));
    elements.templateModeButton.addEventListener('click', () => setUrlInputMode('template'));
    if (elements.sequentialModeButton) {
      elements.sequentialModeButton.addEventListener('click', () => setUrlInputMode('sequential'));
    }
    elements.urlTemplate.addEventListener('input', updateTemplatePreview);
    elements.urlTemplateItems.addEventListener('input', updateTemplatePreview);
    elements.showPreviewButton.addEventListener('click', showPreviewPanel);
    elements.previewPanelCloseButton.addEventListener('click', closePreviewPanel);
  }

  function getDelimiter() {
    return urlTemplateDelimiter;
  }

  return {
    getMode,
    getSettings,
    getDelimiter,
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
