import { describe, expect, it } from 'vitest';
import { ConfigError, loadConfig } from '../../src/config.js';

describe('loadConfig', () => {
  it('throws when GITHUB_TOKEN is missing', () => {
    expect(() => loadConfig({})).toThrow(ConfigError);
  });

  it('defaults githubApiBaseUrl to api.github.com when GITHUB_SERVER_URL is unset', () => {
    const config = loadConfig({ GITHUB_TOKEN: 't' });
    expect(config.githubApiBaseUrl).toBe('https://api.github.com');
  });

  it('normalizes a bare Enterprise Server hostname to the /api/v3 base URL', () => {
    const config = loadConfig({ GITHUB_TOKEN: 't', GITHUB_SERVER_URL: 'github.mycompany.com' });
    expect(config.githubApiBaseUrl).toBe('https://github.mycompany.com/api/v3');
  });

  it('accepts a full API base URL and uses it as-is', () => {
    const config = loadConfig({
      GITHUB_TOKEN: 't',
      GITHUB_SERVER_URL: 'https://github.mycompany.com/api/v3',
    });
    expect(config.githubApiBaseUrl).toBe('https://github.mycompany.com/api/v3');
  });

  it('treats a bare "github.com" the same as unset', () => {
    const config = loadConfig({ GITHUB_TOKEN: 't', GITHUB_SERVER_URL: 'github.com' });
    expect(config.githubApiBaseUrl).toBe('https://api.github.com');
  });

  it('treats "github.com/" with a trailing slash the same as unset', () => {
    const config = loadConfig({ GITHUB_TOKEN: 't', GITHUB_SERVER_URL: 'github.com/' });
    expect(config.githubApiBaseUrl).toBe('https://api.github.com');
  });

  it('treats a full "https://github.com" URL with no path the same as unset', () => {
    const config = loadConfig({ GITHUB_TOKEN: 't', GITHUB_SERVER_URL: 'https://github.com' });
    expect(config.githubApiBaseUrl).toBe('https://api.github.com');
  });

  it('treats "GITHUB.com" case-insensitively the same as unset', () => {
    const config = loadConfig({ GITHUB_TOKEN: 't', GITHUB_SERVER_URL: 'GITHUB.com' });
    expect(config.githubApiBaseUrl).toBe('https://api.github.com');
  });

  it('defaults permission to read-write', () => {
    const config = loadConfig({ GITHUB_TOKEN: 't' });
    expect(config.permission).toBe('read-write');
  });

  it('accepts GITHUB_PERMISSION=read-only', () => {
    const config = loadConfig({ GITHUB_TOKEN: 't', GITHUB_PERMISSION: 'read-only' });
    expect(config.permission).toBe('read-only');
  });

  it('rejects an invalid GITHUB_PERMISSION value', () => {
    expect(() => loadConfig({ GITHUB_TOKEN: 't', GITHUB_PERMISSION: 'nonsense' })).toThrow(
      ConfigError,
    );
  });

  it('defaults logLevel to info', () => {
    const config = loadConfig({ GITHUB_TOKEN: 't' });
    expect(config.logLevel).toBe('info');
  });

  it('rejects an invalid LOG_LEVEL value', () => {
    expect(() => loadConfig({ GITHUB_TOKEN: 't', LOG_LEVEL: 'verbose' })).toThrow(ConfigError);
  });

  it('defaults logFormat to text', () => {
    const config = loadConfig({ GITHUB_TOKEN: 't' });
    expect(config.logFormat).toBe('text');
  });

  it('accepts LOG_FORMAT=json', () => {
    const config = loadConfig({ GITHUB_TOKEN: 't', LOG_FORMAT: 'json' });
    expect(config.logFormat).toBe('json');
  });

  it('rejects an invalid LOG_FORMAT value', () => {
    expect(() => loadConfig({ GITHUB_TOKEN: 't', LOG_FORMAT: 'yaml' })).toThrow(ConfigError);
  });
});
