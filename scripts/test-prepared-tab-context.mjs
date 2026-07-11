import assert from 'assert';
import {
  PREPARED_TAB_CONTEXT_TTL_MS,
  cleanupPreparedTabContexts,
  clearPreparedTabContextsForTabIds,
  getPreparedTabContextsForTabs,
  rememberPreparedTabContext
} from '../background/prepared-tab-context.js';

let sessionStorageMock = {};

const chromeMock = {
  storage: {
    session: {
      get: async (key) => ({ [key]: sessionStorageMock[key] }),
      set: async (value) => {
        sessionStorageMock = { ...sessionStorageMock, ...value };
      }
    }
  }
};

async function runTests() {
  console.log('Testing prepared tab contexts...');

  const createdAt = 1_000_000;
  await rememberPreparedTabContext(
    chromeMock,
    { id: 10, windowId: 1, url: 'https://example.com/search?q=alpha' },
    { url: 'https://example.com/search', urlContext: { keyword: 'alpha' } },
    createdAt
  );

  let result = await getPreparedTabContextsForTabs(
    chromeMock,
    [
      { id: 9, url: 'https://example.com/other' },
      { id: 10, url: 'https://example.com/search?q=alpha' }
    ],
    createdAt + 1000
  );

  assert.deepStrictEqual(result.urlContexts, [{}, { keyword: 'alpha' }], 'Should match context by tab id');
  assert.deepStrictEqual(result.matchedTabIds, [10], 'Should return matched tab ids');

  await clearPreparedTabContextsForTabIds(chromeMock, result.matchedTabIds);
  result = await getPreparedTabContextsForTabs(chromeMock, [{ id: 10 }], createdAt + 2000);
  assert.deepStrictEqual(result.urlContexts, [{}], 'Should clear consumed contexts');

  await rememberPreparedTabContext(
    chromeMock,
    { id: 11, windowId: 1, url: 'https://example.com/search?q=old' },
    { url: 'https://example.com/search', urlContext: { keyword: 'old' } },
    createdAt
  );
  await cleanupPreparedTabContexts(chromeMock, createdAt + PREPARED_TAB_CONTEXT_TTL_MS + 1);
  result = await getPreparedTabContextsForTabs(chromeMock, [{ id: 11 }], createdAt + PREPARED_TAB_CONTEXT_TTL_MS + 2);
  assert.deepStrictEqual(result.urlContexts, [{}], 'Should remove contexts older than 3 hours');

  console.log('All prepared tab context tests passed!');
}

runTests().catch((error) => {
  console.error('Prepared tab context test failed:', error);
  process.exit(1);
});
