import nock from 'nock';
import { afterEach, describe, expect, it } from 'vitest';
import { registerSearchTools } from '../../../src/toolsets/search.js';
import { connectedClient } from './test-helpers.js';

describe('registerSearchTools', () => {
  afterEach(() => {
    nock.cleanAll();
  });

  it('registers search_repos and returns the raw GitHub response envelope as JSON', async () => {
    nock('https://api.github.com')
      .get('/search/repositories')
      .query({ q: 'tetris language:assembly', page: '1', per_page: '30' })
      .reply(200, {
        total_count: 1,
        incomplete_results: false,
        items: [{ id: 1, full_name: 'octocat/tetris' }],
      });

    const client = await connectedClient(registerSearchTools, 'read-write');
    const result = await client.callTool({
      name: 'search_repos',
      arguments: { q: 'tetris language:assembly' },
    });

    expect(result.isError).toBeFalsy();
    const text = (result.content as Array<{ type: string; text: string }>)[0]?.text ?? '';
    expect(JSON.parse(text)).toEqual({
      total_count: 1,
      incomplete_results: false,
      items: [{ id: 1, full_name: 'octocat/tetris' }],
    });
  });

  it('forwards sort, order, and pagination on search_repos to the wire', async () => {
    const scope = nock('https://api.github.com')
      .get('/search/repositories')
      .query({
        q: 'tetris',
        sort: 'stars',
        order: 'desc',
        page: '2',
        per_page: '50',
      })
      .reply(200, { total_count: 0, incomplete_results: false, items: [] });

    const client = await connectedClient(registerSearchTools, 'read-write');
    const result = await client.callTool({
      name: 'search_repos',
      arguments: {
        q: 'tetris',
        sort: 'stars',
        order: 'desc',
        page: 2,
        per_page: 50,
      },
    });

    expect(result.isError).toBeFalsy();
    expect(scope.isDone()).toBe(true);
  });

  it('propagates a 422 (malformed query) as an MCP tool error with the raw GitHub message', async () => {
    nock('https://api.github.com')
      .get('/search/repositories')
      .query({ q: '', page: '1', per_page: '30' })
      .reply(422, {
        message: 'Validation Failed',
        documentation_url: 'https://docs.github.com/rest/search/search',
      });

    const client = await connectedClient(registerSearchTools, 'read-write');
    const result = await client.callTool({
      name: 'search_repos',
      arguments: { q: '' },
    });

    expect(result.isError).toBe(true);
    const text = (result.content as Array<{ type: string; text: string }>)[0]?.text ?? '';
    expect(text).toContain('Validation Failed');
  });

  it('registers search_code and returns the raw GitHub response envelope as JSON', async () => {
    nock('https://api.github.com')
      .get('/search/code')
      .query({ q: 'addClass repo:jquery/jquery', page: '1', per_page: '30' })
      .reply(200, {
        total_count: 2,
        incomplete_results: false,
        items: [{ path: 'src/attributes/classes.js' }, { path: 'test/unit/attributes.js' }],
      });

    const client = await connectedClient(registerSearchTools, 'read-write');
    const result = await client.callTool({
      name: 'search_code',
      arguments: { q: 'addClass repo:jquery/jquery' },
    });

    expect(result.isError).toBeFalsy();
    const text = (result.content as Array<{ type: string; text: string }>)[0]?.text ?? '';
    expect(JSON.parse(text)).toMatchObject({
      total_count: 2,
      items: expect.arrayContaining([
        expect.objectContaining({ path: 'src/attributes/classes.js' }),
      ]) as unknown,
    });
  });

  it('registers search_commits and forwards its endpoint-specific sort values', async () => {
    const scope = nock('https://api.github.com')
      .get('/search/commits')
      .query({
        q: 'repo:octocat/Spoon-Knife css',
        sort: 'committer-date',
        order: 'asc',
        page: '1',
        per_page: '30',
      })
      .reply(200, { total_count: 1, incomplete_results: false, items: [{ sha: 'abc123' }] });

    const client = await connectedClient(registerSearchTools, 'read-write');
    const result = await client.callTool({
      name: 'search_commits',
      arguments: {
        q: 'repo:octocat/Spoon-Knife css',
        sort: 'committer-date',
        order: 'asc',
      },
    });

    expect(result.isError).toBeFalsy();
    expect(scope.isDone()).toBe(true);
  });

  it('registers search_issues and forwards its issue-specific sort value', async () => {
    const scope = nock('https://api.github.com')
      .get('/search/issues')
      .query({
        q: 'windows label:bug language:python state:open',
        sort: 'created',
        order: 'asc',
        page: '1',
        per_page: '30',
      })
      .reply(200, {
        total_count: 3,
        incomplete_results: false,
        items: [{ number: 42, title: 'a bug' }],
      });

    const client = await connectedClient(registerSearchTools, 'read-write');
    const result = await client.callTool({
      name: 'search_issues',
      arguments: {
        q: 'windows label:bug language:python state:open',
        sort: 'created',
        order: 'asc',
      },
    });

    expect(result.isError).toBeFalsy();
    expect(scope.isDone()).toBe(true);
  });

  it('registers search_users and returns the raw GitHub response envelope as JSON', async () => {
    nock('https://api.github.com')
      .get('/search/users')
      .query({ q: 'tom repos:>42 followers:>1000', page: '1', per_page: '30' })
      .reply(200, {
        total_count: 1,
        incomplete_results: false,
        items: [{ login: 'tomasz', id: 7 }],
      });

    const client = await connectedClient(registerSearchTools, 'read-write');
    const result = await client.callTool({
      name: 'search_users',
      arguments: { q: 'tom repos:>42 followers:>1000' },
    });

    expect(result.isError).toBeFalsy();
    const text = (result.content as Array<{ type: string; text: string }>)[0]?.text ?? '';
    expect(JSON.parse(text)).toMatchObject({ items: [{ login: 'tomasz' }] });
  });

  it('registers exactly the 5 search tools in read-only mode (and the same set in read-write)', async () => {
    const expected = [
      'search_code',
      'search_commits',
      'search_issues',
      'search_repos',
      'search_users',
    ];

    const readOnlyClient = await connectedClient(registerSearchTools, 'read-only');
    const readOnlyTools = await readOnlyClient.listTools();
    expect(readOnlyTools.tools.map((t) => t.name).sort()).toEqual(expected);

    const readWriteClient = await connectedClient(registerSearchTools, 'read-write');
    const readWriteTools = await readWriteClient.listTools();
    expect(readWriteTools.tools.map((t) => t.name).sort()).toEqual(expected);
  });
});
