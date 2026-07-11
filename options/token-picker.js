import { message } from '../utils/i18n.js';

const FILENAME_TOKENS = [
  {
    key: 'index',
    enValue: '{index}',
    zhValue: '{序号}',
    enLabel: '{index} · Index',
    zhLabel: '{序号} · index',
    enDescription: 'Task sequence number (e.g. 001)',
    zhDescription: '任务序号，例如 001'
  },
  {
    key: 'total',
    enValue: '{total}',
    zhValue: '{总数}',
    enLabel: '{total} · Total',
    zhLabel: '{总数} · total',
    enDescription: 'Total number of tasks',
    zhDescription: '任务总数'
  },
  {
    key: 'host',
    enValue: '{host}',
    zhValue: '{域名}',
    enLabel: '{host} · Host',
    zhLabel: '{域名} · host',
    enDescription: 'Page domain (e.g. google.com)',
    zhDescription: '网页域名，例如 google.com'
  },
  {
    key: 'folder',
    enValue: '{folder}',
    zhValue: '{文件夹}',
    enLabel: '{folder} · Folder',
    zhLabel: '{文件夹} · folder',
    enDescription: 'Save folder path',
    zhDescription: '保存文件夹'
  },
  {
    key: 'datetime',
    enValue: '{datetime}',
    zhValue: '{日期时间}',
    enLabel: '{datetime} · DateTime',
    zhLabel: '{日期时间} · datetime',
    enDescription: 'Full date and time (customizable)',
    zhDescription: '完整日期时间（可自定义格式）'
  },
  {
    key: 'date',
    enValue: '{date}',
    zhValue: '{日期}',
    enLabel: '{date} · Date',
    zhLabel: '{日期} · date',
    enDescription: 'Date (e.g. 2026-07-11)',
    zhDescription: '当前日期，例如 2026-07-11'
  },
  {
    key: 'time',
    enValue: '{time}',
    zhValue: '{时间}',
    enLabel: '{time} · Time',
    zhLabel: '{时间} · time',
    enDescription: 'Time (e.g. 113958)',
    zhDescription: '当前时间，例如 113958'
  },
  {
    key: 'year',
    enValue: '{year}',
    zhValue: '{年}',
    enLabel: '{year} · Year',
    zhLabel: '{年} · year',
    enDescription: 'Year (e.g. 2026)',
    zhDescription: '当前年份，例如 2026'
  },
  {
    key: 'month',
    enValue: '{month}',
    zhValue: '{月}',
    enLabel: '{month} · Month',
    zhLabel: '{月} · month',
    enDescription: 'Month (e.g. 07)',
    zhDescription: '当前月份，例如 07'
  },
  {
    key: 'day',
    enValue: '{day}',
    zhValue: '{日}',
    enLabel: '{day} · Day',
    zhLabel: '{日} · day',
    enDescription: 'Day of the month (e.g. 11)',
    zhDescription: '当前日，例如 11'
  },
  {
    key: 'title',
    enValue: '{title}',
    zhValue: '{标题}',
    enLabel: '{title} · Title',
    zhLabel: '{标题} · title',
    enDescription: 'Page title',
    zhDescription: '页面标题'
  },
  {
    key: 'keyword',
    enValue: '{keyword}',
    zhValue: '{关键词}',
    enLabel: '{keyword} · Keyword',
    zhLabel: '{关键词} · keyword',
    enDescription: 'Search keyword or template term',
    zhDescription: '模板替换词或搜索关键词'
  },
  {
    key: 'url',
    enValue: '{url}',
    zhValue: '{网址}',
    enLabel: '{url} · URL',
    zhLabel: '{网址} · url',
    enDescription: 'Full page URL',
    zhDescription: '页面 URL'
  }
];

const FOLDER_TOKENS = [
  {
    key: 'BatchShot',
    enValue: 'BatchShot',
    zhValue: 'BatchShot',
    enLabel: 'BatchShot',
    zhLabel: 'BatchShot',
    enDescription: 'Default download folder name',
    zhDescription: '默认下载文件夹名称'
  },
  {
    key: '/',
    enValue: '/',
    zhValue: '/',
    enLabel: '/',
    zhLabel: '/',
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
    enLabel: '{capturedAt} · Captured At',
    zhLabel: '{截图时间} · capturedAt',
    enDescription: 'Capture timestamp',
    zhDescription: '截图时间'
  },
  {
    key: 'url',
    enValue: '{url}',
    zhValue: '{网址}',
    enLabel: '{url} · URL',
    zhLabel: '{网址} · url',
    enDescription: 'Page URL',
    zhDescription: '页面 URL'
  },
  {
    key: 'title',
    enValue: '{title}',
    zhValue: '{标题}',
    enLabel: '{title} · Title',
    zhLabel: '{标题} · title',
    enDescription: 'Page title',
    zhDescription: '页面标题'
  },
  {
    key: 'host',
    enValue: '{host}',
    zhValue: '{域名}',
    enLabel: '{host} · Host',
    zhLabel: '{域名} · host',
    enDescription: 'Page domain',
    zhDescription: '网页域名'
  },
  {
    key: 'index',
    enValue: '{index}',
    zhValue: '{序号}',
    enLabel: '{index} · Index',
    zhLabel: '{序号} · index',
    enDescription: 'Task sequence number',
    zhDescription: '任务序号'
  },
  {
    key: 'total',
    enValue: '{total}',
    zhValue: '{总数}',
    enLabel: '{total} · Total',
    zhLabel: '{总数} · total',
    enDescription: 'Total number of tasks',
    zhDescription: '任务总数'
  },
  {
    key: 'keyword',
    enValue: '{keyword}',
    zhValue: '{关键词}',
    enLabel: '{keyword} · Keyword',
    zhLabel: '{关键词} · keyword',
    enDescription: 'Search keyword',
    zhDescription: '搜索关键词'
  }
];

const REPORT_TOKENS = [
  {
    key: 'index',
    enValue: '{index}',
    zhValue: '{序号}',
    enLabel: '{index} · Index',
    zhLabel: '{序号} · index',
    enDescription: 'Task sequence number',
    zhDescription: '任务序号'
  },
  {
    key: 'url',
    enValue: '{url}',
    zhValue: '{网址}',
    enLabel: '{url} · URL',
    zhLabel: '{网址} · url',
    enDescription: 'Page URL',
    zhDescription: '页面 URL'
  },
  {
    key: 'title',
    enValue: '{title}',
    zhValue: '{页面标题}',
    enLabel: '{title} · Page Title',
    zhLabel: '{页面标题} · title',
    enDescription: 'Page title',
    zhDescription: '页面标题'
  },
  {
    key: 'status',
    enValue: '{status}',
    zhValue: '{状态}',
    enLabel: '{status} · Status',
    zhLabel: '{状态} · status',
    enDescription: 'Capture status',
    zhDescription: '截图状态'
  },
  {
    key: 'filename',
    enValue: '{filename}',
    zhValue: '{文件名}',
    enLabel: '{filename} · Filename',
    zhLabel: '{文件名} · filename',
    enDescription: 'Saved filename',
    zhDescription: '文件名'
  },
  {
    key: 'error',
    enValue: '{error}',
    zhValue: '{错误}',
    enLabel: '{error} · Error',
    zhLabel: '{错误} · error',
    enDescription: 'Error message if capture failed',
    zhDescription: '错误信息/失败原因'
  }
];

const DATETIME_TOKENS = [
  {
    key: 'YYYY',
    enValue: 'YYYY',
    zhValue: 'YYYY',
    enLabel: 'YYYY · Year',
    zhLabel: 'YYYY · 年份',
    enDescription: '4-digit year (e.g. 2026)',
    zhDescription: '四位年份（如 2026）'
  },
  {
    key: 'MM',
    enValue: 'MM',
    zhValue: 'MM',
    enLabel: 'MM · Month',
    zhLabel: 'MM · 月份',
    enDescription: '2-digit month (01-12)',
    zhDescription: '两位月份（01-12）'
  },
  {
    key: 'DD',
    enValue: 'DD',
    zhValue: 'DD',
    enLabel: 'DD · Day',
    zhLabel: 'DD · 日期',
    enDescription: '2-digit day of month (01-31)',
    zhDescription: '两位日期（01-31）'
  },
  {
    key: 'HH',
    enValue: 'HH',
    zhValue: 'HH',
    enLabel: 'HH · Hour',
    zhLabel: 'HH · 小时',
    enDescription: '2-digit hour in 24h format (00-23)',
    zhDescription: '两位24小时制小时（00-23）'
  },
  {
    key: 'mm',
    enValue: 'mm',
    zhValue: 'mm',
    enLabel: 'mm · Minute',
    zhLabel: 'mm · 分钟',
    enDescription: '2-digit minute (00-59)',
    zhDescription: '两位分钟（00-59）'
  },
  {
    key: 'ss',
    enValue: 'ss',
    zhValue: 'ss',
    enLabel: 'ss · Second',
    zhLabel: 'ss · 秒数',
    enDescription: '2-digit second (00-59)',
    zhDescription: '两位秒数（00-59）'
  }
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
  const select = document.getElementById('appLanguage');
  const val = select ? select.value : 'auto';
  if (val === 'zh_CN') return 'zh_CN';
  if (val === 'en') return 'en';
  // auto language check
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
      span.textContent = part;
      editableDiv.appendChild(span);
    } else {
      editableDiv.appendChild(document.createTextNode(part));
    }
  });
}

// Convert contenteditable HTML content back to flat text value in input
function syncHtmlToInput(input, editableDiv) {
  let textVal = '';
  editableDiv.childNodes.forEach((node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      textVal += node.textContent;
    } else if (node.nodeType === Node.ELEMENT_NODE) {
      if (node.classList.contains('input-token-capsule')) {
        textVal += node.textContent;
      } else {
        textVal += node.innerText || '';
      }
    }
  });

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
    btn.title = isZh ? token.zhDescription : token.enDescription;
    btn.setAttribute('aria-label', isZh ? token.zhDescription : token.enDescription);

    btn.addEventListener('mousedown', (e) => {
      // Prevent focus blur from firing on contenteditable
      e.preventDefault();
    });

    btn.addEventListener('click', (e) => {
      e.preventDefault();
      const editableDiv = btn.closest('.token-picker-container').querySelector('.token-picker-editable-input');
      const input = btn.closest('.token-picker-container').querySelector('input');
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
      if (e.key === 'Enter') {
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
