import { message } from '../utils/i18n.js';
import { el } from './dom-helpers.js';

export function extractPageLinks() {
  const containerSelectors = ['main', 'article', '[role="main"]'];
  const containers = containerSelectors
    .flatMap((selector) => Array.from(document.querySelectorAll(selector)))
    .filter((node) => node instanceof HTMLElement);
  const scope = containers.length ? containers : [document.body].filter(Boolean);
  const ignoredRegionSelector = 'header, nav, footer, aside, script, style, noscript, template';
  const currentUrl = new URL(location.href);
  currentUrl.hash = '';
  const seen = new Set();

  return scope
    .flatMap((node) => Array.from(node.querySelectorAll('a[href]')))
    .filter((anchor) => !anchor.closest(ignoredRegionSelector))
    .filter((anchor) => {
      const rects = anchor.getClientRects();
      return rects.length > 0 && getComputedStyle(anchor).visibility !== 'hidden';
    })
    .map((anchor) => {
      const rawHref = anchor.getAttribute('href')?.trim() || '';
      if (!rawHref || rawHref.startsWith('#')) {
        return null;
      }

      try {
        const url = new URL(rawHref, document.baseURI);
        if (!['http:', 'https:'].includes(url.protocol)) {
          return null;
        }
        url.hash = '';
        return {
          url: url.href,
          host: url.hostname.replace(/^www\./, ''),
          title: (anchor.textContent || '').replace(/\s+/g, ' ').trim()
        };
      } catch {
        return null;
      }
    })
    .filter((item) => item && item.url !== currentUrl.href)
    .filter((item) => {
      if (seen.has(item.url)) {
        return false;
      }
      seen.add(item.url);
      return true;
    });
}

export function createLinkSelector({
  elements,
  addHistoryEntry,
  closeHistoryMenus,
  saveSettings,
  setUrlInputMode,
  updateUrlCount,
  setStatus
}) {
  let extractedLinkItems = [];

  function hasSelectedLinks() {
    return extractedLinkItems.some((item) => item.selected);
  }

  function getFilteredLinkItems() {
    const query = elements.linkSelectorSearch.value.trim().toLowerCase();
    if (!query) {
      return extractedLinkItems;
    }

    return extractedLinkItems.filter((item) => (
      item.url.toLowerCase().includes(query)
      || item.title.toLowerCase().includes(query)
      || item.host.toLowerCase().includes(query)
    ));
  }

  function updateLinkSelectorSummary() {
    const selectedCount = extractedLinkItems.filter((item) => item.selected).length;
    elements.linkSelectorSummary.textContent = message(
      'linkSelectorSummary',
      [String(selectedCount), String(extractedLinkItems.length)]
    );
    elements.linkSelectorApplyButton.disabled = selectedCount === 0;
  }

  function renderLinkSelector() {
    const items = getFilteredLinkItems();
    elements.linkSelectorList.replaceChildren();

    if (!items.length) {
      elements.linkSelectorList.append(el('p', {
        className: 'link-selector-empty',
        textContent: message('linkSelectorEmpty')
      }));
      updateLinkSelectorSummary();
      return;
    }

    elements.linkSelectorList.append(...items.map(createLinkRow));
    updateLinkSelectorSummary();
  }

  function createLinkRow(item) {
    const checkbox = el('input', {
      type: 'checkbox',
      checked: item.selected
    });
    checkbox.addEventListener('change', () => {
      item.selected = checkbox.checked;
      updateLinkSelectorSummary();
    });

    return el('label', { className: 'link-selector-row' }, [
      checkbox,
      el('span', {}, [
        el('span', { className: 'link-selector-title', textContent: item.title || item.url }),
        el('span', { className: 'link-selector-host', textContent: item.host }),
        el('span', { className: 'link-selector-url', textContent: item.url })
      ])
    ]);
  }

  function showLinkSelector(items) {
    closeHistoryMenus();
    extractedLinkItems = items.map((item) => ({ ...item, selected: true }));
    elements.linkSelectorSearch.value = '';
    renderLinkSelector();
    elements.linkSelectorPanel.hidden = false;
    elements.linkSelectorSearch.focus();
  }

  function closeLinkSelector() {
    elements.linkSelectorPanel.hidden = true;
  }

  function setFilteredLinkSelection(getNextSelected) {
    getFilteredLinkItems().forEach((item) => {
      item.selected = getNextSelected(item);
    });
    renderLinkSelector();
  }

  async function applySelectedLinks() {
    const urls = extractedLinkItems
      .filter((item) => item.selected)
      .map((item) => item.url);

    if (!urls.length) {
      setStatus(message('linkSelectorNoSelectionStatus'));
      return;
    }

    if (elements.urlList.value.trim()) {
      await addHistoryEntry('urls', elements.urlList.value);
    }

    elements.urlList.value = urls.join('\n');
    updateUrlCount();
    setUrlInputMode('list', false);
    await saveSettings();
    closeLinkSelector();
    setStatus(message('linkSelectorAppliedStatus', String(urls.length)));
  }

  async function extractLinksFromCurrentPage() {
    setStatus(message('extractingLinksStatus'));
    elements.extractLinksButton.disabled = true;

    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab?.id || !/^https?:\/\//.test(tab.url || '')) {
        setStatus(message('extractLinksUnsupportedPageStatus'));
        return;
      }

      const [result] = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: extractPageLinks
      });
      const links = Array.isArray(result?.result) ? result.result : [];

      if (!links.length) {
        setStatus(message('noLinksExtractedStatus'));
        return;
      }

      showLinkSelector(links);
      setStatus(message('extractedLinksStatus', String(links.length)));
    } catch (error) {
      setStatus(error.message || message('extractLinksErrorStatus'));
    } finally {
      elements.extractLinksButton.disabled = false;
    }
  }

  function bindLinkSelectorEvents() {
    elements.extractLinksButton.addEventListener('click', extractLinksFromCurrentPage);
    elements.linkSelectorSearch.addEventListener('input', renderLinkSelector);
    elements.linkSelectorAllButton.addEventListener('click', () => setFilteredLinkSelection(() => true));
    elements.linkSelectorNoneButton.addEventListener('click', () => setFilteredLinkSelection(() => false));
    elements.linkSelectorInvertButton.addEventListener('click', () => setFilteredLinkSelection((item) => !item.selected));
    elements.linkSelectorApplyButton.addEventListener('click', applySelectedLinks);
    elements.linkSelectorCancelButton.addEventListener('click', closeLinkSelector);
    elements.linkSelectorCloseButton.addEventListener('click', closeLinkSelector);
  }

  return {
    hasSelectedLinks,
    closeLinkSelector,
    bindLinkSelectorEvents
  };
}
