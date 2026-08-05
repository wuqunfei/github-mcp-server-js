import nock from 'nock';
import { afterEach, describe, expect, it } from 'vitest';
import { registerActivityTools } from '../../../src/toolsets/activity.js';
import { connectedClient } from './test-helpers.js';

describe('registerActivityTools', () => {
  afterEach(() => {
    nock.cleanAll();
  });

  it('registers list_notifications and returns the raw GitHub response as JSON', async () => {
    nock('https://api.github.com')
      .get('/notifications')
      .query({ page: '1', per_page: '30', all: 'false' })
      .reply(200, [
        {
          id: '1',
          unread: true,
          reason: 'subscribed',
          updated_at: '2024-09-25T07:54:00Z',
          subject: {
            title: 'Greetings',
            type: 'Issue',
            url: 'https://api.github.com/repos/octokit/octokit.rb/issues/123',
          },
          repository: {
            id: 1296269,
            name: 'Hello-World',
            full_name: 'octocat/Hello-World',
          },
        },
      ]);

    const client = await connectedClient(registerActivityTools, 'read-write');
    const result = await client.callTool({
      name: 'list_notifications',
      arguments: {},
    });

    expect(result.isError).toBeFalsy();
    const text = (result.content as Array<{ type: string; text: string }>)[0]?.text ?? '';
    const parsed = JSON.parse(text) as Array<{ id: string; unread: boolean }>;
    expect(parsed).toHaveLength(1);
    expect(parsed[0]).toMatchObject({ id: '1', unread: true, reason: 'subscribed' });
  });

  it('forwards explicit page and per_page to list_notifications on the wire', async () => {
    const scope = nock('https://api.github.com')
      .get('/notifications')
      .query({ page: '2', per_page: '10', all: 'false' })
      .reply(200, []);

    const client = await connectedClient(registerActivityTools, 'read-write');
    const result = await client.callTool({
      name: 'list_notifications',
      arguments: { page: 2, per_page: 10 },
    });

    expect(result.isError).toBeFalsy();
    expect(scope.isDone()).toBe(true);
  });

  it('forwards all=true to list_notifications on the wire', async () => {
    const scope = nock('https://api.github.com')
      .get('/notifications')
      .query({ page: '1', per_page: '30', all: 'true' })
      .reply(200, []);

    const client = await connectedClient(registerActivityTools, 'read-write');
    const result = await client.callTool({
      name: 'list_notifications',
      arguments: { all: true },
    });

    expect(result.isError).toBeFalsy();
    expect(scope.isDone()).toBe(true);
  });

  it('propagates a 401 from list_notifications as an MCP tool error', async () => {
    nock('https://api.github.com')
      .get('/notifications')
      .query(true)
      .reply(401, {
        message: 'Requires authentication',
        documentation_url: 'https://docs.github.com/rest',
      });

    const client = await connectedClient(registerActivityTools, 'read-write');
    const result = await client.callTool({
      name: 'list_notifications',
      arguments: {},
    });

    expect(result.isError).toBe(true);
    const text = (result.content as Array<{ type: string; text: string }>)[0]?.text ?? '';
    expect(text).toContain('Requires authentication');
  });

  it('registers list_starred_repos and returns the raw GitHub response as JSON', async () => {
    nock('https://api.github.com')
      .get('/user/starred')
      .query({ page: '1', per_page: '30' })
      .reply(200, [
        {
          id: 1296269,
          name: 'Hello-World',
          full_name: 'octocat/Hello-World',
          html_url: 'https://github.com/octocat/Hello-World',
          description: 'This your first repo!',
          stargazers_count: 80,
          private: false,
        },
      ]);

    const client = await connectedClient(registerActivityTools, 'read-write');
    const result = await client.callTool({
      name: 'list_starred_repos',
      arguments: {},
    });

    expect(result.isError).toBeFalsy();
    const text = (result.content as Array<{ type: string; text: string }>)[0]?.text ?? '';
    expect(JSON.parse(text)).toMatchObject([
      { id: 1296269, full_name: 'octocat/Hello-World' },
    ]);
  });

  it('forwards sort and direction to list_starred_repos on the wire', async () => {
    const scope = nock('https://api.github.com')
      .get('/user/starred')
      .query({ page: '1', per_page: '30', sort: 'updated', direction: 'asc' })
      .reply(200, []);

    const client = await connectedClient(registerActivityTools, 'read-write');
    const result = await client.callTool({
      name: 'list_starred_repos',
      arguments: { sort: 'updated', direction: 'asc' },
    });

    expect(result.isError).toBeFalsy();
    expect(scope.isDone()).toBe(true);
  });

  it('registers check_repo_starred and returns { starred: true } when the repo is starred', async () => {
    nock('https://api.github.com')
      .get('/user/starred/octocat/Hello-World')
      .reply(204);

    const client = await connectedClient(registerActivityTools, 'read-write');
    const result = await client.callTool({
      name: 'check_repo_starred',
      arguments: { owner: 'octocat', repo: 'Hello-World' },
    });

    expect(result.isError).toBeFalsy();
    const text = (result.content as Array<{ type: string; text: string }>)[0]?.text ?? '';
    expect(JSON.parse(text)).toEqual({ starred: true });
  });

  it('returns { starred: false } (not an error) when the repo is not starred (404)', async () => {
    nock('https://api.github.com')
      .get('/user/starred/octocat/Hello-World')
      .reply(404, {
        message: 'Not Found',
        documentation_url: 'https://docs.github.com/rest',
      });

    const client = await connectedClient(registerActivityTools, 'read-write');
    const result = await client.callTool({
      name: 'check_repo_starred',
      arguments: { owner: 'octocat', repo: 'Hello-World' },
    });

    expect(result.isError).toBeFalsy();
    const text = (result.content as Array<{ type: string; text: string }>)[0]?.text ?? '';
    expect(JSON.parse(text)).toEqual({ starred: false });
  });

  it('propagates a 401 from check_repo_starred as an MCP tool error', async () => {
    nock('https://api.github.com')
      .get('/user/starred/octocat/Hello-World')
      .reply(401, {
        message: 'Requires authentication',
        documentation_url: 'https://docs.github.com/rest',
      });

    const client = await connectedClient(registerActivityTools, 'read-write');
    const result = await client.callTool({
      name: 'check_repo_starred',
      arguments: { owner: 'octocat', repo: 'Hello-World' },
    });

    expect(result.isError).toBe(true);
    const text = (result.content as Array<{ type: string; text: string }>)[0]?.text ?? '';
    expect(text).toContain('Requires authentication');
  });

  it('registers exactly 3 read tools in read-only mode', async () => {
    const client = await connectedClient(registerActivityTools, 'read-only');
    const { tools } = await client.listTools();
    expect(tools.map((t) => t.name).sort()).toEqual([
      'check_repo_starred',
      'list_notifications',
      'list_starred_repos',
    ]);
  });

  it('registers star_repo and returns { starred: true }', async () => {
    nock('https://api.github.com')
      .put('/user/starred/octocat/Hello-World')
      .reply(204);

    const client = await connectedClient(registerActivityTools, 'read-write');
    const result = await client.callTool({
      name: 'star_repo',
      arguments: { owner: 'octocat', repo: 'Hello-World' },
    });

    expect(result.isError).toBeFalsy();
    const text = (result.content as Array<{ type: string; text: string }>)[0]?.text ?? '';
    expect(JSON.parse(text)).toEqual({ starred: true });
  });

  it('propagates a 404 from star_repo as an MCP tool error', async () => {
    nock('https://api.github.com')
      .put('/user/starred/octocat/nonexistent-repo-xyz')
      .reply(404, {
        message: 'Not Found',
        documentation_url: 'https://docs.github.com/rest',
      });

    const client = await connectedClient(registerActivityTools, 'read-write');
    const result = await client.callTool({
      name: 'star_repo',
      arguments: { owner: 'octocat', repo: 'nonexistent-repo-xyz' },
    });

    expect(result.isError).toBe(true);
    const text = (result.content as Array<{ type: string; text: string }>)[0]?.text ?? '';
    expect(text).toContain('Not Found');
  });

  it('registers unstar_repo and returns { starred: false }', async () => {
    nock('https://api.github.com')
      .delete('/user/starred/octocat/Hello-World')
      .reply(204);

    const client = await connectedClient(registerActivityTools, 'read-write');
    const result = await client.callTool({
      name: 'unstar_repo',
      arguments: { owner: 'octocat', repo: 'Hello-World' },
    });

    expect(result.isError).toBeFalsy();
    const text = (result.content as Array<{ type: string; text: string }>)[0]?.text ?? '';
    expect(JSON.parse(text)).toEqual({ starred: false });
  });

  it('propagates a 401 from unstar_repo as an MCP tool error', async () => {
    nock('https://api.github.com')
      .delete('/user/starred/octocat/Hello-World')
      .reply(401, {
        message: 'Requires authentication',
        documentation_url: 'https://docs.github.com/rest',
      });

    const client = await connectedClient(registerActivityTools, 'read-write');
    const result = await client.callTool({
      name: 'unstar_repo',
      arguments: { owner: 'octocat', repo: 'Hello-World' },
    });

    expect(result.isError).toBe(true);
    const text = (result.content as Array<{ type: string; text: string }>)[0]?.text ?? '';
    expect(text).toContain('Requires authentication');
  });

  it('does not register any write tool in read-only mode', async () => {
    const client = await connectedClient(registerActivityTools, 'read-only');
    const { tools } = await client.listTools();
    const names = tools.map((t) => t.name);
    expect(names).not.toContain('star_repo');
    expect(names).not.toContain('unstar_repo');
  });

  it('registers all 5 activity tools in read-write mode', async () => {
    const client = await connectedClient(registerActivityTools, 'read-write');
    const { tools } = await client.listTools();
    expect(tools.map((t) => t.name).sort()).toEqual([
      'check_repo_starred',
      'list_notifications',
      'list_starred_repos',
      'star_repo',
      'unstar_repo',
    ]);
  });
});
