import nock from 'nock';
import { afterEach, describe, expect, it } from 'vitest';
import { registerMiscTools } from '../../../src/toolsets/misc.js';
import { connectedClient } from './test-helpers.js';

describe('registerMiscTools', () => {
  afterEach(() => {
    nock.cleanAll();
  });

  // ── get_rate_limit ─────────────────────────────────────────────────────────

  it('registers get_rate_limit and returns the raw rate-limit-overview object as JSON', async () => {
    nock('https://api.github.com')
      .get('/rate_limit')
      .reply(200, {
        resources: {
          core: { limit: 5000, used: 10, remaining: 4990, reset: 1640995200 },
          search: { limit: 30, used: 0, remaining: 30, reset: 1640995200 },
          graphql: { limit: 5000, used: 0, remaining: 5000, reset: 1640995200 },
        },
        rate: { limit: 5000, used: 10, remaining: 4990, reset: 1640995200 },
      });

    const client = await connectedClient(registerMiscTools, 'read-write');
    const result = await client.callTool({ name: 'get_rate_limit', arguments: {} });

    expect(result.isError).toBeFalsy();
    const text = (result.content as Array<{ type: string; text: string }>)[0]?.text ?? '';
    const parsed = JSON.parse(text) as {
      resources: { core: { remaining: number } };
      rate: { remaining: number };
    };
    expect(parsed.resources.core.remaining).toBe(4990);
    expect(parsed.rate.remaining).toBe(4990);
  });

  it('propagates a 404 from get_rate_limit as an MCP tool error', async () => {
    nock('https://api.github.com')
      .get('/rate_limit')
      .reply(404, { message: 'Not Found', documentation_url: 'https://docs.github.com/rest' });

    const client = await connectedClient(registerMiscTools, 'read-write');
    const result = await client.callTool({ name: 'get_rate_limit', arguments: {} });

    expect(result.isError).toBe(true);
    const text = (result.content as Array<{ type: string; text: string }>)[0]?.text ?? '';
    expect(text).toContain('Not Found');
  });

  // ── get_meta ───────────────────────────────────────────────────────────────

  it('registers get_meta and returns the raw api-overview object as JSON', async () => {
    nock('https://api.github.com')
      .get('/meta')
      .reply(200, {
        verifiable_password_authentication: true,
        ssh_key_fingerprints: {
          SHA256_RSA: 'abc123',
          SHA256_ECDSA: 'def456',
        },
        ssh_keys: ['ssh-rsa AAAA...'],
        hooks: ['192.30.252.0/22'],
        web: ['192.30.252.0/22'],
        api: ['192.30.252.0/22'],
        git: ['192.30.252.0/22'],
        packages: ['192.30.252.0/22'],
        pages: ['192.30.252.0/22'],
        importer: ['192.30.252.0/22'],
        actions: ['192.30.252.0/22'],
        dependabot: ['192.30.252.0/22'],
      });

    const client = await connectedClient(registerMiscTools, 'read-write');
    const result = await client.callTool({ name: 'get_meta', arguments: {} });

    expect(result.isError).toBeFalsy();
    const text = (result.content as Array<{ type: string; text: string }>)[0]?.text ?? '';
    const parsed = JSON.parse(text) as {
      verifiable_password_authentication: boolean;
      hooks: string[];
    };
    expect(parsed.verifiable_password_authentication).toBe(true);
    expect(parsed.hooks).toContain('192.30.252.0/22');
  });

  it('propagates a 304 from get_meta as an MCP tool error', async () => {
    nock('https://api.github.com').get('/meta').reply(304);

    const client = await connectedClient(registerMiscTools, 'read-write');
    const result = await client.callTool({ name: 'get_meta', arguments: {} });

    // Octokit throws a RequestError for 304 ("Not modified") — surfaces as tool error.
    expect(result.isError).toBe(true);
    const text = (result.content as Array<{ type: string; text: string }>)[0]?.text ?? '';
    expect(text).toContain('Not modified');
  });

  // ── list_emojis ────────────────────────────────────────────────────────────

  it('registers list_emojis and returns the raw emoji map as JSON', async () => {
    nock('https://api.github.com')
      .get('/emojis')
      .reply(200, {
        '+1': 'https://github.githubassets.com/images/icons/emoji/unicode/1f44d.png',
        '-1': 'https://github.githubassets.com/images/icons/emoji/unicode/1f44e.png',
        smile: 'https://github.githubassets.com/images/icons/emoji/unicode/1f604.png',
        octocat: 'https://github.githubassets.com/images/icons/emoji/octocat.png',
      });

    const client = await connectedClient(registerMiscTools, 'read-write');
    const result = await client.callTool({ name: 'list_emojis', arguments: {} });

    expect(result.isError).toBeFalsy();
    const text = (result.content as Array<{ type: string; text: string }>)[0]?.text ?? '';
    const parsed = JSON.parse(text) as Record<string, string>;
    expect(parsed['smile']).toContain('1f604');
    expect(parsed['octocat']).toContain('octocat.png');
  });

  it('propagates a 304 from list_emojis as an MCP tool error', async () => {
    nock('https://api.github.com').get('/emojis').reply(304);

    const client = await connectedClient(registerMiscTools, 'read-write');
    const result = await client.callTool({ name: 'list_emojis', arguments: {} });

    expect(result.isError).toBe(true);
    const text = (result.content as Array<{ type: string; text: string }>)[0]?.text ?? '';
    expect(text).toContain('Not modified');
  });

  // ── render_markdown ────────────────────────────────────────────────────────

  it('registers render_markdown and returns the raw HTML string (not double-encoded JSON)', async () => {
    const htmlResponse = '<p>Hello <strong>world</strong></p>\n';
    nock('https://api.github.com')
      .post('/markdown', { text: '**world**' })
      .reply(200, htmlResponse, { 'Content-Type': 'text/html; charset=utf-8' });

    const client = await connectedClient(registerMiscTools, 'read-write');
    const result = await client.callTool({
      name: 'render_markdown',
      arguments: { text: '**world**' },
    });

    expect(result.isError).toBeFalsy();
    const text = (result.content as Array<{ type: string; text: string }>)[0]?.text ?? '';
    // The raw HTML must be returned as-is, NOT as a JSON-encoded string.
    // Correct:   '<p>Hello <strong>world</strong></p>\n'
    // Wrong:     '"<p>Hello <strong>world</strong></p>\\n"'
    expect(text).toBe(htmlResponse);
    expect(text).not.toBe(JSON.stringify(htmlResponse));
  });

  it('forwards mode and context to the markdown render endpoint', async () => {
    const scope = nock('https://api.github.com')
      .post('/markdown', {
        text: 'See #42',
        mode: 'gfm',
        context: 'octo-org/octo-repo',
      })
      .reply(200, '<p>See <a href="...">octo-org/octo-repo#42</a></p>\n', {
        'Content-Type': 'text/html; charset=utf-8',
      });

    const client = await connectedClient(registerMiscTools, 'read-write');
    const result = await client.callTool({
      name: 'render_markdown',
      arguments: { text: 'See #42', mode: 'gfm', context: 'octo-org/octo-repo' },
    });

    expect(result.isError).toBeFalsy();
    expect(scope.isDone()).toBe(true);
    const text = (result.content as Array<{ type: string; text: string }>)[0]?.text ?? '';
    expect(text).toContain('octo-org/octo-repo#42');
  });

  it('propagates a 400 from render_markdown as an MCP tool error', async () => {
    nock('https://api.github.com')
      .post('/markdown')
      .reply(400, {
        message: 'Problems parsing JSON',
        documentation_url: 'https://docs.github.com/rest',
      });

    const client = await connectedClient(registerMiscTools, 'read-write');
    const result = await client.callTool({
      name: 'render_markdown',
      arguments: { text: '' },
    });

    expect(result.isError).toBe(true);
    const text = (result.content as Array<{ type: string; text: string }>)[0]?.text ?? '';
    expect(text).toContain('Problems parsing JSON');
  });

  // ── registration count ─────────────────────────────────────────────────────

  it('registers exactly the 4 misc tools in read-only mode (and the same set in read-write)', async () => {
    const expected = ['get_meta', 'get_rate_limit', 'list_emojis', 'render_markdown'];

    const readOnlyClient = await connectedClient(registerMiscTools, 'read-only');
    const readOnlyTools = await readOnlyClient.listTools();
    expect(readOnlyTools.tools.map((t) => t.name).sort()).toEqual(expected);

    const readWriteClient = await connectedClient(registerMiscTools, 'read-write');
    const readWriteTools = await readWriteClient.listTools();
    expect(readWriteTools.tools.map((t) => t.name).sort()).toEqual(expected);
  });
});
