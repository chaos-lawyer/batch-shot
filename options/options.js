import { DEFAULT_SETTINGS, loadSettings, resetSettings, saveSettings } from '../utils/settings.js';
import { applyI18n, initI18n, message } from '../utils/i18n.js';
import { clampInteger } from '../utils/number.js';

const ACTION_POPUP_URL = 'popup/popup.html';

const SETTINGS_FIELDS = [
  { key: 'theme', type: 'value' },
  { key: 'appLanguage', type: 'value' },
  { key: 'iconClickAction', type: 'value' },
  { key: 'scheduledTasksEnabled', type: 'checked' },
  { key: 'format', type: 'value' },
  { key: 'screenshotQuality', type: 'number', min: 1, max: 100 },
  { key: 'urlListWrap', type: 'checked' },
  { key: 'reportEnabled', type: 'checked' },
  { key: 'reportFormat', type: 'value' },
  { key: 'reportFields', type: 'text' },
  { key: 'closeBatchTabsAfterCapture', type: 'checked' },
  { key: 'historyLimit', type: 'number', min: 1, max: 50 },
  { key: 'filenamePattern', type: 'text' },
  { key: 'filenameDateTimeFormat', type: 'text' },
  { key: 'metadataEnabled', type: 'checked' },
  { key: 'metadataPosition', type: 'value' },
  { key: 'metadataLayout', type: 'value' },
  { key: 'metadataFields', type: 'text' },
  { key: 'metadataDateTimeFormat', type: 'text' },
  { key: 'metadataFontSize', type: 'number' },
  { key: 'metadataPadding', type: 'number' },
  { key: 'metadataGap', type: 'number' },
  { key: 'metadataTextColor', type: 'value', fallback: true },
  { key: 'metadataBackgroundColor', type: 'value', fallback: true },
  { key: 'metadataLabelsEnabled', type: 'checked' },
  { key: 'metadataBoldLabels', type: 'checked' },
  { key: 'metadataSeparator', type: 'value' }
];

const SETTINGS_KEYS = SETTINGS_FIELDS.map((field) => field.key);
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

function readNumberField(field) {
  const value = Number(elements[field.key].value);
  if (!Number.isFinite(value)) {
    return DEFAULT_SETTINGS[field.key];
  }

  if (Number.isFinite(field.min) && Number.isFinite(field.max)) {
    return clampInteger(value, DEFAULT_SETTINGS[field.key], field.min, field.max);
  }
  return value || DEFAULT_SETTINGS[field.key];
}

function readField(field) {
  const element = elements[field.key];
  if (field.type === 'checked') {
    return element.checked;
  }
  if (field.type === 'number') {
    return readNumberField(field);
  }
  if (field.type === 'text') {
    return element.value.trim() || DEFAULT_SETTINGS[field.key];
  }
  return field.fallback
    ? element.value || DEFAULT_SETTINGS[field.key]
    : element.value;
}

function readForm() {
  return Object.fromEntries(SETTINGS_FIELDS.map((field) => [field.key, readField(field)]));
}

function writeField(settings, field) {
  const element = elements[field.key];
  if (field.type === 'checked') {
    element.checked = Boolean(settings[field.key]);
    return;
  }

  element.value = settings[field.key];
}

function writeForm(settings) {
  SETTINGS_FIELDS.forEach((field) => writeField(settings, field));
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

async function syncActionPopup(settings) {
  if (!chrome.action?.setPopup) {
    return;
  }

  await chrome.action.setPopup({
    popup: settings.iconClickAction === 'popup' ? ACTION_POPUP_URL : ''
  });
}

async function syncActionUi(settings) {
  await syncActionPopup(settings);
  await chrome.runtime.sendMessage({ action: 'syncActionUi' }).catch(() => {});
}

async function persistForm() {
  clearTimeout(saveTimer);
  setSaveState('savingStatus');
  const settings = await saveSettings(readForm());
  await syncActionUi(settings);
  setSaveState('savedStatus');
}

function scheduleSave() {
  clearTimeout(saveTimer);
  setSaveState('savingStatus');
  saveTimer = setTimeout(() => {
    persistForm().catch(() => setSaveState('saveErrorStatus'));
  }, 180);
}

function bindSaveEvents() {
  SETTINGS_FIELDS.forEach(({ key }) => {
    const node = elements[key];
    node.addEventListener('change', scheduleSave);
    node.addEventListener('input', scheduleSave);
  });
}

async function restoreSettings() {
  const settings = await loadSettings();
  await initI18n(settings.appLanguage);
  applyI18n();
  writeForm(settings);
  await syncActionUi(settings);
  setSaveState('savedStatus');
}

async function resetOptions() {
  const settings = await resetSettings(SETTINGS_KEYS);
  writeForm(settings);
  await syncActionUi(settings);
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

bindSaveEvents();

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
