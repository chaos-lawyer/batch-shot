import { normalizeUrl } from '../utils/helpers.js';

export function parseSearchKeywords(value) {
  return value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

export function buildSearchBatchOptions(settings) {
  const searchStartUrl = String(settings.searchStartUrl || '').trim();
  const searchInputSelector = String(settings.searchInputSelector || '').trim();
  const searchSubmitMode = settings.searchSubmitMode === 'button' ? 'button' : 'enter';
  const searchButtonSelector = String(settings.searchButtonSelector || '').trim();
  const keywords = parseSearchKeywords(String(settings.searchKeywords || ''));

  if (!searchStartUrl) {
    return { options: null, errorKey: 'searchStartUrlError' };
  }

  try {
    normalizeUrl(searchStartUrl);
  } catch (_error) {
    return { options: null, errorKey: 'searchStartUrlError' };
  }

  if (!searchInputSelector) {
    return { options: null, errorKey: 'searchInputSelectorError' };
  }

  if (searchSubmitMode === 'button' && !searchButtonSelector) {
    return { options: null, errorKey: 'searchButtonSelectorError' };
  }

  if (!keywords.length) {
    return { options: null, errorKey: 'searchKeywordsEmptyError' };
  }

  return {
    options: {
      ...settings,
      searchStartUrl,
      searchInputSelector,
      searchSubmitMode,
      searchButtonSelector,
      searchKeywords: keywords.join('\n'),
      searchKeywordsList: keywords,
      urlContexts: keywords.map((keyword) => ({ keyword }))
    },
    errorKey: ''
  };
}

export function buildUrlBatchOptions(settings, mode, parseUrls, buildTemplateUrls) {
  const templateResult = mode === 'template' ? buildTemplateUrls() : null;
  const urls = templateResult ? templateResult.urls : parseUrls(settings.urls);
  const urlContexts = templateResult ? templateResult.urlContexts : [];
  const searchJobs = templateResult?.searchJobs || [];

  if (!urls.length && !searchJobs.length) {
    return {
      options: null,
      errorKey: templateResult?.errorKey || 'emptyUrlError',
      errorArgs: templateResult?.errorArgs
    };
  }

  if (templateResult?.errorKey) {
    return {
      options: null,
      errorKey: templateResult.errorKey,
      errorArgs: templateResult.errorArgs
    };
  }

  const urlJobs = urls.map((url, index) => ({
    kind: 'url',
    url,
    urlContext: urlContexts[index] || {}
  }));
  const jobs = [...urlJobs, ...searchJobs];

  if (searchJobs.length) {
    const invalidSearchJob = searchJobs.find((job) => {
      try {
        normalizeUrl(job.url);
        return !job.search?.inputSelector;
      } catch (_error) {
        return true;
      }
    });

    if (invalidSearchJob) {
      return { options: null, errorKey: 'urlTemplateSearchFormatError' };
    }
  }

  return {
    options: { ...settings, urls, urlContexts: jobs.map((job) => job.urlContext || {}), jobs },
    errorKey: ''
  };
}

export function buildBatchOptions(settings, mode, parseUrls, buildTemplateUrls) {
  if (mode === 'searchBox') {
    return buildSearchBatchOptions(settings);
  }

  return buildUrlBatchOptions(settings, mode, parseUrls, buildTemplateUrls);
}
