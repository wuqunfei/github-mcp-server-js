import { describe, expect, it } from 'vitest';
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
  it('configures the client with the given base URL', () => {
    const octokit = buildOctokitClient(
      makeConfig({ githubApiBaseUrl: 'https://github.mycompany.com/api/v3' }),
    );
    expect(octokit.request.endpoint.DEFAULTS.baseUrl).toBe(
      'https://github.mycompany.com/api/v3',
    );
  });

  it('configures the client with the given token', () => {
    const octokit = buildOctokitClient(makeConfig({ githubToken: 'secret-token' }));
    const headers = octokit.request.endpoint.DEFAULTS.headers as Record<string, string>;
    expect(headers.authorization).toContain('secret-token');
  });
});
