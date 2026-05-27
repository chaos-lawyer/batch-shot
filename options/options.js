import { DEFAULT_SETTINGS, loadSettings, resetSettings, saveSettings } from '../utils/settings.js';
import { applyI18n, initI18n, message } from '../utils/i18n.js';

const SETTINGS_KEYS = [
  'theme',
  'appLanguage',
  'format',
  'screenshotQuality',
  'urlListWrap',
  'reportEnabled',
  'reportFormat',
  'reportFields',
  'closeBatchTabsAfterCapture',
  'historyLimit',
  'filenamePattern',
  'filenameDateTimeFormat',
  'metadataEnabled',
  'metadataPosition',
  'metadataLayout',
  'metadataFields',
  'metadataDateTimeFormat',
  'metadataFontSize',
  'metadataPadding',
  'metadataGap',
  'metadataTextColor',
  'metadataBackgroundColor',
  'metadataLabelsEnabled',
  'metadataBoldLabels',
  'metadataSeparator'
];

const $ = (id) => document.getElementById(id);

const elements = Object.fromEntries([
  ...SETTINGS_KEYS,
  'captureCurrentPageShortcut',
  'captureCurrentWindowShortcut',
  'openChromeShortcutsButton',
  'openPopupShortcut',
  'screenshotQualityValue',
  'metadataControls',
  'reportControls',
  'saveState',
  'resetButton'
].map((id) => [id, $(id)]));

let saveTimer;

function setSaveState(key) {
  elements.saveState.textContent = message(key);
}

function getNumber(id) {
  return Number(elements[id].value) || DEFAULT_SETTINGS[id];
}

function getClampedNumber(id, min, max) {
  const value = Number(elements[id].value);
  if (!Number.isFinite(value)) {
    return DEFAULT_SETTINGS[id];
  }

  return Math.min(max, Math.max(min, Math.round(value)));
}

function readForm() {
  return {
    theme: elements.theme.value,
    appLanguage: elements.appLanguage.value,
    format: elements.format.value,
    screenshotQuality: getClampedNumber('screenshotQuality', 1, 100),
    urlListWrap: elements.urlListWrap.checked,
    reportEnabled: elements.reportEnabled.checked,
    reportFormat: elements.reportFormat.value,
    reportFields: elements.reportFields.value.trim() || DEFAULT_SETTINGS.reportFields,
    closeBatchTabsAfterCapture: elements.closeBatchTabsAfterCapture.checked,
    historyLimit: getClampedNumber('historyLimit', 1, 50),
    filenamePattern: elements.filenamePattern.value.trim() || DEFAULT_SETTINGS.filenamePattern,
    filenameDateTimeFormat: elements.filenameDateTimeFormat.value.trim() || DEFAULT_SETTINGS.filenameDateTimeFormat,
    metadataEnabled: elements.metadataEnabled.checked,
    metadataPosition: elements.metadataPosition.value,
    metadataLayout: elements.metadataLayout.value,
    metadataFields: elements.metadataFields.value.trim() || DEFAULT_SETTINGS.metadataFields,
    metadataDateTimeFormat: elements.metadataDateTimeFormat.value.trim() || DEFAULT_SETTINGS.metadataDateTimeFormat,
    metadataFontSize: getNumber('metadataFontSize'),
    metadataPadding: getNumber('metadataPadding'),
    metadataGap: getNumber('metadataGap'),
    metadataTextColor: elements.metadataTextColor.value || DEFAULT_SETTINGS.metadataTextColor,
    metadataBackgroundColor: elements.metadataBackgroundColor.value || DEFAULT_SETTINGS.metadataBackgroundColor,
    metadataLabelsEnabled: elements.metadataLabelsEnabled.checked,
    metadataBoldLabels: elements.metadataBoldLabels.checked,
    metadataSeparator: elements.metadataSeparator.value
  };
}

function writeForm(settings) {
  elements.theme.value = settings.theme;
  elements.appLanguage.value = settings.appLanguage;
  elements.format.value = settings.format;
  elements.screenshotQuality.value = settings.screenshotQuality;
  elements.urlListWrap.checked = Boolean(settings.urlListWrap);
  elements.reportEnabled.checked = Boolean(settings.reportEnabled);
  elements.reportFormat.value = settings.reportFormat;
  elements.reportFields.value = settings.reportFields;
  elements.closeBatchTabsAfterCapture.checked = Boolean(settings.closeBatchTabsAfterCapture);
  elements.historyLimit.value = settings.historyLimit;
  elements.filenamePattern.value = settings.filenamePattern;
  elements.filenameDateTimeFormat.value = settings.filenameDateTimeFormat;
  elements.metadataEnabled.checked = Boolean(settings.metadataEnabled);
  elements.metadataPosition.value = settings.metadataPosition;
  elements.metadataLayout.value = settings.metadataLayout;
  elements.metadataFields.value = settings.metadataFields;
  elements.metadataDateTimeFormat.value = settings.metadataDateTimeFormat;
  elements.metadataFontSize.value = settings.metadataFontSize;
  elements.metadataPadding.value = settings.metadataPadding;
  elements.metadataGap.value = settings.metadataGap;
  elements.metadataTextColor.value = settings.metadataTextColor;
  elements.metadataBackgroundColor.value = settings.metadataBackgroundColor;
  elements.metadataLabelsEnabled.checked = Boolean(settings.metadataLabelsEnabled);
  elements.metadataBoldLabels.checked = Boolean(settings.metadataBoldLabels);
  elements.metadataSeparator.value = settings.metadataSeparator;
  updateScreenshotQualityValue();
  updateReportControls();
  updateMetadataControls();
}

function updateScreenshotQualityValue() {
  const value = elements.screenshotQuality.value;
  elements.screenshotQualityValue.textContent = `${value}%`;
  elements.screenshotQuality.style.setProperty('--value-percent', `${value}%`);
}

function updateMetadataControls() {
  const isEnabled = elements.metadataEnabled.checked;
  elements.metadataControls.classList.toggle('expanded', isEnabled);
  elements.metadataEnabled.setAttribute('aria-expanded', String(isEnabled));
}

function updateReportControls() {
  const isEnabled = elements.reportEnabled.checked;
  elements.reportControls.classList.toggle('expanded', isEnabled);
  elements.reportEnabled.setAttribute('aria-expanded', String(isEnabled));
  elements.reportFormat.disabled = !isEnabled;
  elements.reportFields.disabled = !isEnabled;
}

function commandShortcut(commands, name, fallback) {
  const command = commands.find((item) => item.name === name);
  if (!command) {
    return fallback || message('shortcutNotSet');
  }

  return command.shortcut || message('shortcutNotSet');
}

async function restoreShortcuts() {
  const commands = await chrome.commands.getAll();
  elements.captureCurrentPageShortcut.textContent = commandShortcut(
    commands,
    'capture-current-page',
    'Alt+Shift+S'
  );
  elements.captureCurrentWindowShortcut.textContent = commandShortcut(
    commands,
    'capture-current-window',
    'Alt+Shift+W'
  );
  elements.openPopupShortcut.textContent = commandShortcut(commands, '_execute_action', 'Alt+Shift+B');
}

async function openChromeShortcuts() {
  await chrome.tabs.create({ url: 'chrome://extensions/shortcuts' });
}

async function persistForm() {
  clearTimeout(saveTimer);
  setSaveState('savingStatus');
  await saveSettings(readForm());
  setSaveState('savedStatus');
}

function scheduleSave() {
  clearTimeout(saveTimer);
  setSaveState('savingStatus');
  saveTimer = setTimeout(() => {
    persistForm().catch(() => setSaveState('saveErrorStatus'));
  }, 180);
}

async function restoreSettings() {
  const settings = await loadSettings();
  await initI18n(settings.appLanguage);
  applyI18n();
  writeForm(settings);
  setSaveState('savedStatus');
}

async function resetOptions() {
  const settings = await resetSettings(SETTINGS_KEYS);
  writeForm(settings);
  setSaveState('savedStatus');
}

document.addEventListener('DOMContentLoaded', async () => {
  await restoreSettings();
  await restoreShortcuts();
  document.documentElement.dataset.theme = elements.theme.value;
  
  const versionString = document.getElementById('versionString');
  if (versionString) {
    versionString.textContent = `v${chrome.runtime.getManifest().version}`;
  }
});

SETTINGS_KEYS.forEach((key) => {
  const node = elements[key];
  node.addEventListener('change', scheduleSave);
  node.addEventListener('input', scheduleSave);
});

elements.theme.addEventListener('change', () => {
  document.documentElement.dataset.theme = elements.theme.value;
});

elements.appLanguage.addEventListener('change', async () => {
  await persistForm();
  await initI18n(elements.appLanguage.value);
  applyI18n();
  await restoreShortcuts();
  setSaveState('savedStatus');
});

elements.screenshotQuality.addEventListener('input', updateScreenshotQualityValue);
elements.reportEnabled.addEventListener('change', updateReportControls);
elements.metadataEnabled.addEventListener('change', updateMetadataControls);

elements.resetButton.addEventListener('click', () => {
  resetOptions().catch(() => setSaveState('saveErrorStatus'));
});

elements.openChromeShortcutsButton.addEventListener('click', () => {
  openChromeShortcuts().catch(() => setSaveState('saveErrorStatus'));
});
