export const DEFAULT_REPORT_FIELDS = '{index},{url},{title},{status},{filename},{error}';

const REPORT_FIELD_CONFIG = [
  { key: 'index', label: 'Index', zhLabel: '序号', aliases: ['no', 'number'], zhAliases: ['序号', '编号'] },
  { key: 'url', label: 'URL', zhLabel: '网址', aliases: ['link'], zhAliases: ['网址', '链接'] },
  { key: 'title', label: 'Page title', zhLabel: '页面标题', aliases: ['pageTitle'], zhAliases: ['页面标题', '标题'] },
  { key: 'status', label: 'Status', zhLabel: '状态', aliases: ['result'], zhAliases: ['结果', '状态'] },
  { key: 'filename', label: 'Filename', zhLabel: '文件名', aliases: ['file', 'path'], zhAliases: ['文件名', '文件'] },
  { key: 'error', label: 'Error', zhLabel: '错误', aliases: ['message'], zhAliases: ['失败原因', '错误'] }
];

const FIELD_BY_NAME = new Map();
const CHINESE_FIELD_NAMES = new Set();

REPORT_FIELD_CONFIG.forEach((field) => {
  [field.key, ...field.aliases, ...field.zhAliases].forEach((name) => {
    const normalizedName = String(name).toLowerCase();
    FIELD_BY_NAME.set(normalizedName, field);
    if (field.zhAliases.includes(name)) {
      CHINESE_FIELD_NAMES.add(normalizedName);
    }
  });
});

function parseReportFieldTokens(value) {
  return String(value || DEFAULT_REPORT_FIELDS)
    .split(/[\s,，、]+/)
    .map((name) => {
      let cleaned = name.trim();
      if (cleaned.startsWith('{') && cleaned.endsWith('}')) {
        cleaned = cleaned.slice(1, -1).trim();
      }
      return cleaned;
    })
    .filter(Boolean)
    .map((name) => {
      const normalizedName = name.toLowerCase();
      const field = FIELD_BY_NAME.get(normalizedName);
      if (!field) {
        return null;
      }

      return {
        ...field,
        token: CHINESE_FIELD_NAMES.has(normalizedName) ? `{${field.zhLabel}}` : `{${field.key}}`,
        label: CHINESE_FIELD_NAMES.has(normalizedName) ? field.zhLabel : field.label
      };
    })
    .filter(Boolean);
}

export function normalizeReportFields(value) {
  const fields = parseReportFieldTokens(value);
  const uniqueFields = [];
  const usedKeys = new Set();

  fields.forEach((field) => {
    if (usedKeys.has(field.key)) {
      return;
    }

    uniqueFields.push(field.token);
    usedKeys.add(field.key);
  });

  return uniqueFields.length ? uniqueFields.join(',') : DEFAULT_REPORT_FIELDS;
}

export function getReportColumns(value) {
  const fields = parseReportFieldTokens(normalizeReportFields(value));
  const uniqueFields = [];
  const usedKeys = new Set();

  fields.forEach((field) => {
    if (usedKeys.has(field.key)) {
      return;
    }

    uniqueFields.push(field);
    usedKeys.add(field.key);
  });

  return uniqueFields;
}
