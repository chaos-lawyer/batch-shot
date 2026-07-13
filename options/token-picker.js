import { message } from '../utils/i18n.js';

const FILENAME_TOKENS = [
  {
    key: 'datetime',
    enValue: '{datetime}',
    zhValue: '{日期时间}',
    enDescription: 'Full date and time (customizable)',
    zhDescription: '完整日期时间（可自定义格式）'
  },
  {
    key: 'index',
    enValue: '{index}',
    zhValue: '{序号}',
    enDescription: 'Task sequence number (e.g. 001)',
    zhDescription: '任务序号，例如 001'
  },
  {
    key: 'total',
    enValue: '{total}',
    zhValue: '{总数}',
    enDescription: 'Total number of tasks',
    zhDescription: '任务总数'
  },
  {
    key: 'host',
    enValue: '{host}',
    zhValue: '{域名}',
    enDescription: 'Page domain (e.g. google.com)',
    zhDescription: '网页域名，例如 google.com'
  },
  {
    key: 'folder',
    enValue: '{folder}',
    zhValue: '{文件夹}',
    enDescription: 'Save folder path',
    zhDescription: '保存文件夹'
  },
  {
    key: 'title',
    enValue: '{title}',
    zhValue: '{标题}',
    enDescription: 'Page title',
    zhDescription: '页面标题'
  },
  {
    key: 'keyword',
    enValue: '{keyword}',
    zhValue: '{关键词}',
    enDescription: 'Search keyword or template term',
    zhDescription: '模板替换词或搜索关键词'
  },
  {
    key: 'url',
    enValue: '{url}',
    zhValue: '{网址}',
    enDescription: 'Full page URL',
    zhDescription: '页面 URL'
  }
];

const FOLDER_TOKENS = [
  {
    key: 'BatchShot',
    enValue: 'BatchShot',
    zhValue: 'BatchShot',
    enDescription: 'Default download folder name',
    zhDescription: '默认下载文件夹名称'
  },
  {
    key: '/',
    enValue: '/',
    zhValue: '/',
    enDescription: 'Folder path separator',
    zhDescription: '文件夹路径分隔符'
  },
  ...FILENAME_TOKENS
];

const METADATA_TOKENS = [
  {
    key: 'capturedAt',
    enValue: '{capturedAt}',
    zhValue: '{截图时间}',
    enDescription: 'Capture timestamp',
    zhDescription: '截图时间'
  },
  {
    key: 'url',
    enValue: '{url}',
    zhValue: '{网址}',
    enDescription: 'Page URL',
    zhDescription: '页面 URL'
  },
  {
    key: 'title',
    enValue: '{title}',
    zhValue: '{标题}',
    enDescription: 'Page title',
    zhDescription: '页面标题'
  },
  {
    key: 'host',
    enValue: '{host}',
    zhValue: '{域名}',
    enDescription: 'Page domain',
    zhDescription: '网页域名'
  },
  {
    key: 'index',
    enValue: '{index}',
    zhValue: '{序号}',
    enDescription: 'Task sequence number',
    zhDescription: '任务序号'
  },
  {
    key: 'total',
    enValue: '{total}',
    zhValue: '{总数}',
    enDescription: 'Total number of tasks',
    zhDescription: '任务总数'
  },
  {
    key: 'keyword',
    enValue: '{keyword}',
    zhValue: '{关键词}',
    enDescription: 'Search keyword',
    zhDescription: '搜索关键词'
  }
];

const REPORT_TOKENS = [
  {
    key: 'index',
    enValue: '{index}',
    zhValue: '{序号}',
    enDescription: 'Task sequence number',
    zhDescription: '任务序号'
  },
  {
    key: 'url',
    enValue: '{url}',
    zhValue: '{网址}',
    enDescription: 'Page URL',
    zhDescription: '页面 URL'
  },
  {
    key: 'title',
    enValue: '{title}',
    zhValue: '{页面标题}',
    enDescription: 'Page title',
    zhDescription: '页面标题'
  },
  {
    key: 'status',
    enValue: '{status}',
    zhValue: '{状态}',
    enDescription: 'Capture status',
    zhDescription: '截图状态'
  },
  {
    key: 'filename',
    enValue: '{filename}',
    zhValue: '{文件名}',
    enDescription: 'Saved filename',
    zhDescription: '文件名'
  },
  {
    key: 'error',
    enValue: '{error}',
    zhValue: '{错误}',
    enDescription: 'Error message if capture failed',
    zhDescription: '错误信息/失败原因'
  }
];

const DATETIME_TOKENS = [
  {
    key: 'YYYY',
    enValue: 'YYYY',
    zhValue: 'YYYY',
    enDescription: '4-digit year (e.g. 2026)',
    zhDescription: '四位年份（如 2026）'
  },
  {
    key: 'MM',
    enValue: 'MM',
    zhValue: 'MM',
    enDescription: '2-digit month (01-12)',
    zhDescription: '两位月份（01-12）'
  },
  {
    key: 'DD',
    enValue: 'DD',
    zhValue: 'DD',
    enDescription: '2-digit day of month (01-31)',
    zhDescription: '两位日期（01-31）'
  },
  {
    key: 'HH',
    enValue: 'HH',
    zhValue: 'HH',
    enDescription: '2-digit hour in 24h format (00-23)',
    zhDescription: '两位24小时制小时（00-23）'
  },
  {
    key: 'mm',
    enValue: 'mm',
    zhValue: 'mm',
    enDescription: '2-digit minute (00-59)',
    zhDescription: '两位分钟（00-59）'
  },
  {
    key: 'ss',
    enValue: 'ss',
    zhValue: 'ss',
    enDescription: '2-digit second (00-59)',
    zhDescription: '两位秒数（00-59）'
  }
];

const WEBHOOK_BODY_TOKENS = [
  { key: 'runId', enValue: '{runId}', zhValue: '{运行ID}', enDescription: 'Unique identifier for the run', zhDescription: '当前任务运行的唯一标识符 ID' },
  { key: 'taskName', enValue: '{taskName}', zhValue: '{任务名称}', enDescription: 'Name of the task', zhDescription: '任务名称' },
  { key: 'status', enValue: '{status}', zhValue: '{任务状态}', enDescription: 'Run status (success/failed/cancelled)', zhDescription: '任务状态 (success/failed/cancelled)' },
  { key: 'startedAt', enValue: '{startedAt}', zhValue: '{开始时间}', enDescription: 'Start time (ISO format)', zhDescription: '任务开始时间 (ISO 格式)' },
  { key: 'finishedAt', enValue: '{finishedAt}', zhValue: '{结束时间}', enDescription: 'Finish time (ISO format)', zhDescription: '任务结束时间 (ISO 格式)' },
  { key: 'durationMs', enValue: '{durationMs}', zhValue: '{耗时}', enDescription: 'Execution duration in milliseconds', zhDescription: '执行耗时 (毫秒)' },
  { key: 'total', enValue: '{total}', zhValue: '{总数}', enDescription: 'Total number of items', zhDescription: '总截图数' },
  { key: 'success', enValue: '{success}', zhValue: '{成功数}', enDescription: 'Successful captures count', zhDescription: '成功截图数' },
  { key: 'failed', enValue: '{failed}', zhValue: '{失败数}', enDescription: 'Failed captures count', zhDescription: '失败截图数' },
  { key: 'cancelled', enValue: '{cancelled}', zhValue: '{已取消}', enDescription: 'Whether the task was cancelled (true/false)', zhDescription: '任务是否被用户中止 (true/false)' },
  { key: 'folder', enValue: '{folder}', zhValue: '{文件夹}', enDescription: 'Save folder path', zhDescription: '保存的文件夹路径' },
  { key: 'reportFilename', enValue: '{reportFilename}', zhValue: '{报告文件名}', enDescription: 'Exported report path', zhDescription: '导出的 CSV/XLSX 报告路径' },
  { key: 'unfinishedTasksCount', enValue: '{unfinishedTasksCount}', zhValue: '{未完成任务数}', enDescription: 'Number of unfinished scheduled tasks', zhDescription: '未完成的计划任务数' },
  { key: 'items', enValue: '{items}', zhValue: '{详情列表}', enDescription: 'Array of detailed capture results', zhDescription: '包含所有单页截图详情的 JSON 数组' }
];

const TEXT_TEMPLATE_TOKENS = [
  { key: 'text', enValue: '{text}', zhValue: '{正文}', enDescription: 'Extracted plain text of the page', zhDescription: '提取的网页正文纯文本' },
  { key: 'url', enValue: '{url}', zhValue: '{网址}', enDescription: 'Page URL', zhDescription: '网页完整 URL 地址' },
  { key: 'title', enValue: '{title}', zhValue: '{标题}', enDescription: 'Page Title', zhDescription: '网页标题' },
  { key: 'keyword', enValue: '{keyword}', zhValue: '{关键词}', enDescription: 'Task keyword / template substitution', zhDescription: '任务关联关键词' },
  { key: 'capturedAt', enValue: '{capturedAt}', zhValue: '{截图时间}', enDescription: 'Captured timestamp (ISO format)', zhDescription: '截图与提取时间戳' },
  { key: 'metaDescription', enValue: '{metaDescription}', zhValue: '{描述}', enDescription: 'Page meta description tag', zhDescription: '网页 Meta Description 描述' },
  { key: 'lang', enValue: '{lang}', zhValue: '{语言}', enDescription: 'Page language setting', zhDescription: '网页声明的语言代码' }
];

const PICKER_CONFIGS = [
  {
    inputId: 'filenamePattern',
    mode: 'inline',
    isDatetime: false,
    tokens: FILENAME_TOKENS
  },
  {
    inputId: 'filenameDateTimeFormat',
    mode: 'inline',
    isDatetime: true,
    tokens: DATETIME_TOKENS
  },
  {
    inputId: 'metadataFields',
    mode: 'csv',
    isDatetime: false,
    tokens: METADATA_TOKENS
  },
  {
    inputId: 'metadataDateTimeFormat',
    mode: 'inline',
    isDatetime: true,
    tokens: DATETIME_TOKENS
  },
  {
    inputId: 'reportFields',
    mode: 'csv',
    isDatetime: false,
    tokens: REPORT_TOKENS
  },
  {
    inputId: 'folder',
    mode: 'inline',
    isDatetime: false,
    position: 'top',
    tokens: FOLDER_TOKENS
  },
  {
    inputId: 'webhookBodyTemplate',
    mode: 'inline',
    isDatetime: false,
    multiline: true,
    tokens: WEBHOOK_BODY_TOKENS
  },
  {
    inputId: 'saveTextTemplate',
    mode: 'inline',
    isDatetime: false,
    multiline: true,
    tokens: TEXT_TEMPLATE_TOKENS
  }
];

// Active pickers registry for re-rendering translations
const activePickers = [];

function escapeRegExp(string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function getTokensRegex(config) {
  const tokenStrings = [];
  config.tokens.forEach((t) => {
    tokenStrings.push(t.enValue);
    if (t.zhValue && t.zhValue !== t.enValue) {
      tokenStrings.push(t.zhValue);
    }
  });
  // Sort by descending length so longer matching strings take precedence
  tokenStrings.sort((a, b) => b.length - a.length);
  const patterns = tokenStrings.map(escapeRegExp);
  return new RegExp(`(${patterns.join('|')})`, 'g');
}

function getLanguage() {
  const docLang = (document.documentElement.lang || '').toLowerCase();
  if (docLang.startsWith('zh')) return 'zh_CN';
  if (docLang.startsWith('en')) return 'en';

  const select = document.getElementById('appLanguage');
  const val = select ? select.value : 'auto';
  if (val === 'zh_CN') return 'zh_CN';
  if (val === 'en') return 'en';

  const uiLang = (globalThis.chrome?.i18n?.getUILanguage?.() || '').toLowerCase();
  return uiLang.startsWith('zh') ? 'zh_CN' : 'en';
}

// Helpers for caret offset and range selection in contenteditable
function getSelectionOffsets(el) {
  const sel = window.getSelection();
  if (!sel.rangeCount) return { start: 0, end: 0 };
  const range = sel.getRangeAt(0);

  function getOffset(node, offset) {
    const tempRange = document.createRange();
    tempRange.selectNodeContents(el);
    tempRange.setEnd(node, offset);

    let length = 0;
    const fragment = tempRange.cloneContents();
    function traverse(n) {
      if (n.nodeType === Node.TEXT_NODE) {
        length += n.textContent.length;
      } else if (n.nodeType === Node.ELEMENT_NODE) {
        if (n.classList.contains('input-token-capsule')) {
          length += n.textContent.length;
        } else {
          n.childNodes.forEach(traverse);
        }
      }
    }
    fragment.childNodes.forEach(traverse);
    return length;
  }

  if (!el.contains(range.startContainer) || !el.contains(range.endContainer)) {
    const len = el.textContent.length;
    return { start: len, end: len };
  }

  const start = getOffset(range.startContainer, range.startOffset);
  const end = getOffset(range.endContainer, range.endOffset);
  return { start, end };
}

function setCaretPosition(el, offset) {
  const range = document.createRange();
  const sel = window.getSelection();
  let currentOffset = 0;
  let found = false;

  function traverse(node) {
    if (found) return;
    if (node.nodeType === Node.TEXT_NODE) {
      const len = node.textContent.length;
      if (currentOffset + len >= offset) {
        range.setStart(node, offset - currentOffset);
        range.collapse(true);
        found = true;
      } else {
        currentOffset += len;
      }
    } else if (node.nodeType === Node.ELEMENT_NODE) {
      if (node.classList.contains('input-token-capsule')) {
        const len = node.textContent.length;
        if (currentOffset + len >= offset) {
          range.setStartAfter(node);
          range.collapse(true);
          found = true;
        } else {
          currentOffset += len;
        }
      } else {
        for (let i = 0; i < node.childNodes.length; i++) {
          traverse(node.childNodes[i]);
          if (found) break;
        }
      }
    }
  }

  traverse(el);
  if (found) {
    sel.removeAllRanges();
    sel.addRange(range);
  } else {
    // Fallback: put cursor at very end of elements
    range.selectNodeContents(el);
    range.collapse(false);
    sel.removeAllRanges();
    sel.addRange(range);
  }
}

// Convert input text string into HTML content with capsule elements
function syncInputToHtml(input, editableDiv, config) {
  // Sync placeholder dynamically
  const placeholderKey = input.getAttribute('data-i18n-placeholder');
  if (placeholderKey) {
    editableDiv.setAttribute('data-placeholder', message(placeholderKey));
  } else if (input.placeholder) {
    editableDiv.setAttribute('data-placeholder', input.placeholder);
  } else {
    editableDiv.removeAttribute('data-placeholder');
  }

  const val = input.value;
  const regex = getTokensRegex(config);
  const parts = val.split(regex);

  const tokenValues = new Set();
  config.tokens.forEach((t) => {
    tokenValues.add(t.enValue);
    if (t.zhValue) tokenValues.add(t.zhValue);
  });

  editableDiv.innerHTML = '';
  parts.forEach((part) => {
    if (!part) return;
    if (tokenValues.has(part)) {
      const span = document.createElement('span');
      span.className = 'input-token-capsule';
      span.contentEditable = 'false';
      
      const token = config.tokens.find(t => t.enValue === part || t.zhValue === part);
      const isZh = getLanguage() === 'zh_CN';
      span.textContent = token ? (isZh ? token.zhValue : token.enValue) : part;

      editableDiv.appendChild(span);
    } else {
      editableDiv.appendChild(document.createTextNode(part));
    }
  });
}

// Convert contenteditable HTML content back to flat text value in input
function syncHtmlToInput(input, editableDiv) {
  let textVal = '';

  function traverse(node) {
    if (node.nodeType === Node.TEXT_NODE) {
      textVal += node.textContent;
    } else if (node.nodeType === Node.ELEMENT_NODE) {
      if (node.classList.contains('input-token-capsule')) {
        textVal += node.textContent;
      } else if (node.nodeName === 'BR') {
        textVal += '\n';
      } else if (node.nodeName === 'DIV' || node.nodeName === 'P') {
        if (textVal && !textVal.endsWith('\n')) {
          textVal += '\n';
        }
        node.childNodes.forEach(traverse);
      } else {
        node.childNodes.forEach(traverse);
      }
    }
  }

  editableDiv.childNodes.forEach(traverse);

  if (input.value !== textVal) {
    input.value = textVal;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
  }
}

function handleInsert(input, editableDiv, token, config) {
  const isZh = getLanguage() === 'zh_CN';
  const valToInsert = isZh ? token.zhValue : token.enValue;

  const val = input.value;
  // Get character selection bounds relative to contenteditable input
  const { start, end } = getSelectionOffsets(editableDiv);

  let finalInsertVal = valToInsert;

  if (config.mode === 'csv') {
    if (start === end) {
      const beforeStr = val.slice(0, start);
      const afterStr = val.slice(end);

      let prefix = '';
      let suffix = '';

      if (start > 0 && !/,\s*$/.test(beforeStr)) {
        prefix = ',';
      }
      if (end < val.length && !/^\s*,/.test(afterStr)) {
        suffix = ',';
      }

      finalInsertVal = `${prefix}${valToInsert}${suffix}`;
    }
  }

  // Insert value inside flat string representation
  const newVal = val.slice(0, start) + finalInsertVal + val.slice(end);
  input.value = newVal;

  // Re-sync input flat value to contenteditable HTML representation
  syncInputToHtml(input, editableDiv, config);

  // Position caret directly after newly inserted item
  const newCaretPos = start + finalInsertVal.length;
  editableDiv.focus();
  setCaretPosition(editableDiv, newCaretPos);

  // Dispatch events to trigger saves
  input.dispatchEvent(new Event('input', { bubbles: true }));
  input.dispatchEvent(new Event('change', { bubbles: true }));
}

function renderPanelContent(panel, config) {
  const isZh = getLanguage() === 'zh_CN';
  const headerText = config.isDatetime
    ? message('tokenPickerDatetimeHeader')
    : message('tokenPickerHeader');

  panel.innerHTML = `
    <div class="token-picker-header">${headerText}</div>
    <div class="token-picker-tokens" role="group"></div>
  `;

  const container = panel.querySelector('.token-picker-tokens');

  config.tokens.forEach((token) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'token-picker-capsule';
    btn.textContent = isZh ? token.zhValue : token.enValue;
    const description = token.key === 'datetime' && config.datetimeTitleKey
      ? message(config.datetimeTitleKey)
      : (isZh ? token.zhDescription : token.enDescription);
    btn.title = description;
    btn.setAttribute('aria-label', description);

    btn.addEventListener('mousedown', (e) => {
      // Prevent focus blur from firing on contenteditable
      e.preventDefault();
    });

    btn.addEventListener('click', (e) => {
      e.preventDefault();
      const editableDiv = btn.closest('.token-picker-container').querySelector('.token-picker-editable-input');
      const input = btn.closest('.token-picker-container').querySelector('input, textarea');
      handleInsert(input, editableDiv, token, config);
    });

    container.appendChild(btn);
  });
}

export function updateTokenPickers() {
  activePickers.forEach(({ input, panel, editableDiv, config }) => {
    renderPanelContent(panel, config);
    syncInputToHtml(input, editableDiv, config);
  });
}

export function initTokenPickers() {
  PICKER_CONFIGS.forEach((config) => {
    const input = document.getElementById(config.inputId);
    // Ensure we do not double-initialize if called multiple times or on hot-reloads
    if (!input || input.dataset.tokenPickerInit) return;
    input.dataset.tokenPickerInit = 'true';
    const excludedTokens = new Set(
      String(input.dataset.tokenPickerExclude || '')
        .split(',')
        .map((key) => key.trim())
        .filter(Boolean)
    );
    config = {
      ...config,
      tokens: config.tokens.filter((token) => !excludedTokens.has(token.key)),
      datetimeTitleKey: input.dataset.tokenPickerDatetimeTitle || ''
    };

    // Create wrapper container and replace element positions
    const container = document.createElement('div');
    container.className = 'token-picker-container';

    input.parentNode.insertBefore(container, input);
    container.appendChild(input);

    // Hide original text input element
    input.style.display = 'none';

    // Create custom contenteditable element in place of textbox input
    const editableDiv = document.createElement('div');
    editableDiv.className = 'token-picker-editable-input';
    editableDiv.contentEditable = 'true';
    
    // Copy spellcheck and tabIndex settings
    editableDiv.spellcheck = input.spellcheck;
    
    container.insertBefore(editableDiv, input);

    // Create floating parameters selection panel
    const panel = document.createElement('div');
    panel.className = 'token-picker-panel';
    if (config.position === 'top') {
      panel.classList.add('position-top');
    }
    panel.setAttribute('role', 'region');
    panel.setAttribute('aria-label', config.isDatetime ? 'Available datetime tokens' : 'Available parameters');
    container.appendChild(panel);

    // Initial render and data sync
    renderPanelContent(panel, config);
    syncInputToHtml(input, editableDiv, config);

    // Register active picker instance
    activePickers.push({ input, panel, editableDiv, config });

    // Focus redirection (e.g. clicking the label triggers input focus)
    input.addEventListener('focus', () => {
      editableDiv.focus();
    });

    // Contenteditable event handlers
    editableDiv.addEventListener('focus', () => {
      activePickers.forEach((p) => {
        if (p.panel !== panel) p.panel.classList.remove('visible');
      });
      panel.classList.add('visible');
    });

    editableDiv.addEventListener('blur', () => {
      // Re-render and sanitize capsules after typing is complete
      syncHtmlToInput(input, editableDiv);
      syncInputToHtml(input, editableDiv, config);
    });

    editableDiv.addEventListener('input', () => {
      syncHtmlToInput(input, editableDiv);
    });

    editableDiv.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !config.multiline) {
        // Prevent line-break behaviors inside settings fields
        e.preventDefault();
      }
      if (e.key === 'Escape') {
        panel.classList.remove('visible');
        editableDiv.blur();
      }
    });
  });

  // Handle clicking outside panels to dismiss selections
  document.addEventListener('click', (e) => {
    activePickers.forEach(({ panel, editableDiv }) => {
      if (!editableDiv.contains(e.target) && !panel.contains(e.target)) {
        panel.classList.remove('visible');
      }
    });
  });
}
