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
  const columns = getReportColumns(options.reportFields, options.includeTextInReport);
  const header = columns.map((column) => column.label);
  const reportTimestamp = new Date().toISOString().replace(/[:.]/g, '-');
  
  const reportFolder = findCommonFolder(rows, options, buildFolderPath);
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

  return reportName;
}

export async function captureTabToDownload(tab, index, total, options, urlContext, deps) {
  const { activateTab, captureViewport, captureFullPage, buildFilename, sendTabMessage } = deps;
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

  let pageTextResult = null;
  if (options.extractPageText) {
    try {
      pageTextResult = await sendTabMessage(freshTab.id, {
        action: 'extractPageText',
        payload: {
          limit: Number(options.pageTextLengthLimit) || 100000
        }
      });
    } catch (e) {
      console.error('Failed to extract page text:', e);
    }
  }

  let textFilename = '';
  if (options.saveTextMode === 'separate' && pageTextResult && pageTextResult.text) {
    textFilename = filename.replace(/\.[a-zA-Z0-9]+$/, '.txt');
    const formattedText = formatTextWithTemplate({
      text: pageTextResult.text,
      url,
      title: freshTab.title || '',
      keyword: urlContext?.keyword || '',
      capturedAt: new Date().toISOString(),
      metaDescription: pageTextResult.metaDescription || '',
      lang: pageTextResult.lang || ''
    }, options.saveTextTemplate);
    const textDataUrl = `data:text/plain;charset=utf-8,${encodeURIComponent(formattedText)}`;
    await downloadDataUrl(textDataUrl, textFilename, deps);
  }

  return {
    url,
    filename,
    title: freshTab.title || '',
    textFilename,
    textLength: pageTextResult ? pageTextResult.textLength : 0,
    textExcerpt: pageTextResult ? pageTextResult.text.slice(0, 300) : '',
    metaDescription: pageTextResult ? pageTextResult.metaDescription : '',
    text: (options.saveTextMode === 'combined' && pageTextResult) ? pageTextResult.text : '',
    lang: pageTextResult ? pageTextResult.lang : '',
    keyword: urlContext?.keyword || ''
  };
}

function formatTextWithTemplate(data, template) {
  if (!template) {
    return data.text || '';
  }

  let result = template;
  const replacements = {
    text: data.text || '',
    url: data.url || '',
    title: data.title || '',
    keyword: data.keyword || '',
    capturedAt: data.capturedAt || '',
    metaDescription: data.metaDescription || '',
    lang: data.lang || ''
  };

  const keysMapping = {
    text: ['text', '正文'],
    url: ['url', '网址'],
    title: ['title', '标题'],
    keyword: ['keyword', '关键词'],
    capturedAt: ['capturedAt', '截图时间'],
    metaDescription: ['metaDescription', '描述'],
    lang: ['lang', '语言']
  };

  Object.entries(keysMapping).forEach(([key, placeholders]) => {
    placeholders.forEach((placeholder) => {
      const regex = new RegExp(`\\{${placeholder}\\}`, 'g');
      result = result.replace(regex, replacements[key]);
    });
  });

  return result;
}

export async function downloadCombinedTextIfNeeded(rows, options, deps) {
  const { chrome, buildFolderPath, buildDownloadPath } = deps;

  if (!options.extractPageText || options.saveTextMode !== 'combined') {
    return;
  }

  const textRows = (rows || []).filter((row) => row.status === 'ok' && row.text);
  if (textRows.length === 0) {
    return;
  }

  const reportTimestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const capturedAt = new Date().toISOString();

  const combinedText = textRows
    .map((row) => {
      return formatTextWithTemplate({
        text: row.text,
        url: row.url,
        title: row.title,
        keyword: row.keyword || '',
        capturedAt,
        metaDescription: row.metaDescription || '',
        lang: row.lang || ''
      }, options.saveTextTemplate);
    })
    .join('\n\n' + options.saveTextCombinedSeparator + '\n\n');

  const folder = findCommonFolder(rows, options, buildFolderPath);
  const textFilename = buildDownloadPath(folder, `combined_text-${reportTimestamp}.txt`);

  const dataUrl = `data:text/plain;charset=utf-8,${encodeURIComponent(combinedText)}`;

  await chrome.downloads.download({
    url: dataUrl,
    filename: textFilename,
    conflictAction: 'uniquify',
    saveAs: false
  });

  // Clear the full text from rows to free up memory
  rows.forEach((row) => {
    delete row.text;
  });
}

function findCommonFolder(rows, options, buildFolderPath) {
  if (!rows || rows.length === 0) {
    return '';
  }

  const validRows = rows.filter((row) => row.filename);
  if (validRows.length === 0) {
    return '';
  }

  const foldersParts = validRows.map((row) => {
    const parts = row.filename.split('/');
    parts.pop(); // Remove filename, leaving directory parts
    return parts;
  });

  const firstParts = foldersParts[0];
  let commonParts = [...firstParts];

  for (let i = 1; i < foldersParts.length; i++) {
    const currentParts = foldersParts[i];
    let j = 0;
    while (j < commonParts.length && j < currentParts.length && commonParts[j] === currentParts[j]) {
      j++;
    }
    commonParts = commonParts.slice(0, j);
    if (commonParts.length === 0) {
      break;
    }
  }

  const commonPath = commonParts.join('/');
  if (commonPath) {
    return commonPath;
  }

  // Fallback if no common path is calculated from filenames
  const firstRow = rows[0] || {};
  return buildFolderPath(
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
}
