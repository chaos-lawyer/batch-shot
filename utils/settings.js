import { DEFAULT_REPORT_FIELDS, normalizeReportFields } from './report-fields.js';

export const DEFAULT_SETTINGS = {
  theme: 'auto',
  appLanguage: 'auto',
  urls: '',
  urlInputMode: 'list',
  urlListWrap: true,
  urlTemplate: '',
  urlTemplateItems: '',
  captureMode: 'fullPage',
  format: 'png',
  screenshotQuality: 92,
  delay: 1,
  folder: 'BatchShot',
  reportEnabled: false,
  reportFormat: 'csv',
  reportFields: DEFAULT_REPORT_FIELDS,
  closeBatchTabsAfterCapture: true,
  historyLimit: 10,
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

  return {
    ...settings,
    appLanguage,
    format,
    reportFormat,
    reportFields: normalizeReportFields(settings.reportFields),
    screenshotQuality: Number.isFinite(screenshotQuality)
      ? Math.min(100, Math.max(1, Math.round(screenshotQuality)))
      : DEFAULT_SETTINGS.screenshotQuality,
    historyLimit: Number.isFinite(historyLimit)
      ? Math.min(50, Math.max(1, Math.round(historyLimit)))
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
