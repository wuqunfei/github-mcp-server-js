import nock from 'nock';
import { afterEach, describe, expect, it } from 'vitest';
import { registerUsersTools } from '../../../src/toolsets/users.js';
import { connectedClient } from './test-helpers.js';

describe('registerUsersTools', () => {
  afterEach(() => {
    nock.cleanAll();
  });

  it('registers get_user_by_username and returns the raw GitHub user object as JSON', async () => {
    nock('https://api.github.com')
      .get('/users/octocat')
      .reply(200, {
        login: 'octocat',
        id: 1,
        avatar_url: 'https://github.com/images/error/octocat_happy.gif',
        html_url: 'https://github.com/octocat',
        name: 'The Octocat',
        public_repos: 8,
        followers: 20,
        following: 0,
      });

    const client = await connectedClient(registerUsersTools, 'read-write');
    const result = await client.callTool({
      name: 'get_user_by_username',
      arguments: { username: 'octocat' },
    });

    expect(result.isError).toBeFalsy();
    const text = (result.content as Array<{ type: string; text: string }>)[0]?.text ?? '';
    expect(JSON.parse(text)).toEqual({
      login: 'octocat',
      id: 1,
      avatar_url: 'https://github.com/images/error/octocat_happy.gif',
      html_url: 'https://github.com/octocat',
      name: 'The Octocat',
      public_repos: 8,
      followers: 20,
      following: 0,
    });
  });

  it('propagates a 404 from get_user_by_username as an MCP tool error', async () => {
    nock('https://api.github.com')
      .get('/users/nonexistent-user-xyz-abc-999')
      .reply(404, { message: 'Not Found', documentation_url: 'https://docs.github.com/rest' });

    const client = await connectedClient(registerUsersTools, 'read-write');
    const result = await client.callTool({
      name: 'get_user_by_username',
      arguments: { username: 'nonexistent-user-xyz-abc-999' },
    });

    expect(result.isError).toBe(true);
    const text = (result.content as Array<{ type: string; text: string }>)[0]?.text ?? '';
    expect(text).toContain('Not Found');
  });

  it('registers get_authenticated_user and returns the raw GitHub user object as JSON', async () => {
    nock('https://api.github.com')
      .get('/user')
      .reply(200, {
        login: 'monalisa',
        id: 2,
        avatar_url: 'https://github.com/images/error/monalisa.png',
        html_url: 'https://github.com/monalisa',
        name: 'monalisa octocat',
        private_gists: 3,
        total_private_repos: 1,
        followers: 100,
        following: 5,
      });

    const client = await connectedClient(registerUsersTools, 'read-write');
    const result = await client.callTool({
      name: 'get_authenticated_user',
      arguments: {},
    });

    expect(result.isError).toBeFalsy();
    const text = (result.content as Array<{ type: string; text: string }>)[0]?.text ?? '';
    expect(JSON.parse(text)).toMatchObject({
      login: 'monalisa',
      id: 2,
      private_gists: 3,
    });
  });

  it('propagates a 401 from get_authenticated_user as an MCP tool error', async () => {
    nock('https://api.github.com')
      .get('/user')
      .reply(401, {
        message: 'Requires authentication',
        documentation_url: 'https://docs.github.com/rest',
      });

    const client = await connectedClient(registerUsersTools, 'read-write');
    const result = await client.callTool({
      name: 'get_authenticated_user',
      arguments: {},
    });

    expect(result.isError).toBe(true);
    const text = (result.content as Array<{ type: string; text: string }>)[0]?.text ?? '';
    expect(text).toContain('Requires authentication');
  });

  it('registers list_user_followers and returns the raw simple-user array as JSON', async () => {
    nock('https://api.github.com')
      .get('/users/octocat/followers')
      .query({ page: '1', per_page: '30' })
      .reply(200, [
        { login: 'follower1', id: 10, avatar_url: 'https://github.com/images/a.png', html_url: 'https://github.com/follower1' },
        { login: 'follower2', id: 11, avatar_url: 'https://github.com/images/b.png', html_url: 'https://github.com/follower2' },
      ]);

    const client = await connectedClient(registerUsersTools, 'read-write');
    const result = await client.callTool({
      name: 'list_user_followers',
      arguments: { username: 'octocat' },
    });

    expect(result.isError).toBeFalsy();
    const text = (result.content as Array<{ type: string; text: string }>)[0]?.text ?? '';
    const parsed = JSON.parse(text) as Array<{ login: string }>;
    expect(parsed).toHaveLength(2);
    expect(parsed[0]).toMatchObject({ login: 'follower1' });
  });

  it('forwards pagination parameters on list_user_followers to the wire', async () => {
    const scope = nock('https://api.github.com')
      .get('/users/octocat/followers')
      .query({ page: '2', per_page: '50' })
      .reply(200, []);

    const client = await connectedClient(registerUsersTools, 'read-write');
    const result = await client.callTool({
      name: 'list_user_followers',
      arguments: { username: 'octocat', page: 2, per_page: 50 },
    });

    expect(result.isError).toBeFalsy();
    expect(scope.isDone()).toBe(true);
  });

  it('registers list_user_following and returns the raw simple-user array as JSON', async () => {
    nock('https://api.github.com')
      .get('/users/octocat/following')
      .query({ page: '1', per_page: '30' })
      .reply(200, [
        { login: 'followee1', id: 20, avatar_url: 'https://github.com/images/c.png', html_url: 'https://github.com/followee1' },
      ]);

    const client = await connectedClient(registerUsersTools, 'read-write');
    const result = await client.callTool({
      name: 'list_user_following',
      arguments: { username: 'octocat' },
    });

    expect(result.isError).toBeFalsy();
    const text = (result.content as Array<{ type: string; text: string }>)[0]?.text ?? '';
    expect(JSON.parse(text)).toMatchObject([{ login: 'followee1' }]);
  });

  it('registers get_user_hovercard and returns the raw hovercard object as JSON', async () => {
    nock('https://api.github.com')
      .get('/users/octocat/hovercard')
      .query({ subject_type: 'repository', subject_id: '1296269' })
      .reply(200, {
        contexts: [
          { message: 'Owns this repository', octicon: 'repo' },
        ],
      });

    const client = await connectedClient(registerUsersTools, 'read-write');
    const result = await client.callTool({
      name: 'get_user_hovercard',
      arguments: {
        username: 'octocat',
        subject_type: 'repository',
        subject_id: '1296269',
      },
    });

    expect(result.isError).toBeFalsy();
    const text = (result.content as Array<{ type: string; text: string }>)[0]?.text ?? '';
    expect(JSON.parse(text)).toEqual({
      contexts: [{ message: 'Owns this repository', octicon: 'repo' }],
    });
  });

  it('registers get_user_hovercard without subject context (bare hovercard)', async () => {
    nock('https://api.github.com')
      .get('/users/octocat/hovercard')
      .query({})
      .reply(200, {
        contexts: [],
      });

    const client = await connectedClient(registerUsersTools, 'read-write');
    const result = await client.callTool({
      name: 'get_user_hovercard',
      arguments: { username: 'octocat' },
    });

    expect(result.isError).toBeFalsy();
    const text = (result.content as Array<{ type: string; text: string }>)[0]?.text ?? '';
    expect(JSON.parse(text)).toMatchObject({ contexts: [] });
  });

  it('registers exactly the 5 users tools in read-only mode (and the same set in read-write)', async () => {
    const expected = [
      'get_authenticated_user',
      'get_user_by_username',
      'get_user_hovercard',
      'list_user_followers',
      'list_user_following',
    ];

    const readOnlyClient = await connectedClient(registerUsersTools, 'read-only');
    const readOnlyTools = await readOnlyClient.listTools();
    expect(readOnlyTools.tools.map((t) => t.name).sort()).toEqual(expected);

    const readWriteClient = await connectedClient(registerUsersTools, 'read-write');
    const readWriteTools = await readWriteClient.listTools();
    expect(readWriteTools.tools.map((t) => t.name).sort()).toEqual(expected);
  });
});
