import { DEFAULT_SETTINGS, loadSettings, resetSettings, saveSettings } from '../utils/settings.js';
import { applyI18n, initI18n, message } from '../utils/i18n.js';
import { clampInteger } from '../utils/number.js';
import { initTokenPickers, updateTokenPickers } from './token-picker.js';

const ACTION_POPUP_URL = 'popup/popup.html';

const SETTINGS_FIELDS = [
  { key: 'theme', type: 'value' },
  { key: 'appLanguage', type: 'value' },
  { key: 'iconClickAction', type: 'value' },
  { key: 'scheduledTasksEnabled', type: 'checked' },
  { key: 'format', type: 'value' },
  { key: 'screenshotQuality', type: 'number', min: 1, max: 100 },
  { key: 'urlListWrap', type: 'checked' },
  { key: 'urlTemplateDelimiter', type: 'value', fallback: true },
  { key: 'captureMode', type: 'value' },
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
  { key: 'metadataSeparator', type: 'value' },
  { key: 'webhookEnabled', type: 'checked' },
  { key: 'webhookUrl', type: 'text' },
  { key: 'webhookMethod', type: 'value' },
  { key: 'webhookHeaders', type: 'text' },
  { key: 'webhookBodyTemplate', type: 'text' },
  { key: 'webhookTriggerCondition', type: 'value' },
  { key: 'webhookTimeout', type: 'number', min: 1, max: 120 },
  { key: 'webhookIgnoreErrors', type: 'checked' },
  { key: 'extractPageText', type: 'checked' },
  { key: 'saveTextMode', type: 'value' },
  { key: 'saveTextTemplate', type: 'text' },
  { key: 'saveTextCombinedSeparator', type: 'text' },
  { key: 'includeTextInReport', type: 'checked' },
  { key: 'pageTextLengthLimit', type: 'number', min: 1, max: 10000000 }
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
  'webhookControls',
  'pageTextControls',
  'testWebhookButton',
  'testWebhookStatus',
  'saveState',
  'resetButton',
  'helpButton',
  'metadataSeparatorField'
].map((id) => [id, $(id)]));

let saveStateTimeout;
let saveTimer;

function applyOptionsI18n() {
  applyI18n();
  document.querySelectorAll('[data-i18n-html]').forEach((node) => {
    node.innerHTML = message(node.dataset.i18nHtml);
  });
  updateTokenPickers();
}

function setSaveState(key) {
  elements.saveState.textContent = message(key);
  elements.saveState.className = `save-state visible state-${key}`;
  
  clearTimeout(saveStateTimeout);
  if (key === 'savedStatus') {
    saveStateTimeout = setTimeout(() => {
      elements.saveState.classList.remove('visible');
    }, 2000);
  }
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
  updateWebhookControls();
  updatePageTextControls();
  updateTokenPickers();
}

function updateScreenshotQualityValue() {
  const value = elements.screenshotQuality.value;
  elements.screenshotQualityValue.textContent = `${value}%`;
  elements.screenshotQuality.style.setProperty('--value-percent', `${value}%`);
}

function updateMetadataControls() {
  const isEnabled = elements.metadataEnabled.checked;
  const isInline = elements.metadataLayout.value === 'inline';
  elements.metadataControls.classList.toggle('expanded', isEnabled);
  elements.metadataEnabled.setAttribute('aria-expanded', String(isEnabled));
  elements.metadataSeparatorField.classList.toggle('is-hidden', !isInline);
  elements.metadataSeparator.disabled = !isEnabled || !isInline;
}

function updateReportControls() {
  const isEnabled = elements.reportEnabled.checked;
  elements.reportControls.classList.toggle('expanded', isEnabled);
  elements.reportEnabled.setAttribute('aria-expanded', String(isEnabled));
  elements.reportFormat.disabled = !isEnabled;
  elements.reportFields.disabled = !isEnabled;
}

function updateWebhookControls() {
  const isEnabled = elements.webhookEnabled.checked;
  elements.webhookControls.classList.toggle('expanded', isEnabled);
  elements.webhookEnabled.setAttribute('aria-expanded', String(isEnabled));
  elements.webhookUrl.disabled = !isEnabled;
  elements.webhookMethod.disabled = !isEnabled;
  elements.webhookTriggerCondition.disabled = !isEnabled;
  elements.webhookHeaders.disabled = !isEnabled;
  elements.webhookBodyTemplate.disabled = !isEnabled;
  elements.webhookTimeout.disabled = !isEnabled;
  elements.webhookIgnoreErrors.disabled = !isEnabled;
  elements.testWebhookButton.disabled = !isEnabled;
}

function updatePageTextControls() {
  const isEnabled = elements.extractPageText.checked;
  elements.pageTextControls.classList.toggle('expanded', isEnabled);
  elements.extractPageText.setAttribute('aria-expanded', String(isEnabled));
  elements.saveTextMode.disabled = !isEnabled;
  elements.saveTextTemplate.disabled = !isEnabled;

  const isCombined = elements.saveTextMode.value === 'combined';
  elements.saveTextCombinedSeparator.disabled = !isEnabled || !isCombined;
  const separatorField = document.getElementById('combinedSeparatorField');
  if (separatorField) {
    separatorField.style.display = isCombined ? 'block' : 'none';
  }

  elements.includeTextInReport.disabled = !isEnabled;
  elements.pageTextLengthLimit.disabled = !isEnabled;
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
  applyOptionsI18n();
  writeForm(settings);
  await syncActionUi(settings);
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
  setupScrollObserver();
  document.documentElement.dataset.theme = elements.theme.value;
  initTokenPickers();
  
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
  applyOptionsI18n();
  await restoreShortcuts();
  setSaveState('savedStatus');
});

elements.screenshotQuality.addEventListener('input', updateScreenshotQualityValue);
elements.reportEnabled.addEventListener('change', updateReportControls);
elements.metadataEnabled.addEventListener('change', updateMetadataControls);
elements.metadataLayout.addEventListener('change', updateMetadataControls);
elements.webhookEnabled.addEventListener('change', updateWebhookControls);
elements.extractPageText.addEventListener('change', updatePageTextControls);
elements.saveTextMode.addEventListener('change', updatePageTextControls);
elements.testWebhookButton.addEventListener('click', handleTestWebhook);

elements.resetButton.addEventListener('click', () => {
  showConfirmModal('resetSettingsConfirm', () => {
    resetOptions().catch(() => setSaveState('saveErrorStatus'));
  });
});

elements.openChromeShortcutsButton.addEventListener('click', () => {
  openChromeShortcuts().catch(() => setSaveState('saveErrorStatus'));
});

elements.helpButton.addEventListener('click', () => {
  chrome.tabs.create({ url: chrome.runtime.getURL('help/help.html') });
});

async function handleTestWebhook() {
  const statusEl = elements.testWebhookStatus;
  statusEl.textContent = message('testWebhookSending');
  statusEl.className = 'test-status sending';

  const settings = readForm();

  const testPayload = {
    runId: 'test_run_12345',
    taskName: 'Test Webhook Task',
    status: 'success',
    startedAt: new Date(Date.now() - 5000).toISOString(),
    finishedAt: new Date().toISOString(),
    durationMs: 5000,
    total: 2,
    success: 1,
    failed: 1,
    cancelled: false,
    folder: 'BatchShot_Test',
    reportFilename: 'BatchShot_Test/report-test.csv',
    items: [
      {
        index: 1,
        url: 'https://example.com',
        title: 'Example Domain',
        status: 'ok',
        filename: 'BatchShot_Test/001-example.png',
        error: ''
      },
      {
        index: 2,
        url: 'https://invalid-url.local',
        title: '',
        status: 'error',
        filename: '',
        error: 'net::ERR_NAME_NOT_RESOLVED'
      }
    ]
  };

  try {
    const response = await chrome.runtime.sendMessage({
      action: 'testWebhook',
      payload: {
        payload: testPayload,
        options: settings
      }
    });

    if (response?.ok) {
      statusEl.textContent = message('testWebhookSuccess').replace('$1', String(response.result.status));
      statusEl.className = 'test-status success';
    } else {
      statusEl.textContent = message('testWebhookFailed').replace('$1', response?.error || 'Unknown error');
      statusEl.className = 'test-status error';
    }
  } catch (error) {
    statusEl.textContent = message('testWebhookFailed').replace('$1', error.message || 'Connection error');
    statusEl.className = 'test-status error';
  }
}

function showConfirmModal(messageKey, onConfirm) {
  const modal = $('confirmModal');
  const messageEl = $('confirmModalMessage');
  const okBtn = $('confirmOkButton');
  const cancelBtn = $('confirmCancelButton');

  messageEl.textContent = message(messageKey);
  modal.classList.add('visible');
  modal.setAttribute('aria-hidden', 'false');

  const cleanup = () => {
    modal.classList.remove('visible');
    modal.setAttribute('aria-hidden', 'true');
    okBtn.removeEventListener('click', handleConfirm);
    cancelBtn.removeEventListener('click', handleCancel);
    modal.removeEventListener('click', handleOverlayClick);
    document.removeEventListener('keydown', handleKeydown);
  };

  const handleConfirm = () => {
    cleanup();
    onConfirm();
  };

  const handleCancel = () => {
    cleanup();
  };

  const handleOverlayClick = (e) => {
    if (e.target === modal) handleCancel();
  };

  const handleKeydown = (e) => {
    if (e.key === 'Escape') handleCancel();
    if (e.key === 'Enter') handleConfirm();
  };

  okBtn.addEventListener('click', handleConfirm);
  cancelBtn.addEventListener('click', handleCancel);
  modal.addEventListener('click', handleOverlayClick);
  document.addEventListener('keydown', handleKeydown);
}

function setupScrollObserver() {
  const sections = document.querySelectorAll('.section');
  const navLinks = document.querySelectorAll('#settingsNav a');

  const observerOptions = {
    root: null,
    rootMargin: '-10% 0px -70% 0px',
    threshold: 0
  };

  const observer = new IntersectionObserver((entries) => {
    const isAtBottom = window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 50;
    if (isAtBottom) {
      navLinks.forEach((link, idx) => {
        if (idx === navLinks.length - 1) {
          link.classList.add('active');
        } else {
          link.classList.remove('active');
        }
      });
      return;
    }

    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        const id = entry.target.getAttribute('id');
        navLinks.forEach((link) => {
          if (link.getAttribute('href') === `#${id}`) {
            link.classList.add('active');
          } else {
            link.classList.remove('active');
          }
        });
      }
    });
  }, observerOptions);

  sections.forEach((section) => observer.observe(section));

  // Handle boundary case when scroll reaches absolute bottom
  window.addEventListener('scroll', () => {
    const isAtBottom = window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 50;
    if (isAtBottom) {
      navLinks.forEach((link, idx) => {
        if (idx === navLinks.length - 1) {
          link.classList.add('active');
        } else {
          link.classList.remove('active');
        }
      });
    }
  });

  // Smooth anchor scrolling
  navLinks.forEach((anchor) => {
    anchor.addEventListener('click', function (e) {
      e.preventDefault();
      const targetId = this.getAttribute('href');
      const targetElement = document.querySelector(targetId);
      if (targetElement) {
        targetElement.scrollIntoView({
          behavior: 'smooth'
        });
        history.pushState(null, null, targetId);
      }
    });
  });
}
