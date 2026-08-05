import nock from 'nock';
import { afterEach, describe, expect, it } from 'vitest';
import { registerAppsTools } from '../../../src/toolsets/apps.js';
import { connectedClient } from './test-helpers.js';

describe('registerAppsTools', () => {
  afterEach(() => {
    nock.cleanAll();
  });

  // ── get_app ────────────────────────────────────────────────────────────────

  it('registers get_app and returns the raw integration object as JSON', async () => {
    nock('https://api.github.com')
      .get('/apps/my-cool-app')
      .reply(200, {
        id: 1,
        slug: 'my-cool-app',
        node_id: 'MDExOkludGVncmF0aW9uMQ==',
        name: 'My Cool App',
        description: 'A test GitHub App',
        external_url: 'https://example.com',
        html_url: 'https://github.com/apps/my-cool-app',
        created_at: '2022-01-01T00:00:00Z',
        updated_at: '2022-06-01T00:00:00Z',
        permissions: { issues: 'read', pull_requests: 'write' },
        events: ['push', 'pull_request'],
        installations_count: 5,
        owner: {
          login: 'octocat',
          id: 1,
          node_id: 'MDQ6VXNlcjE=',
          avatar_url: 'https://github.com/images/error/octocat_happy.gif',
          gravatar_id: '',
          url: 'https://api.github.com/users/octocat',
          html_url: 'https://github.com/octocat',
          type: 'User',
          site_admin: false,
        },
      });

    const client = await connectedClient(registerAppsTools, 'read-write');
    const result = await client.callTool({
      name: 'get_app',
      arguments: { app_slug: 'my-cool-app' },
    });

    expect(result.isError).toBeFalsy();
    const text = (result.content as Array<{ type: string; text: string }>)[0]?.text ?? '';
    const parsed = JSON.parse(text) as { id: number; name: string; installations_count: number };
    expect(parsed.id).toBe(1);
    expect(parsed.name).toBe('My Cool App');
    expect(parsed.installations_count).toBe(5);
  });

  it('propagates a 404 from get_app as an MCP tool error', async () => {
    nock('https://api.github.com')
      .get('/apps/nonexistent-app')
      .reply(404, { message: 'Not Found', documentation_url: 'https://docs.github.com/rest' });

    const client = await connectedClient(registerAppsTools, 'read-write');
    const result = await client.callTool({
      name: 'get_app',
      arguments: { app_slug: 'nonexistent-app' },
    });

    expect(result.isError).toBe(true);
    const text = (result.content as Array<{ type: string; text: string }>)[0]?.text ?? '';
    expect(text).toContain('Not Found');
  });

  // ── list_installations_for_authenticated_user ──────────────────────────────

  it('registers list_installations_for_authenticated_user and returns the raw response as JSON', async () => {
    nock('https://api.github.com')
      .get('/user/installations')
      .query({ page: '1', per_page: '30' })
      .reply(200, {
        total_count: 2,
        installations: [
          {
            id: 100,
            app_id: 1,
            app_slug: 'my-cool-app',
            target_id: 42,
            target_type: 'User',
            repository_selection: 'all',
            access_tokens_url: 'https://api.github.com/app/installations/100/access_tokens',
            repositories_url: 'https://api.github.com/installation/repositories',
            html_url: 'https://github.com/settings/installations/100',
            permissions: { issues: 'read' },
            events: ['push'],
            created_at: '2022-01-01T00:00:00Z',
            updated_at: '2022-06-01T00:00:00Z',
            single_file_name: null,
            suspended_by: null,
            suspended_at: null,
          },
          {
            id: 101,
            app_id: 2,
            app_slug: 'another-app',
            target_id: 99,
            target_type: 'Organization',
            repository_selection: 'selected',
            access_tokens_url: 'https://api.github.com/app/installations/101/access_tokens',
            repositories_url: 'https://api.github.com/installation/repositories',
            html_url: 'https://github.com/organizations/test-org/settings/installations/101',
            permissions: { contents: 'read', pull_requests: 'write' },
            events: ['pull_request'],
            created_at: '2023-01-01T00:00:00Z',
            updated_at: '2023-06-01T00:00:00Z',
            single_file_name: null,
            suspended_by: null,
            suspended_at: null,
          },
        ],
      });

    const client = await connectedClient(registerAppsTools, 'read-write');
    const result = await client.callTool({
      name: 'list_installations_for_authenticated_user',
      arguments: {},
    });

    expect(result.isError).toBeFalsy();
    const text = (result.content as Array<{ type: string; text: string }>)[0]?.text ?? '';
    const parsed = JSON.parse(text) as {
      total_count: number;
      installations: Array<{ id: number; app_slug: string }>;
    };
    expect(parsed.total_count).toBe(2);
    expect(parsed.installations).toHaveLength(2);
    expect(parsed.installations[0]).toMatchObject({ id: 100, app_slug: 'my-cool-app' });
  });

  it('forwards pagination on list_installations_for_authenticated_user to the wire', async () => {
    const scope = nock('https://api.github.com')
      .get('/user/installations')
      .query({ page: '2', per_page: '10' })
      .reply(200, { total_count: 0, installations: [] });

    const client = await connectedClient(registerAppsTools, 'read-write');
    const result = await client.callTool({
      name: 'list_installations_for_authenticated_user',
      arguments: { page: 2, per_page: 10 },
    });

    expect(result.isError).toBeFalsy();
    expect(scope.isDone()).toBe(true);
  });

  it('propagates a 401 from list_installations_for_authenticated_user as an MCP tool error', async () => {
    nock('https://api.github.com')
      .get('/user/installations')
      .query({ page: '1', per_page: '30' })
      .reply(401, {
        message: 'Requires authentication',
        documentation_url: 'https://docs.github.com/rest',
      });

    const client = await connectedClient(registerAppsTools, 'read-write');
    const result = await client.callTool({
      name: 'list_installations_for_authenticated_user',
      arguments: {},
    });

    expect(result.isError).toBe(true);
    const text = (result.content as Array<{ type: string; text: string }>)[0]?.text ?? '';
    expect(text).toContain('Requires authentication');
  });

  // ── list_installation_repos_for_authenticated_user ─────────────────────────

  it('registers list_installation_repos_for_authenticated_user and returns the raw response as JSON', async () => {
    nock('https://api.github.com')
      .get('/user/installations/100/repositories')
      .query({ page: '1', per_page: '30' })
      .reply(200, {
        total_count: 1,
        repository_selection: 'all',
        repositories: [
          {
            id: 1296269,
            name: 'Hello-World',
            full_name: 'octocat/Hello-World',
            private: false,
            owner: {
              login: 'octocat',
              id: 1,
            },
            html_url: 'https://github.com/octocat/Hello-World',
            description: 'This your first repo!',
          },
        ],
      });

    const client = await connectedClient(registerAppsTools, 'read-write');
    const result = await client.callTool({
      name: 'list_installation_repos_for_authenticated_user',
      arguments: { installation_id: 100 },
    });

    expect(result.isError).toBeFalsy();
    const text = (result.content as Array<{ type: string; text: string }>)[0]?.text ?? '';
    const parsed = JSON.parse(text) as {
      total_count: number;
      repositories: Array<{ name: string }>;
    };
    expect(parsed.total_count).toBe(1);
    expect(parsed.repositories[0]).toMatchObject({ name: 'Hello-World' });
  });

  it('forwards installation_id and pagination on list_installation_repos_for_authenticated_user to the wire', async () => {
    const scope = nock('https://api.github.com')
      .get('/user/installations/999/repositories')
      .query({ page: '3', per_page: '50' })
      .reply(200, { total_count: 0, repositories: [] });

    const client = await connectedClient(registerAppsTools, 'read-write');
    const result = await client.callTool({
      name: 'list_installation_repos_for_authenticated_user',
      arguments: { installation_id: 999, page: 3, per_page: 50 },
    });

    expect(result.isError).toBeFalsy();
    expect(scope.isDone()).toBe(true);
  });

  it('propagates a 404 from list_installation_repos_for_authenticated_user as an MCP tool error', async () => {
    nock('https://api.github.com')
      .get('/user/installations/9999/repositories')
      .query({ page: '1', per_page: '30' })
      .reply(404, {
        message: 'Not Found',
        documentation_url: 'https://docs.github.com/rest',
      });

    const client = await connectedClient(registerAppsTools, 'read-write');
    const result = await client.callTool({
      name: 'list_installation_repos_for_authenticated_user',
      arguments: { installation_id: 9999 },
    });

    expect(result.isError).toBe(true);
    const text = (result.content as Array<{ type: string; text: string }>)[0]?.text ?? '';
    expect(text).toContain('Not Found');
  });

  // ── registration count ─────────────────────────────────────────────────────

  it('registers exactly the 3 apps tools in read-only mode (and the same set in read-write)', async () => {
    const expected = [
      'get_app',
      'list_installation_repos_for_authenticated_user',
      'list_installations_for_authenticated_user',
    ];

    const readOnlyClient = await connectedClient(registerAppsTools, 'read-only');
    const readOnlyTools = await readOnlyClient.listTools();
    expect(readOnlyTools.tools.map((t) => t.name).sort()).toEqual(expected);

    const readWriteClient = await connectedClient(registerAppsTools, 'read-write');
    const readWriteTools = await readWriteClient.listTools();
    expect(readWriteTools.tools.map((t) => t.name).sort()).toEqual(expected);
  });
});
