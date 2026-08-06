import nock from 'nock';
import { afterEach, describe, expect, it } from 'vitest';
import { registerCodeSecurityTools } from '../../../src/toolsets/code_security.js';
import { connectedClient } from './test-helpers.js';

describe('registerCodeSecurityTools', () => {
  afterEach(() => nock.cleanAll());

  it('list_code_scanning_alerts returns raw JSON', async () => {
    nock('https://api.github.com')
      .get('/repos/acme/foo/code-scanning/alerts')
      .query({ page: '1', per_page: '30' })
      .reply(200, [{ number: 1, state: 'open' }]);

    const client = await connectedClient(registerCodeSecurityTools, 'read-write');
    const result = await client.callTool({
      name: 'list_code_scanning_alerts',
      arguments: { owner: 'acme', repo: 'foo' },
    });
    expect(result.isError).toBeFalsy();
    const text = (result.content as Array<{ type: string; text: string }>)[0]?.text ?? '';
    expect(JSON.parse(text)).toEqual([{ number: 1, state: 'open' }]);
  });

  it('list_code_scanning_alerts forwards filter/sort to the wire', async () => {
    const scope = nock('https://api.github.com')
      .get('/repos/acme/foo/code-scanning/alerts')
      .query({
        tool_name: 'codeql',
        state: 'open',
        sort: 'created',
        direction: 'desc',
        page: '1',
        per_page: '30',
      })
      .reply(200, []);
    const client = await connectedClient(registerCodeSecurityTools, 'read-write');
    const result = await client.callTool({
      name: 'list_code_scanning_alerts',
      arguments: {
        owner: 'acme',
        repo: 'foo',
        tool_name: 'codeql',
        state: 'open',
        sort: 'created',
        direction: 'desc',
      },
    });
    expect(result.isError).toBeFalsy();
    expect(scope.isDone()).toBe(true);
  });

  it('get_code_scanning_alert returns raw JSON', async () => {
    nock('https://api.github.com')
      .get('/repos/acme/foo/code-scanning/alerts/1')
      .reply(200, { number: 1, rule: { id: 'js/xss' } });
    const client = await connectedClient(registerCodeSecurityTools, 'read-write');
    const result = await client.callTool({
      name: 'get_code_scanning_alert',
      arguments: { owner: 'acme', repo: 'foo', alert_number: 1 },
    });
    expect(result.isError).toBeFalsy();
    const text = (result.content as Array<{ type: string; text: string }>)[0]?.text ?? '';
    expect(JSON.parse(text)).toMatchObject({ number: 1 });
  });

  it('propagates a 404 from get_code_scanning_alert', async () => {
    nock('https://api.github.com')
      .get('/repos/acme/foo/code-scanning/alerts/999')
      .reply(404, { message: 'Not Found' });
    const client = await connectedClient(registerCodeSecurityTools, 'read-write');
    const result = await client.callTool({
      name: 'get_code_scanning_alert',
      arguments: { owner: 'acme', repo: 'foo', alert_number: 999 },
    });
    expect(result.isError).toBe(true);
    const text = (result.content as Array<{ type: string; text: string }>)[0]?.text ?? '';
    expect(text).toContain('Not Found');
  });

  it('list_secret_scanning_alerts returns raw JSON', async () => {
    nock('https://api.github.com')
      .get('/repos/acme/foo/secret-scanning/alerts')
      .query({ page: '1', per_page: '30' })
      .reply(200, [{ number: 1, secret_type: 'github_pat' }]);
    const client = await connectedClient(registerCodeSecurityTools, 'read-write');
    const result = await client.callTool({
      name: 'list_secret_scanning_alerts',
      arguments: { owner: 'acme', repo: 'foo' },
    });
    expect(result.isError).toBeFalsy();
  });

  it('get_secret_scanning_alert returns raw JSON', async () => {
    nock('https://api.github.com')
      .get('/repos/acme/foo/secret-scanning/alerts/1')
      .reply(200, { number: 1, secret_type: 'github_pat' });
    const client = await connectedClient(registerCodeSecurityTools, 'read-write');
    const result = await client.callTool({
      name: 'get_secret_scanning_alert',
      arguments: { owner: 'acme', repo: 'foo', alert_number: 1 },
    });
    expect(result.isError).toBeFalsy();
  });

  it('list_dependabot_alerts returns raw JSON', async () => {
    nock('https://api.github.com')
      .get('/repos/acme/foo/dependabot/alerts')
      .query({ page: '1', per_page: '30' })
      .reply(200, [{ number: 1, state: 'open' }]);
    const client = await connectedClient(registerCodeSecurityTools, 'read-write');
    const result = await client.callTool({
      name: 'list_dependabot_alerts',
      arguments: { owner: 'acme', repo: 'foo' },
    });
    expect(result.isError).toBeFalsy();
  });

  it('get_dependabot_alert returns raw JSON', async () => {
    nock('https://api.github.com')
      .get('/repos/acme/foo/dependabot/alerts/1')
      .reply(200, { number: 1, state: 'open' });
    const client = await connectedClient(registerCodeSecurityTools, 'read-write');
    const result = await client.callTool({
      name: 'get_dependabot_alert',
      arguments: { owner: 'acme', repo: 'foo', alert_number: 1 },
    });
    expect(result.isError).toBeFalsy();
  });

  it('list_global_advisories returns raw JSON', async () => {
    nock('https://api.github.com')
      .get('/advisories')
      .query({ page: '1', per_page: '30' })
      .reply(200, [{ ghsa_id: 'GHSA-xxxx-yyyy-zzzz' }]);
    const client = await connectedClient(registerCodeSecurityTools, 'read-write');
    const result = await client.callTool({
      name: 'list_global_advisories',
      arguments: {},
    });
    expect(result.isError).toBeFalsy();
  });

  it('get_global_advisory returns raw JSON', async () => {
    nock('https://api.github.com')
      .get('/advisories/GHSA-xxxx-yyyy-zzzz')
      .reply(200, { ghsa_id: 'GHSA-xxxx-yyyy-zzzz' });
    const client = await connectedClient(registerCodeSecurityTools, 'read-write');
    const result = await client.callTool({
      name: 'get_global_advisory',
      arguments: { ghsa_id: 'GHSA-xxxx-yyyy-zzzz' },
    });
    expect(result.isError).toBeFalsy();
  });

  it('list_repository_advisories returns raw JSON', async () => {
    nock('https://api.github.com')
      .get('/repos/acme/foo/security-advisories')
      .query({ page: '1', per_page: '30' })
      .reply(200, [{ ghsa_id: 'GHSA-xxxx-yyyy-zzzz' }]);
    const client = await connectedClient(registerCodeSecurityTools, 'read-write');
    const result = await client.callTool({
      name: 'list_repository_advisories',
      arguments: { owner: 'acme', repo: 'foo' },
    });
    expect(result.isError).toBeFalsy();
  });

  it('get_repository_advisory returns raw JSON', async () => {
    nock('https://api.github.com')
      .get('/repos/acme/foo/security-advisories/GHSA-xxxx-yyyy-zzzz')
      .reply(200, { ghsa_id: 'GHSA-xxxx-yyyy-zzzz' });
    const client = await connectedClient(registerCodeSecurityTools, 'read-write');
    const result = await client.callTool({
      name: 'get_repository_advisory',
      arguments: { owner: 'acme', repo: 'foo', ghsa_id: 'GHSA-xxxx-yyyy-zzzz' },
    });
    expect(result.isError).toBeFalsy();
  });

  it('registers exactly the 10 tools in both permission modes', async () => {
    const expected = [
      'get_code_scanning_alert',
      'get_dependabot_alert',
      'get_global_advisory',
      'get_repository_advisory',
      'get_secret_scanning_alert',
      'list_code_scanning_alerts',
      'list_dependabot_alerts',
      'list_global_advisories',
      'list_repository_advisories',
      'list_secret_scanning_alerts',
    ];
    const ro = await connectedClient(registerCodeSecurityTools, 'read-only');
    expect((await ro.listTools()).tools.map((t) => t.name).sort()).toEqual(expected);
    const rw = await connectedClient(registerCodeSecurityTools, 'read-write');
    expect((await rw.listTools()).tools.map((t) => t.name).sort()).toEqual(expected);
  });
});
