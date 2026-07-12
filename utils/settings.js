import { DEFAULT_REPORT_FIELDS, normalizeReportFields } from './report-fields.js';
import { clampInteger } from './number.js';

export const DEFAULT_URL_TEMPLATE_DELIMITER = ' :: ';

export const DEFAULT_SETTINGS = {
  theme: 'auto',
  appLanguage: 'auto',
  urls: '',
  urlInputMode: 'list',
  urlListWrap: false,
  urlTemplate: '',
  urlTemplateItems: '',
  urlTemplateDelimiter: DEFAULT_URL_TEMPLATE_DELIMITER,
  searchStartUrl: '',
  searchInputSelector: '',
  searchSubmitMode: 'enter',
  searchButtonSelector: '',
  searchKeywords: '',
  searchResultDelay: 2,
  captureMode: 'fullPage',
  iconClickAction: 'popup',
  scheduledTasksEnabled: false,
  format: 'png',
  screenshotQuality: 92,
  delay: 3,
  folder: 'BatchShot',
  reportEnabled: false,
  reportFormat: 'csv',
  reportFields: DEFAULT_REPORT_FIELDS,
  closeBatchTabsAfterCapture: true,
  historyLimit: 10,
  sequentialStartUrl: '',
  sequentialNextSelector: '',
  sequentialCaptureCount: 3,
  sequentialPanelExpanded: false,
  filenamePattern: '{index}-{host}',
  filenameDateTimeFormat: 'YYYY-MM-DD_HHmmss',
  metadataEnabled: true,
  metadataPosition: 'top',
  metadataLayout: 'stacked',
  metadataFields: '{capturedAt},{url}',
  metadataDateTimeFormat: 'YYYY/MM/DD HH:mm',
  metadataFontSize: 24,
  metadataPadding: 10,
  metadataGap: 10,
  metadataTextColor: '#ffffff',
  metadataBackgroundColor: '#000000',
  metadataLabelsEnabled: true,
  metadataBoldLabels: true,
  metadataSeparator: '  |  ',
  webhookEnabled: false,
  webhookUrl: '',
  webhookMethod: 'POST',
  webhookHeaders: '{}',
  webhookBodyTemplate: '{\n  "source": "BatchShot",\n  "event": "capture.completed",\n  "runId": "{runId}",\n  "taskName": "{taskName}",\n  "status": "{status}",\n  "startedAt": "{startedAt}",\n  "finishedAt": "{finishedAt}",\n  "durationMs": "{durationMs}",\n  "total": "{total}",\n  "success": "{success}",\n  "failed": "{failed}",\n  "cancelled": "{cancelled}",\n  "folder": "{folder}",\n  "reportFilename": "{reportFilename}",\n  "unfinishedTasksCount": "{unfinishedTasksCount}",\n  "items": "{items}"\n}',
  webhookTriggerCondition: 'always',
  webhookTimeout: 10,
  webhookIgnoreErrors: true,
  extractPageText: false,
  saveTextMode: 'separate',
  saveTextTemplate: 'URL: {url}\nTitle: {title}\nKeyword: {keyword}\n\n{text}',
  saveTextCombinedSeparator: '---',
  includeTextInReport: false,
  pageTextLengthLimit: 100000
};

function migrateSettings(settings) {
  const screenshotQuality = Number(settings.screenshotQuality);
  const historyLimit = Number(settings.historyLimit);
  const appLanguage = ['auto', 'en', 'zh_CN'].includes(settings.appLanguage)
    ? settings.appLanguage
    : DEFAULT_SETTINGS.appLanguage;
  const format = ['png', 'jpg', 'pdf'].includes(settings.format)
    ? settings.format
    : DEFAULT_SETTINGS.format;
  const reportFormat = ['csv', 'xlsx'].includes(settings.reportFormat)
    ? settings.reportFormat
    : DEFAULT_SETTINGS.reportFormat;
  const iconClickAction = ['popup', 'captureCurrentPage', 'captureAllPages'].includes(settings.iconClickAction)
    ? settings.iconClickAction
    : DEFAULT_SETTINGS.iconClickAction;
  const urlInputMode = ['list', 'template', 'sequential'].includes(settings.urlInputMode)
    ? settings.urlInputMode
    : DEFAULT_SETTINGS.urlInputMode;
  const captureMode = ['fullPage', 'viewport'].includes(settings.captureMode)
    ? settings.captureMode
    : DEFAULT_SETTINGS.captureMode;
  const searchSubmitMode = ['enter', 'button'].includes(settings.searchSubmitMode)
    ? settings.searchSubmitMode
    : DEFAULT_SETTINGS.searchSubmitMode;
  const urlTemplateDelimiter = settings.urlTemplateDelimiter && settings.urlTemplateDelimiter !== '\\'
    ? settings.urlTemplateDelimiter
    : DEFAULT_SETTINGS.urlTemplateDelimiter;

  const webhookTimeout = Number(settings.webhookTimeout);
  const webhookMethod = ['POST', 'GET'].includes(settings.webhookMethod)
    ? settings.webhookMethod
    : DEFAULT_SETTINGS.webhookMethod;
  const webhookTriggerCondition = ['always', 'success', 'failed', 'completed'].includes(settings.webhookTriggerCondition)
    ? settings.webhookTriggerCondition
    : DEFAULT_SETTINGS.webhookTriggerCondition;
  const saveTextMode = ['separate', 'combined'].includes(settings.saveTextMode)
    ? settings.saveTextMode
    : DEFAULT_SETTINGS.saveTextMode;
  const saveTextTemplate = typeof settings.saveTextTemplate === 'string'
    ? settings.saveTextTemplate
    : DEFAULT_SETTINGS.saveTextTemplate;
  const saveTextCombinedSeparator = typeof settings.saveTextCombinedSeparator === 'string'
    ? settings.saveTextCombinedSeparator
    : DEFAULT_SETTINGS.saveTextCombinedSeparator;
  const pageTextLengthLimit = Number(settings.pageTextLengthLimit);


  const sequentialCaptureCount = Number(settings.sequentialCaptureCount);
  const sequentialStartUrl = typeof settings.sequentialStartUrl === 'string'
    ? settings.sequentialStartUrl.trim()
    : DEFAULT_SETTINGS.sequentialStartUrl;
  const sequentialNextSelector = typeof settings.sequentialNextSelector === 'string'
    ? settings.sequentialNextSelector.trim()
    : DEFAULT_SETTINGS.sequentialNextSelector;
  const sequentialPanelExpanded = typeof settings.sequentialPanelExpanded === 'boolean'
    ? settings.sequentialPanelExpanded
    : DEFAULT_SETTINGS.sequentialPanelExpanded;

  return {
    ...settings,
    appLanguage,
    format,
    iconClickAction,
    urlInputMode,
    captureMode,
    searchSubmitMode,
    urlTemplateDelimiter,
    reportFormat,
    reportFields: normalizeReportFields(settings.reportFields),
    sequentialStartUrl,
    sequentialNextSelector,
    sequentialPanelExpanded,
    sequentialCaptureCount: Number.isFinite(sequentialCaptureCount)
      ? clampInteger(sequentialCaptureCount, DEFAULT_SETTINGS.sequentialCaptureCount, 1, 200)
      : DEFAULT_SETTINGS.sequentialCaptureCount,
    screenshotQuality: Number.isFinite(screenshotQuality)
      ? clampInteger(screenshotQuality, DEFAULT_SETTINGS.screenshotQuality, 1, 100)
      : DEFAULT_SETTINGS.screenshotQuality,
    historyLimit: Number.isFinite(historyLimit)
      ? clampInteger(historyLimit, DEFAULT_SETTINGS.historyLimit, 1, 50)
      : DEFAULT_SETTINGS.historyLimit,
    filenameDateTimeFormat: settings.filenameDateTimeFormat
      || [settings.filenameDateFormat, settings.filenameTimeFormat].filter(Boolean).join('_')
      || DEFAULT_SETTINGS.filenameDateTimeFormat,
    metadataDateTimeFormat: settings.metadataDateTimeFormat
      || [settings.metadataDateFormat, settings.metadataTimeFormat].filter(Boolean).join(' ')
      || DEFAULT_SETTINGS.metadataDateTimeFormat,
    webhookEnabled: typeof settings.webhookEnabled === 'boolean'
      ? settings.webhookEnabled
      : DEFAULT_SETTINGS.webhookEnabled,
    webhookUrl: typeof settings.webhookUrl === 'string'
      ? settings.webhookUrl.trim()
      : DEFAULT_SETTINGS.webhookUrl,
    webhookMethod,
    webhookHeaders: typeof settings.webhookHeaders === 'string'
      ? settings.webhookHeaders
      : DEFAULT_SETTINGS.webhookHeaders,
    webhookBodyTemplate: typeof settings.webhookBodyTemplate === 'string'
      ? settings.webhookBodyTemplate
      : DEFAULT_SETTINGS.webhookBodyTemplate,
    webhookTriggerCondition,
    webhookTimeout: Number.isFinite(webhookTimeout)
      ? clampInteger(webhookTimeout, DEFAULT_SETTINGS.webhookTimeout, 1, 120)
      : DEFAULT_SETTINGS.webhookTimeout,
    webhookIgnoreErrors: typeof settings.webhookIgnoreErrors === 'boolean'
      ? settings.webhookIgnoreErrors
      : DEFAULT_SETTINGS.webhookIgnoreErrors,
    extractPageText: typeof settings.extractPageText === 'boolean'
      ? settings.extractPageText
      : DEFAULT_SETTINGS.extractPageText,
    saveTextMode,
    saveTextTemplate,
    saveTextCombinedSeparator,
    includeTextInReport: typeof settings.includeTextInReport === 'boolean'
      ? settings.includeTextInReport
      : DEFAULT_SETTINGS.includeTextInReport,
    pageTextLengthLimit: Number.isFinite(pageTextLengthLimit)
      ? clampInteger(pageTextLengthLimit, DEFAULT_SETTINGS.pageTextLengthLimit, 1, 10000000)
      : DEFAULT_SETTINGS.pageTextLengthLimit
  };
}

export async function loadSettings() {
  const { settings = {} } = await chrome.storage.local.get('settings');
  return migrateSettings({ ...DEFAULT_SETTINGS, ...settings });
}

export async function saveSettings(changes) {
  const current = await loadSettings();
  const settings = { ...current, ...changes };
  await chrome.storage.local.set({ settings });
  return settings;
}

export async function resetSettings(keys) {
  const defaults = Object.fromEntries(keys.map((key) => [key, DEFAULT_SETTINGS[key]]));
  return saveSettings(defaults);
}
