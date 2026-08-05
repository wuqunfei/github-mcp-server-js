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
});
