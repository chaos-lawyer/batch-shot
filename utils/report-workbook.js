import {
  columnName,
  contentTypesXml,
  packageRelationshipsXml,
  stylesXml,
  workbookRelationshipsXml,
  workbookXml,
  worksheetRelationships,
  worksheetXml
} from './xlsx-xml.js';

function buildRows(reportRows, columns) {
  return [
    columns.map((column) => ({ value: column.label, style: 1 })),
    ...reportRows.map((row) => columns.map((column) => ({
      value: row[column.key],
      style: column.key === 'status' ? (row.status === 'ok' ? 2 : 3) : 0
    })))
  ];
}

function buildHyperlinks(reportRows, columns) {
  const filenameColumnIndex = columns.findIndex((column) => column.key === 'filename');
  if (filenameColumnIndex < 0) {
    return [];
  }

  return reportRows
    .map((row, index) => ({ row, index }))
    .filter(({ row }) => row.filename)
    .map(({ row, index }) => ({
      ref: `${columnName(filenameColumnIndex)}${index + 2}`,
      target: row.filename
    }));
}

export function createReportWorkbookFiles(reportRows, columns) {
  const failedRows = reportRows.filter((row) => row.status !== 'ok');
  const allHyperlinks = buildHyperlinks(reportRows, columns);
  const failedHyperlinks = buildHyperlinks(failedRows, columns);

  return [
    { name: '[Content_Types].xml', content: contentTypesXml() },
    { name: '_rels/.rels', content: packageRelationshipsXml() },
    { name: 'xl/workbook.xml', content: workbookXml() },
    { name: 'xl/_rels/workbook.xml.rels', content: workbookRelationshipsXml() },
    { name: 'xl/styles.xml', content: stylesXml() },
    {
      name: 'xl/worksheets/sheet1.xml',
      content: worksheetXml(buildRows(reportRows, columns), allHyperlinks)
    },
    {
      name: 'xl/worksheets/_rels/sheet1.xml.rels',
      content: worksheetRelationships(allHyperlinks)
    },
    {
      name: 'xl/worksheets/sheet2.xml',
      content: worksheetXml(buildRows(failedRows, columns), failedHyperlinks)
    },
    {
      name: 'xl/worksheets/_rels/sheet2.xml.rels',
      content: worksheetRelationships(failedHyperlinks)
    }
  ];
}
