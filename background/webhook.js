export async function sendWebhook(payload, options) {
  const targetUrl = options.webhookUrl;
  if (!targetUrl) {
    throw new Error('Webhook URL is not configured.');
  }

  let urlObj;
  try {
    urlObj = new URL(targetUrl);
  } catch (e) {
    throw new Error(`Invalid Webhook URL: ${e.message}`);
  }

  if (urlObj.protocol !== 'http:' && urlObj.protocol !== 'https:') {
    throw new Error(`Webhook URL protocol must be http: or https: (got ${urlObj.protocol})`);
  }

  const method = (options.webhookMethod || 'POST').toUpperCase();
  if (method !== 'GET' && method !== 'POST') {
    throw new Error(`Unsupported webhook method: ${method}. Only GET and POST are allowed.`);
  }

  const fetchOptions = {
    method,
    headers: {}
  };

  if (options.webhookHeaders) {
    let parsedHeaders;
    try {
      parsedHeaders = JSON.parse(options.webhookHeaders);
    } catch (e) {
      console.error('Failed to parse webhook headers:', e);
      throw new Error(`Invalid headers JSON: ${e.message}`);
    }

    if (parsedHeaders === null || typeof parsedHeaders !== 'object' || Array.isArray(parsedHeaders)) {
      throw new Error('Webhook headers must be a JSON object.');
    }

    Object.entries(parsedHeaders).forEach(([k, v]) => {
      if (typeof v === 'object' && v !== null) {
        throw new Error(`Invalid header value for key "${k}": nested objects/arrays are not supported.`);
      }
      fetchOptions.headers[k] = String(v);
    });
  }

  const bodyTemplate = options.webhookBodyTemplate;
  let finalBody = '';

  if (bodyTemplate) {
    let bodyStr = bodyTemplate;
    const placeholders = {
      runId: payload.runId || '',
      taskName: payload.taskName || '',
      status: payload.status || '',
      startedAt: payload.startedAt || '',
      finishedAt: payload.finishedAt || '',
      durationMs: String(payload.durationMs || 0),
      total: String(payload.total || 0),
      success: String(payload.success || 0),
      failed: String(payload.failed || 0),
      cancelled: String(payload.cancelled || false),
      folder: payload.folder || '',
      reportFilename: payload.reportFilename || '',
      unfinishedTasksCount: String(payload.unfinishedTasksCount || 0)
    };

    Object.entries(placeholders).forEach(([key, val]) => {
      const escapedVal = JSON.stringify(val).slice(1, -1);
      bodyStr = bodyStr.replaceAll(`{${key}}`, escapedVal);
    });

    const itemsJson = JSON.stringify(payload.items || []);
    bodyStr = bodyStr.replace(/"?\{items\}"?/, itemsJson);
    finalBody = bodyStr;
  } else {
    finalBody = JSON.stringify(payload);
  }

  let finalUrl = targetUrl;
  if (fetchOptions.method === 'GET') {
    try {
      const payloadObj = JSON.parse(finalBody);
      Object.entries(payloadObj).forEach(([k, v]) => {
        if (typeof v === 'object') {
          urlObj.searchParams.append(k, JSON.stringify(v));
        } else {
          urlObj.searchParams.append(k, String(v));
        }
      });
      finalUrl = urlObj.toString();
    } catch (e) {
      console.error('Failed to parse body as JSON for GET request:', e);
      throw new Error(`Failed to parse final webhook body as JSON for GET request: ${e.message}`);
    }
  } else {
    fetchOptions.body = finalBody;
    if (!fetchOptions.headers['Content-Type']) {
      fetchOptions.headers['Content-Type'] = 'application/json';
    }
    if (fetchOptions.headers['Content-Type'] === 'application/json') {
      try {
        JSON.parse(finalBody);
      } catch (e) {
        throw new Error(`Failed to parse final webhook body as JSON: ${e.message}`);
      }
    }
  }

  const controller = new AbortController();
  const timeoutSec = Number(options.webhookTimeout) || 10;
  const timeoutId = setTimeout(() => controller.abort(), timeoutSec * 1000);

  try {
    const response = await fetch(finalUrl, {
      ...fetchOptions,
      signal: controller.signal
    });
    clearTimeout(timeoutId);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    return { success: true, status: response.status };
  } catch (err) {
    clearTimeout(timeoutId);
    throw err;
  }
}

export async function triggerWebhookIfNeeded(rows, options, context, deps) {
  if (!options.webhookEnabled) {
    return;
  }

  const { taskName, runId, startedAt, isCancelled, reportFilename = '' } = context;
  const finishedAt = new Date().toISOString();
  const durationMs = new Date(finishedAt) - new Date(startedAt);

  const total = rows.length;
  const success = rows.filter((r) => r.status === 'ok').length;
  const failed = total - success;

  let status = 'success';
  if (isCancelled) {
    status = 'cancelled';
  } else if (failed > 0) {
    status = 'failed';
  }

  const condition = options.webhookTriggerCondition || 'always';
  let shouldTrigger = false;
  if (condition === 'always') {
    shouldTrigger = true;
  } else if (condition === 'success' && status === 'success') {
    shouldTrigger = true;
  } else if (condition === 'failed' && status === 'failed') {
    shouldTrigger = true;
  } else if (condition === 'completed' && !isCancelled) {
    shouldTrigger = true;
  }

  if (!shouldTrigger) {
    return;
  }

  const items = rows.map((row) => {
    return {
      index: row.index,
      url: row.url,
      title: row.title,
      status: row.status,
      filename: row.filename,
      error: row.error || ''
    };
  });

  let unfinishedTasksCount = 0;
  if (deps?.scheduledTasks?.getScheduledTasks) {
    try {
      const scheduled = await deps.scheduledTasks.getScheduledTasks();
      unfinishedTasksCount = (scheduled || []).length;
    } catch (e) {
      console.error('Failed to get scheduled tasks in webhook:', e);
    }
  }

  const payload = {
    source: 'BatchShot',
    event: 'capture.completed',
    runId,
    taskName,
    status,
    startedAt,
    finishedAt,
    durationMs,
    total,
    success,
    failed,
    cancelled: isCancelled,
    folder: options.folder || 'BatchShot',
    reportFilename,
    unfinishedTasksCount,
    items
  };

  try {
    await sendWebhook(payload, options);
  } catch (error) {
    console.error('Webhook trigger failed:', error);
    if (deps?.batchStatus?.addLog) {
      deps.batchStatus.addLog('Webhook', 'error', error.message || 'Webhook failed', 'Webhook Notification');
    }
    if (!options.webhookIgnoreErrors) {
      throw error;
    }
  }
}
