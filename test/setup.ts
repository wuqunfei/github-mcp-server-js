// test/setup.ts
import nock from 'nock';
import { afterAll, beforeAll } from 'vitest';

// Guard against tests accidentally reaching the real network: any HTTP
// request that isn't matched by a registered nock interceptor should fail
// loudly instead of silently escaping to a live server (e.g. api.github.com).
// Individual test files are still responsible for registering their own
// interceptors and calling `nock.cleanAll()` in their own `afterEach` hooks;
// this only toggles the global net-connect switch for the whole test run.
beforeAll(() => {
  nock.disableNetConnect();
});

afterAll(() => {
  nock.cleanAll();
  nock.enableNetConnect();
});
