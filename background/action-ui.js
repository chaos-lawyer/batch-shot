export const ACTION_POPUP_URL = 'popup/popup.html';
export const ACTION_MENU_OPEN_POPUP = 'open-popup';
export const ACTION_MENU_OPEN_DETACHED = 'open-detached-popup';
export const ACTION_MENU_ADD_SEARCH_TEMPLATE = 'add-search-template';
export const ACTION_MENU_SET_NEXT_PAGE = 'set-next-page-selector';

const localeMessagesCache = new Map();

async function loadLocaleMessages(chrome, language) {
  if (localeMessagesCache.has(language)) {
    return localeMessagesCache.get(language);
  }

  const response = await fetch(chrome.runtime.getURL(`_locales/${language}/messages.json`));
  const messages = await response.json();
  localeMessagesCache.set(language, messages);
  return messages;
}

async function messageForSettings(chrome, settings, key, fallback) {
  const language = settings.appLanguage;
  if (language !== 'en' && language !== 'zh_CN') {
    return chrome.i18n.getMessage(key) || fallback;
  }

  const messages = await loadLocaleMessages(chrome, language);
  return messages[key]?.message || chrome.i18n.getMessage(key) || fallback;
}

export async function syncActionPopup(chrome, settings) {
  await chrome.action.setPopup({
    popup: settings.iconClickAction === 'popup' ? ACTION_POPUP_URL : ''
  });
}

export async function syncActionContextMenus(chrome, settings) {
  await chrome.contextMenus.removeAll();

  chrome.contextMenus.create({
    id: ACTION_MENU_ADD_SEARCH_TEMPLATE,
    contexts: ['page', 'editable'],
    title: await messageForSettings(
      chrome,
      settings,
      'contextMenuAddSearchTemplate',
      'Add search box to BatchShot template'
    )
  });

  if (settings.iconClickAction !== 'popup') {
    chrome.contextMenus.create({
      id: ACTION_MENU_OPEN_POPUP,
      contexts: ['action'],
      title: await messageForSettings(chrome, settings, 'contextMenuOpenPopup', 'Open popup')
    });
  }

  chrome.contextMenus.create({
    id: ACTION_MENU_OPEN_DETACHED,
    contexts: ['action'],
    title: await messageForSettings(
      chrome,
      settings,
      'contextMenuOpenDetached',
      'Open in independent window'
    )
  });

  chrome.contextMenus.create({
    id: ACTION_MENU_SET_NEXT_PAGE,
    contexts: ['page', 'link'],
    title: await messageForSettings(
      chrome,
      settings,
      'contextMenuSetNextPage',
      'Set as next page for sequential capture'
    )
  });
}

export async function syncActionUi(chrome, settings) {
  await syncActionPopup(chrome, settings);
  await syncActionContextMenus(chrome, settings);
}

function openStandalonePopupWindow(chrome) {
  return chrome.windows.create({
    url: chrome.runtime.getURL(ACTION_POPUP_URL),
    type: 'popup',
    width: 420,
    height: 720,
    focused: true
  });
}

export function openDetachedPopup(chrome) {
  return chrome.windows.create({
    url: chrome.runtime.getURL('popup/popup.html?detached=true'),
    type: 'popup',
    width: 416,
    height: 590,
    focused: true
  });
}

export async function openActionPopupFromMenu(deps) {
  const { chrome, loadSettings, setStatus, statusFromError } = deps;
  if (!chrome.action?.openPopup) {
    await openStandalonePopupWindow(chrome);
    return;
  }

  try {
    await chrome.action.setPopup({ popup: ACTION_POPUP_URL });
    await chrome.action.openPopup();
  } catch (_error) {
    await openStandalonePopupWindow(chrome);
  } finally {
    const settings = await loadSettings().catch(() => null);
    if (settings) {
      await syncActionPopup(chrome, settings).catch((error) => setStatus(statusFromError(error), false));
    }
  }
}

export async function appendSearchTemplateFromContextMenu(tab, deps) {
  const {
    chrome,
    sendTabMessage,
    loadSettings,
    saveSettings,
    statusError,
    DEFAULT_URL_TEMPLATE_DELIMITER
  } = deps;

  if (!tab?.id) {
    [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  }

  if (!tab?.id || !tab.url) {
    throw statusError('noActivePageError');
  }

  const response = await sendTabMessage(tab.id, { action: 'getSearchInputSelector' }, deps);
  if (!response?.ok) {
    throw statusError(response?.statusKey || 'searchInputSelectorError');
  }
  const settings = await loadSettings();
  const pickerResponse = await sendTabMessage(tab.id, {
    action: 'pickSearchTemplateSelectors',
    payload: {
      initialSelectors: [response.selector],
      prompt: await messageForSettings(
        chrome,
        settings,
        'templateSelectorPickerPrompt',
        'Click each form input field you want to fill in, one by one. When done, click the submit/search button to select it and finish. If no button is needed, click "Skip" to use the Enter key instead. Press Esc to cancel.'
      ),
      counterTemplate: await messageForSettings(chrome, settings, 'templateSelectorPickerCounter', '{count} field(s) selected'),
      skip: await messageForSettings(chrome, settings, 'buttonPickerSkip', 'Skip'),
      cancel: await messageForSettings(chrome, settings, 'linkSelectorCancelButton', 'Cancel')
    }
  }, deps);
  if (pickerResponse?.cancelled) {
    return;
  }
  if (!pickerResponse?.ok) {
    throw statusError(pickerResponse?.statusKey || 'searchButtonSelectorError');
  }

  const delimiter = settings.urlTemplateDelimiter || DEFAULT_URL_TEMPLATE_DELIMITER;
  const selectors = Array.isArray(pickerResponse.selectors) && pickerResponse.selectors.length
    ? pickerResponse.selectors
    : [response.selector];
  const lineParts = pickerResponse.buttonSelector
    ? [tab.url, ...selectors, pickerResponse.buttonSelector]
    : [tab.url, ...selectors];
  const line = lineParts.join(delimiter);
  const currentTemplate = String(settings.urlTemplate || '').trimEnd();
  const nextTemplate = currentTemplate ? `${currentTemplate}\n${line}` : line;

  await saveSettings({
    urlTemplate: nextTemplate,
    urlInputMode: 'template'
  });
  await openActionPopupFromMenu(deps);
}

export async function setNextPageSelectorFromContextMenu(tab, deps) {
  const {
    chrome,
    sendTabMessage,
    loadSettings,
    saveSettings,
    statusError,
    setStatus,
    statusFromError
  } = deps;

  if (!tab?.id) {
    [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  }

  if (!tab?.id || !tab.url) {
    throw statusError('noActivePageError');
  }

  try {
    // First ensure content scripts are injected so getContextElementSelector can run.
    // sendTabMessage auto-injects scripts if the tab doesn't have them yet.
    const response = await sendTabMessage(tab.id, { action: 'getContextElementSelector' });
    if (!response?.ok) {
      throw statusError(response?.statusKey || 'nextPageSelectorError');
    }

    await saveSettings({
      urlInputMode: 'sequential',
      sequentialNextSelector: response.selector,
      sequentialPanelExpanded: true
    });

    setStatus({ statusKey: 'nextPageSelectorSavedStatus' }, false, false);
  } catch (error) {
    setStatus(statusFromError(error), false, false);
  }

  await openActionPopupFromMenu(deps);
}

