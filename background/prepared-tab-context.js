export const PREPARED_TAB_CONTEXT_TTL_MS = 3 * 60 * 60 * 1000;
export const PREPARED_TAB_CONTEXT_ALARM = 'batchshot-prepared-tab-context-cleanup';

const STORAGE_KEY = 'preparedTabContexts';

function storageArea(chromeApi) {
  return chromeApi.storage?.session || chromeApi.storage?.local;
}

function tabKey(tabId) {
  return String(tabId);
}

async function readContexts(chromeApi) {
  const area = storageArea(chromeApi);
  if (!area) {
    return {};
  }

  const result = await area.get(STORAGE_KEY);
  const contexts = result?.[STORAGE_KEY];
  return contexts && typeof contexts === 'object' ? contexts : {};
}

async function writeContexts(chromeApi, contexts) {
  const area = storageArea(chromeApi);
  if (!area) {
    return;
  }

  await area.set({ [STORAGE_KEY]: contexts });
}

function isFreshContext(context, now) {
  return context?.createdAt && now - context.createdAt <= PREPARED_TAB_CONTEXT_TTL_MS;
}

function pruneContexts(contexts, now) {
  return Object.fromEntries(
    Object.entries(contexts).filter(([, context]) => isFreshContext(context, now))
  );
}

export async function ensurePreparedTabContextCleanupAlarm(chromeApi) {
  if (!chromeApi.alarms?.create) {
    return;
  }

  await chromeApi.alarms.create(PREPARED_TAB_CONTEXT_ALARM, {
    delayInMinutes: 30,
    periodInMinutes: 30
  });
}

export async function cleanupPreparedTabContexts(chromeApi, now = Date.now()) {
  const contexts = await readContexts(chromeApi);
  const pruned = pruneContexts(contexts, now);

  if (Object.keys(pruned).length !== Object.keys(contexts).length) {
    await writeContexts(chromeApi, pruned);
  }

  return pruned;
}

export async function rememberPreparedTabContext(chromeApi, tab, job, now = Date.now()) {
  if (!tab?.id || !job?.urlContext || !Object.keys(job.urlContext).length) {
    return;
  }

  const contexts = await cleanupPreparedTabContexts(chromeApi, now);
  contexts[tabKey(tab.id)] = {
    tabId: tab.id,
    windowId: tab.windowId,
    url: tab.url || job.url || '',
    urlContext: job.urlContext,
    createdAt: now
  };

  await writeContexts(chromeApi, contexts);
}

export async function getPreparedTabContextsForTabs(chromeApi, tabs, now = Date.now()) {
  const contexts = await cleanupPreparedTabContexts(chromeApi, now);
  const matchedTabIds = [];
  const urlContexts = tabs.map((tab) => {
    const context = contexts[tabKey(tab.id)];

    if (!context) {
      return {};
    }

    matchedTabIds.push(tab.id);
    return context.urlContext || {};
  });

  return { urlContexts, matchedTabIds };
}

export async function clearPreparedTabContextsForTabIds(chromeApi, tabIds) {
  if (!Array.isArray(tabIds) || !tabIds.length) {
    return;
  }

  const contexts = await readContexts(chromeApi);
  let changed = false;

  tabIds.forEach((tabId) => {
    const key = tabKey(tabId);
    if (contexts[key]) {
      delete contexts[key];
      changed = true;
    }
  });

  if (changed) {
    await writeContexts(chromeApi, contexts);
  }
}
