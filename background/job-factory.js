import { normalizeUrl } from '../utils/helpers.js';

export function createUrlJobs(urls, options) {
  return urls.map((rawUrl, index) => ({
    kind: 'url',
    url: normalizeUrl(rawUrl),
    urlContext: options.urlContexts?.[index] || {},
    closeAfterCapture: Boolean(options.closeBatchTabsAfterCapture)
  }));
}

export function normalizeSearchJob(job, options, deps) {
  const { statusError } = deps;
  const inputSelector = String(job.search?.inputSelector || '').trim();
  const submitMode = job.search?.submitMode === 'button' ? 'button' : 'enter';
  const buttonSelector = String(job.search?.buttonSelector || '').trim();

  if (!inputSelector) {
    throw statusError('searchInputSelectorError');
  }

  if (submitMode === 'button' && !buttonSelector) {
    throw statusError('searchButtonSelectorError');
  }

  return {
    kind: 'search',
    url: normalizeUrl(job.url),
    urlContext: job.urlContext || {},
    search: {
      keyword: String(job.search?.keyword ?? job.urlContext?.keyword ?? ''),
      inputSelector,
      submitMode,
      buttonSelector
    },
    closeAfterCapture: Boolean(options.closeBatchTabsAfterCapture),
    applyDelay: false,
    waitForLoad: false,
    searchResultDelay: options.searchResultDelay ?? options.delay
  };
}

export function createExplicitJobs(options, deps) {
  return options.jobs.map((job, index) => {
    if (job.kind === 'search') {
      return normalizeSearchJob(job, options, deps);
    }

    return {
      kind: 'url',
      url: normalizeUrl(job.url),
      urlContext: job.urlContext || options.urlContexts?.[index] || {},
      closeAfterCapture: Boolean(options.closeBatchTabsAfterCapture)
    };
  });
}

export function createSearchJobs(options, deps) {
  const { statusError } = deps;
  const keywords = Array.isArray(options.searchKeywordsList)
    ? options.searchKeywordsList
    : String(options.searchKeywords || '')
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);
  let startUrl = '';
  const inputSelector = String(options.searchInputSelector || '').trim();
  const submitMode = options.searchSubmitMode === 'button' ? 'button' : 'enter';
  const buttonSelector = String(options.searchButtonSelector || '').trim();

  try {
    startUrl = normalizeUrl(options.searchStartUrl || '');
  } catch (_error) {
    throw statusError('searchStartUrlError');
  }

  if (!keywords.length) {
    throw statusError('searchKeywordsEmptyError');
  }

  if (!inputSelector) {
    throw statusError('searchInputSelectorError');
  }

  if (submitMode === 'button' && !buttonSelector) {
    throw statusError('searchButtonSelectorError');
  }

  return keywords.map((keyword) => ({
    kind: 'search',
    url: startUrl,
    urlContext: { keyword },
    search: {
      keyword,
      inputSelector,
      submitMode,
      buttonSelector
    },
    closeAfterCapture: Boolean(options.closeBatchTabsAfterCapture),
    applyDelay: false,
    waitForLoad: false
  }));
}

export function createTabJobs(tabs, options = {}) {
  return tabs.map((tab, index) => ({
    kind: 'tab',
    tab,
    url: tab.url,
    title: tab.title || '',
    urlContext: options.urlContexts?.[index] || {},
    closeAfterCapture: Boolean(options.closeAfterCapture)
  }));
}
