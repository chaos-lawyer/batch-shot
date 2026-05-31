import { createReportWorkbookFiles } from './report-workbook.js';
import { bytesToBase64, zipStore } from './zip-store.js';

const XLSX_MIME_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

export function createXlsxReportDataUrl(reportRows, columns) {
  const files = createReportWorkbookFiles(reportRows, columns);
  const bytes = zipStore(files);
  return `data:${XLSX_MIME_TYPE};base64,${bytesToBase64(bytes)}`;
}
