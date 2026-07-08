import { DEFAULT_REPORT_FIELDS, normalizeReportFields } from './report-fields.js';
import { clampInteger } from './number.js';

export const DEFAULT_URL_TEMPLATE_DELIMITER = ' :: ';

export const DEFAULT_SETTINGS = {
  theme: 'auto',
  appLanguage: 'auto',
  urls: '',
  urlInputMode: 'list',
  urlListWrap: true,
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
  delay: 1,
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
  metadataEnabled: false,
  metadataPosition: 'top',
  metadataLayout: 'stacked',
  metadataFields: 'capturedAt,url',
  metadataDateTimeFormat: 'YYYY/MM/DD HH:mm',
  metadataFontSize: 24,
  metadataPadding: 10,
  metadataGap: 10,
  metadataTextColor: '#ffffff',
  metadataBackgroundColor: '#000000',
  metadataLabelsEnabled: true,
  metadataBoldLabels: true,
  metadataSeparator: '  |  '
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
      || DEFAULT_SETTINGS.metadataDateTimeFormat
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
