# AI Command Tab Plan

## Background

BatchShot already supports URL list capture, URL template capture, current tab capture, current window tab capture, scheduled capture, and CSS selector based search capture.

The previous `ai-wip` branch explored AI integration through an external MCP server and a local WebSocket bridge. That approach is useful for external AI clients such as Cursor or Claude Desktop, but it does not cover the new product goal: letting users type natural language instructions directly inside the extension.

This plan proposes a new in-extension AI command experience.

## Goal

Add an `AI` tab inside the extension popup. Users can type instructions such as:

```text
Capture the current page as a full-page PNG.
```

```text
Open these 10 URLs, wait 2 seconds after load, and save full-page screenshots.
```

```text
Use the search box #search on https://example.com, search these keywords, and capture each result page.
```

The extension should send the instruction to the configured AI model, convert the model response into a safe internal command, show the interpreted plan to the user, and run the existing BatchShot capture flow.

## Product Shape

### Popup

Add a top-level AI tab or mode in the popup.

Main contents:

- AI instruction textarea.
- Model selector.
- Run button.
- Parsed action preview.
- Execution status.
- Optional recent prompt history.

The AI tab should not replace the existing manual modes. It should sit beside them:

```text
Capture | Search Box | AI
```

The exact tab naming can follow the current popup structure. The important point is that the AI workflow is visible and independent from the existing URL/template/search controls.

### Options Page

Add an AI settings section in the extension options page.

Required settings:

- Enable AI.
- Model base URL.
- API key.
- Model name.

Recommended additional settings:

- Request timeout.
- Default model.
- Temperature, default `0`.
- Keep prompt history, default disabled or limited.
- Optional external bridge toggle for MCP/WebSocket compatibility.

The API key should be masked in the UI and stored only in `chrome.storage.local`, not synced storage.

## Recommended Architecture

Use the extension background service worker as the AI orchestration layer.

```text
Popup AI tab
  -> chrome.runtime.sendMessage({ action: 'runAiCommand', payload })
  -> background AI client
  -> model API
  -> command validator
  -> existing BatchShot capture functions
  -> status/report back to popup
```

Do not call the model API directly from content scripts or expose the API key to pages.

## Relationship To `ai-wip`

The old `ai-wip` branch contains useful pieces, but it should not be merged wholesale because it was based on an older mainline and focused on external automation.

Useful ideas/files from `ai-wip`:

- `background/ai-bridge.js`
  - Reusable concept: commands should be normalized into a limited action set.
  - Reusable actions: capture active tab, capture window tabs, run capture, get status, stop capture.
  - Not directly reusable as the main path because it assumes a WebSocket server.

- `mcp/`
  - Useful as a future external integration layer.
  - Should remain optional and separate from the in-extension AI tab.

- `docs/mcp.md` and `docs/cli.md`
  - Useful documentation if the external AI mode is revived.

- `utils/settings.js` AI fields
  - `aiEnabled` is still useful.
  - `aiPort` is only relevant to the external WebSocket bridge, not the internal AI tab.

Recommended approach:

1. Start from current `main` / `feature/ai-command-tab`.
2. Reimplement the in-extension AI path cleanly.
3. Copy selected command-dispatch concepts from `background/ai-bridge.js`.
4. Keep MCP/WebSocket bridge as a later optional enhancement.

## Settings Model

Add defaults in `utils/settings.js`:

```js
aiEnabled: false,
aiModelBaseUrl: '',
aiApiKey: '',
aiModelName: '',
aiDefaultModelName: '',
aiTemperature: 0,
aiRequestTimeout: 30000,
aiPromptHistoryEnabled: false,
aiExternalBridgeEnabled: false,
aiBridgePort: 3012
```

Validation rules:

- `aiEnabled` must be boolean.
- `aiModelBaseUrl` must be a valid `http` or `https` URL.
- `aiApiKey` may be empty only when AI is disabled.
- `aiModelName` may be empty only when AI is disabled.
- `aiTemperature` should be clamped from `0` to `1`.
- `aiRequestTimeout` should be clamped to a reasonable range, for example `5000` to `120000`.
- `aiBridgePort` should be clamped from `1024` to `65535`.

## Model API Contract

The first version should target OpenAI-compatible chat completion APIs because the settings requested by the product map naturally to:

- Base URL.
- API key.
- Model name.

Expected request:

```http
POST {aiModelBaseUrl}/chat/completions
Authorization: Bearer {aiApiKey}
Content-Type: application/json
```

The UI should make clear that `aiModelBaseUrl` is the API base URL. The implementation should normalize a trailing slash and avoid double path segments.

Example model settings:

```text
Base URL: https://api.openai.com/v1
Model: gpt-4.1-mini
```

For compatibility with other providers, avoid hard-coding provider names in the core logic.

## Command Schema

The model should not directly execute arbitrary JavaScript. It should return a restricted JSON command.

Recommended schema:

```js
{
  "action": "capture_current_tab" | "capture_window_tabs" | "run_url_batch" | "run_search_batch",
  "options": {
    "captureMode": "fullPage" | "viewport",
    "format": "png" | "jpg" | "pdf",
    "delay": 1,
    "folder": "BatchShot",
    "filenamePattern": "{index}-{host}",
    "reportEnabled": false
  },
  "urls": ["https://example.com"],
  "search": {
    "startUrl": "https://example.com",
    "inputSelector": "#search",
    "submitMode": "enter" | "button",
    "buttonSelector": "",
    "keywords": ["alpha", "beta"],
    "resultDelay": 2
  },
  "summary": "Capture two search result pages."
}
```

Validation should reject:

- Unknown actions.
- Unknown option keys.
- Invalid URLs.
- Invalid capture formats.
- Missing keyword lists.
- Missing search selectors.
- Attempts to execute script, access files, change extension settings, or call arbitrary endpoints.

## Two-Step Execution

The first version should use a confirmation step.

1. User submits prompt.
2. AI returns structured command.
3. Popup shows a concise preview:
   - Action.
   - Number of URLs or keywords.
   - Capture mode.
   - Format.
   - Folder.
4. User clicks `Run`.
5. Extension executes the validated command.

This reduces accidental large batches and makes model mistakes visible before capture starts.

## File-Level Plan

### `popup/popup.html`

- Add AI tab/button.
- Add AI textarea.
- Add model selector.
- Add parsed plan preview region.
- Add run/cancel controls.

### `popup/popup.css`

- Add compact AI panel styles.
- Keep the panel utilitarian and consistent with the existing popup.
- Avoid marketing-style layout; this is an operational tool.

### `popup/dom.js`

- Register AI tab elements.

### `popup/popup.js`

- Initialize AI tab state.
- Restore available model settings.
- Wire prompt submission and execution confirmation.

### `popup/ai-command.js`

New module for:

- Reading AI prompt input.
- Sending `prepareAiCommand`.
- Rendering parsed command preview.
- Sending `executeAiCommand`.
- Handling status updates.

### `options/options.html`

- Add AI settings section:
  - Enable AI.
  - Model base URL.
  - API key.
  - Model name.
  - Optional timeout/temperature.
  - Optional external bridge settings.

### `options/options.js`

- Add AI setting fields to load/save/reset behavior.
- Mask API key visually but preserve saved value unless the user changes it.
- Validate URL and required fields when AI is enabled.

### `background/ai-client.js`

New module for:

- Loading AI settings.
- Building OpenAI-compatible requests.
- Sending prompt to model.
- Parsing JSON response.
- Returning structured errors.

### `background/ai-command-runner.js`

New module for:

- Defining the allowed command schema.
- Validating model output.
- Mapping commands to existing capture functions.
- Producing preview summaries.

### `background/service-worker.js`

- Register new runtime message actions:
  - `prepareAiCommand`
  - `executeAiCommand`
  - `getAiSettingsSummary`
- Reuse existing capture functions instead of duplicating screenshot logic.

### `_locales/en/messages.json`

Add English labels and errors.

### `_locales/zh_CN/messages.json`

Add Chinese labels and errors.

## Runtime Message Design

### Prepare

```js
{
  action: 'prepareAiCommand',
  payload: {
    prompt: 'Capture current tab as PDF',
    modelName: 'gpt-4.1-mini'
  }
}
```

Response:

```js
{
  ok: true,
  commandId: '...',
  command: { ...validatedCommand },
  preview: {
    title: 'Capture current tab',
    details: ['Format: PDF', 'Mode: full page']
  }
}
```

### Execute

```js
{
  action: 'executeAiCommand',
  payload: {
    commandId: '...'
  }
}
```

Response:

```js
{
  ok: true
}
```

Execution progress should reuse the existing batch status message channel where possible.

## Prompting Strategy

The system prompt should be short and strict:

- The model controls BatchShot only through JSON.
- It must choose one supported action.
- It must not invent selectors or URLs unless provided by the user.
- It must preserve explicit user settings.
- It must ask for missing required fields by returning a `needs_input` response.

Recommended response shapes:

```js
{
  "type": "command",
  "command": { ... }
}
```

```js
{
  "type": "needs_input",
  "question": "Which URL should I open?"
}
```

The popup can display `needs_input` as an assistant response without starting capture.

## Security And Privacy

- Never expose the API key to content scripts or page scripts.
- Store the API key in `chrome.storage.local`.
- Do not sync API keys through browser sync.
- Do not send page contents by default.
- The first version should send only the user's prompt and a compact capability description.
- If future versions include page context, require an explicit opt-in.
- Validate all model-generated commands before execution.
- Do not allow model-generated arbitrary JavaScript.
- Do not allow model-generated extension setting changes.
- Limit batch size if needed to prevent accidental large jobs.

## Error Handling

Recommended error keys:

```text
aiDisabledError
aiModelBaseUrlError
aiApiKeyMissingError
aiModelNameMissingError
aiRequestFailedError
aiResponseParseError
aiUnsupportedCommandError
aiCommandValidationError
aiCommandExpiredError
aiNeedsInputStatus
```

The popup should distinguish:

- Model/configuration failures.
- Validation failures.
- Capture execution failures.

## MVP Scope

First implementation should include:

- AI enable toggle in options.
- Base URL, API key, model name settings.
- AI tab in popup.
- Instruction input.
- Model selector from configured model names.
- OpenAI-compatible chat completion request.
- JSON command parsing and validation.
- Confirmation preview.
- Execution for:
  - current tab capture
  - current window tabs capture
  - URL batch capture
  - CSS selector search batch capture

Out of scope for MVP:

- Streaming responses.
- Multi-turn planning memory.
- Sending page DOM or screenshots to the model.
- Automatic CSS selector discovery.
- External MCP server merge.
- Tool-calling protocol beyond a single validated JSON command.

## Future Enhancements

- Multiple saved model profiles.
- Prompt history.
- Streaming assistant messages.
- Optional page context sharing.
- Optional screenshot understanding flow.
- AI-assisted CSS selector picker.
- AI-assisted URL/template generation.
- External MCP/WebSocket bridge revived as advanced mode.
- Local-only model support through OpenAI-compatible endpoints.
- Per-command cost/usage display if providers return token usage.

## Implementation Order

1. Add settings defaults and options UI.
2. Add popup AI tab shell.
3. Add background AI client.
4. Add command schema validator.
5. Add `prepareAiCommand` message flow.
6. Add preview and confirmation UI.
7. Add `executeAiCommand` flow using existing capture functions.
8. Add i18n messages.
9. Add tests for settings migration, command validation, and prompt response parsing.
10. Manually test URL batch, current tab, and CSS selector search commands.

## Recommended Branch Strategy

This work should continue on:

```text
feature/ai-command-tab
```

Do not merge `ai-wip` directly. Use it as a reference and selectively port the command dispatch concepts after the new internal AI flow is in place.
