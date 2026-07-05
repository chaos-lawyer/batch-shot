# CSS Selector Search Mode Plan

## Background

BatchShot currently supports batch capture from a URL list or URL template. This works well when a website exposes search results through URLs, for example by placing the keyword in a query parameter.

Some websites do not support reliable URL-based search. Users must open the site, type a keyword into a search box, submit the form, wait for results, and then capture the page. This document proposes a new batch mode for that workflow.

## Goal

Add a new batch input mode:

```text
List | Template | Search Box
```

The `Search Box` mode should let users provide:

- A start page URL.
- A CSS selector for the search input.
- A list of keywords.
- A submit method.
- Optional selector for the submit button.
- A wait delay before capture.

For each keyword, the extension should open the start page, fill the search input, submit the search, wait for results, then reuse the existing screenshot and download flow.

## MVP Scope

The first version should support:

- Normal page `<input>` and `<textarea>` elements.
- Manual CSS selector entry for the search input.
- Submit by pressing Enter.
- Submit by clicking a button selector.
- Opening the start URL once per keyword.
- Existing capture modes: full page and viewport.
- Existing filename, metadata, and report placeholders, especially `{keyword}`.
- Existing close-after-capture behavior.

The first version should not attempt to support:

- Search boxes inside cross-origin iframes.
- Shadow DOM traversal.
- CAPTCHA or anti-automation bypass.
- Multi-step search workflows.
- Automatic detection of complex SPA result completion.
- Multiple form fields or filters.

## User Flow

1. User selects `Search Box` mode in the popup.
2. User enters the target site's start/search page URL.
3. User enters the search input CSS selector.
4. User chooses submit mode:
   - `Enter`
   - `Button click`
5. If using button click, user enters the button CSS selector.
6. User enters one keyword per line.
7. User starts the batch.
8. BatchShot opens the start page for each keyword, performs the search, waits, captures, downloads, and records the report row.

## Proposed Data Model

Add settings fields in `utils/settings.js`:

```js
searchStartUrl: '',
searchInputSelector: '',
searchSubmitMode: 'enter',
searchButtonSelector: '',
searchKeywords: '',
searchResultDelay: 2
```

`searchSubmitMode` should initially support:

```text
enter
button
```

Parsed jobs can be represented as:

```js
{
  kind: 'search',
  url: normalizeUrl(options.searchStartUrl),
  urlContext: { keyword },
  search: {
    keyword,
    inputSelector: options.searchInputSelector,
    submitMode: options.searchSubmitMode,
    buttonSelector: options.searchButtonSelector
  },
  closeAfterCapture: Boolean(options.closeBatchTabsAfterCapture)
}
```

## Implementation Areas

### `utils/settings.js`

- Add defaults for Search Box mode.
- Ensure migration preserves valid submit modes.
- Keep backward compatibility with existing saved settings.

### `popup/popup.html`

- Add a third segmented tab: `Search Box`.
- Add a search configuration panel with:
  - Start URL input.
  - Search input selector input.
  - Keyword textarea.
  - Submit mode select.
  - Button selector input shown only for button mode.
  - Keyword count badge.

### `popup/url-input.js`

- Extend `urlInputMode` to allow `searchBox`.
- Add restore/save handling for Search Box fields.
- Add keyword parsing and keyword count updates.
- Hide URL-only actions when Search Box mode is active.
- Keep existing List and Template behavior unchanged.

### `popup/capture-actions.js`

- Build payload based on active mode.
- For `list` and `template`, keep the existing `urls` flow.
- For `searchBox`, validate required fields and send search config/keywords to the background service worker.

### `content/page-capture.js`

Add a new message action:

```text
performSearch
```

The content script should:

1. Find the input with `document.querySelector(inputSelector)`.
2. Focus the element.
3. Clear its current value.
4. Set the keyword.
5. Dispatch `input` and `change` events.
6. Submit by Enter or button click.
7. Return a structured success/failure response.

Recommended event behavior:

```js
input.focus();
input.value = keyword;
input.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: keyword }));
input.dispatchEvent(new Event('change', { bubbles: true }));
```

For Enter mode:

```js
input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', bubbles: true }));
input.dispatchEvent(new KeyboardEvent('keyup', { key: 'Enter', code: 'Enter', bubbles: true }));
```

For button mode:

```js
document.querySelector(buttonSelector)?.click();
```

### `background/service-worker.js`

- Add `createSearchJobs(options)`.
- Extend `prepareCaptureJob(job)` to handle `kind: 'search'`.
- Open the start URL, wait for load, call `performSearch`, wait for results, then capture.
- Continue using `captureTabToDownload()` for actual screenshot behavior.

Suggested flow:

```js
if (job.kind === 'search') {
  const tab = await chrome.tabs.create({ url: job.url, active: true });
  await waitForTabComplete(tab.id);

  const response = await sendTabMessage(tab.id, {
    action: 'performSearch',
    payload: job.search
  });

  if (!response?.ok) {
    throw statusError(response?.statusKey || 'searchSubmitError');
  }

  return { ...job, tab };
}
```

The search job should use `searchResultDelay` after submission. In the MVP, this delay can reuse the existing capture delay or be a separate setting if the UI exposes it.

### `_locales/en/messages.json` and `_locales/zh_CN/messages.json`

Add labels and errors for:

- Search Box mode.
- Start URL.
- Search input selector.
- Keywords.
- Submit mode.
- Enter submit.
- Button submit.
- Button selector.
- Empty keyword list.
- Invalid start URL.
- Empty input selector.
- Search input not found.
- Search button not found.
- Search submit failed.

## Error Handling

Recommended error keys:

```text
searchStartUrlError
searchKeywordsEmptyError
searchInputSelectorError
searchInputNotFoundError
searchButtonSelectorError
searchButtonNotFoundError
searchSubmitError
searchPageLoadTimeoutError
```

Each failed keyword should produce an error report row instead of aborting the entire batch, unless the user stops the batch.

## Testing Plan

Add or update tests for:

- Search Box keyword parsing.
- Search Box payload construction.
- Search job creation.
- `performSearch` input validation.
- Error mapping for missing input/button selectors.

Manual test cases:

1. A site where pressing Enter submits search.
2. A site where clicking a search button submits search.
3. Missing input selector.
4. Missing button selector in button mode.
5. Slow result page with capture delay.

## Future Enhancements

After the MVP works, consider:

- Visual selector picker from the current page.
- Auto-generated stable selectors.
- Result-ready selector waiting.
- Saved site profiles.
- Form submit mode.
- Clear button selector.
- Multiple fields or pre-search filters.
- Same-tab keyword iteration for sites that handle repeated searches reliably.
