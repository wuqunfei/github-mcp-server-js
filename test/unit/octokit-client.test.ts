import nock from 'nock';
import { afterEach, describe, expect, it } from 'vitest';
import type { Config } from '../../src/config.js';
import { buildOctokitClient } from '../../src/octokit-client.js';

function makeConfig(overrides: Partial<Config> = {}): Config {
  return {
    githubToken: 'test-token',
    githubApiBaseUrl: 'https://api.github.com',
    permission: 'read-write',
    logLevel: 'info',
    logFormat: 'text',
    ...overrides,
  };
}

describe('buildOctokitClient', () => {
  afterEach(() => {
    nock.cleanAll();
  });

  it('configures the client with the given base URL', () => {
    const octokit = buildOctokitClient(
      makeConfig({ githubApiBaseUrl: 'https://github.mycompany.com/api/v3' }),
    );
    expect(octokit.request.endpoint.DEFAULTS.baseUrl).toBe(
      'https://github.mycompany.com/api/v3',
    );
  });

  it('configures the client with the given token', async () => {
    const octokit = buildOctokitClient(makeConfig({ githubToken: 'secret-token' }));
    let capturedAuthHeader: string | undefined;
    nock('https://api.github.com')
      .get('/octocat')
      .reply(function () {
        capturedAuthHeader = this.req.headers['authorization'] as string;
        return [200, {}];
      });

    await octokit.request('GET /octocat');

    expect(capturedAuthHeader).toBe('token secret-token');
  });

  it('does not retry a 409 (merge-conflict-equivalent) response', async () => {
    // Uses a plain GET endpoint rather than the actual merge endpoint so this
    // test only exercises the retry plugin's doNotRetry behavior, without
    // also going through @octokit/plugin-throttling's write/notification
    // Bottleneck queues (which add real elapsed delay unrelated to retry).
    const octokit = buildOctokitClient(makeConfig());
    let requestCount = 0;
    nock('https://api.github.com')
      .get('/octocat')
      .reply(() => {
        requestCount += 1;
        return [409, { message: 'Conflict' }];
      });

    await expect(octokit.request('GET /octocat')).rejects.toMatchObject({ status: 409 });

    expect(requestCount).toBe(1);
  });

  it('does not retry a 405 (not-mergeable-equivalent) response', async () => {
    const octokit = buildOctokitClient(makeConfig());
    let requestCount = 0;
    nock('https://api.github.com')
      .get('/octocat')
      .reply(() => {
        requestCount += 1;
        return [405, { message: 'Method Not Allowed' }];
      });

    await expect(octokit.request('GET /octocat')).rejects.toMatchObject({ status: 405 });

    expect(requestCount).toBe(1);
  });
});
