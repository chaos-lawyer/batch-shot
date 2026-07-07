export async function downloadDataUrl(dataUrl, filename, deps) {
  const { chrome } = deps;
  return chrome.downloads.download({
    url: dataUrl,
    filename,
    conflictAction: 'uniquify',
    saveAs: false
  });
}

export async function downloadReport(rows, options, deps) {
  const { chrome, getReportColumns, buildFolderPath, buildDownloadPath, createXlsxReportDataUrl, csvEscape } = deps;
  
  if (!rows || rows.length === 0) {
    return;
  }

  const extension = options.reportFormat === 'xlsx' ? 'xlsx' : 'csv';
  const isXlsx = extension === 'xlsx';
  const mimeType = isXlsx
    ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    : 'text/csv;charset=utf-8';
  const columns = getReportColumns(options.reportFields);
  const header = columns.map((column) => column.label);
  const reportTimestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const firstRow = rows[0] || {};
  const reportFolder = buildFolderPath(
    options.folder,
    firstRow.url || 'https://batchshot.local/',
    0,
    rows.length,
    options,
    {
      title: firstRow.title || '',
      total: rows.length,
      keyword: options.urlContexts?.[0]?.keyword || ''
    }
  );
  const reportName = buildDownloadPath(reportFolder, `report-${reportTimestamp}.${extension}`);
  const dataUrl = isXlsx
    ? createXlsxReportDataUrl(rows, columns)
    : `data:${mimeType},${encodeURIComponent([
      header.join(','),
      ...rows.map((row) => columns.map((column) => csvEscape(row[column.key])).join(','))
    ].join('\n'))}`;

  await chrome.downloads.download({
    url: dataUrl,
    filename: reportName,
    conflictAction: 'uniquify',
    saveAs: false
  });
}

export async function captureTabToDownload(tab, index, total, options, urlContext, deps) {
  const { activateTab, captureViewport, captureFullPage, buildFilename } = deps;
  const freshTab = await activateTab(tab);
  const url = freshTab.url || tab.url;
  const parsedUrl = new URL(url);
  const captureOptions = {
    ...options,
    metadataContext: {
      capturedAt: new Date().toISOString(),
      url,
      title: freshTab.title || '',
      host: parsedUrl.hostname,
      index: index + 1,
      total,
      keyword: urlContext?.keyword || ''
    }
  };
  const dataUrl = options.captureMode === 'viewport'
    ? await captureViewport(freshTab, captureOptions)
    : await captureFullPage(freshTab, captureOptions);
  const filename = buildFilename(url, index, options, {
    title: freshTab.title || '',
    total,
    keyword: urlContext?.keyword || ''
  });

  await downloadDataUrl(dataUrl, filename, deps);
  return { url, filename, title: freshTab.title || '' };
}
