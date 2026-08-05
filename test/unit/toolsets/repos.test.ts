import nock from 'nock';
import { afterEach, describe, expect, it } from 'vitest';
import { registerReposTools } from '../../../src/toolsets/repos.js';
import { connectedClient } from './test-helpers.js';

describe('registerReposTools', () => {
  afterEach(() => {
    nock.cleanAll();
  });

  it('registers get_repository and returns the raw GitHub response as JSON', async () => {
    nock('https://api.github.com')
      .get('/repos/octocat/hello-world')
      .reply(200, { id: 1, full_name: 'octocat/hello-world', default_branch: 'main' });

    const client = await connectedClient(registerReposTools, 'read-write');
    const result = await client.callTool({
      name: 'get_repository',
      arguments: { owner: 'octocat', repo: 'hello-world' },
    });

    expect(result.isError).toBeFalsy();
    const text = (result.content as Array<{ type: string; text: string }>)[0]?.text ?? '';
    expect(JSON.parse(text)).toMatchObject({ full_name: 'octocat/hello-world' });
  });

  it('propagates a 404 as an MCP tool error with the raw GitHub message', async () => {
    nock('https://api.github.com')
      .get('/repos/octocat/missing-repo')
      .reply(404, { message: 'Not Found', documentation_url: 'https://docs.github.com/rest' });

    const client = await connectedClient(registerReposTools, 'read-write');
    const result = await client.callTool({
      name: 'get_repository',
      arguments: { owner: 'octocat', repo: 'missing-repo' },
    });

    expect(result.isError).toBe(true);
    const text = (result.content as Array<{ type: string; text: string }>)[0]?.text ?? '';
    expect(text).toContain('Not Found');
  });

  it('passes page and per_page through to list_branches', async () => {
    nock('https://api.github.com')
      .get('/repos/octocat/hello-world/branches')
      .query({ page: '2', per_page: '10' })
      .reply(200, [{ name: 'develop' }]);

    const client = await connectedClient(registerReposTools, 'read-write');
    const result = await client.callTool({
      name: 'list_branches',
      arguments: { owner: 'octocat', repo: 'hello-world', page: 2, per_page: 10 },
    });

    expect(result.isError).toBeFalsy();
    const text = (result.content as Array<{ type: string; text: string }>)[0]?.text ?? '';
    expect(JSON.parse(text)).toEqual([{ name: 'develop' }]);
  });

  it('does not register create_or_update_file in read-only mode', async () => {
    const client = await connectedClient(registerReposTools, 'read-only');
    const { tools } = await client.listTools();
    expect(tools.map((tool) => tool.name)).not.toContain('create_or_update_file');
  });

  it('registers create_or_update_file in read-write mode', async () => {
    const client = await connectedClient(registerReposTools, 'read-write');
    const { tools } = await client.listTools();
    expect(tools.map((tool) => tool.name)).toContain('create_or_update_file');
  });

  it('registers all 7 read-only tools regardless of permission', async () => {
    const client = await connectedClient(registerReposTools, 'read-only');
    const { tools } = await client.listTools();
    const names = tools.map((tool) => tool.name);
    expect(names).toEqual(
      expect.arrayContaining([
        'get_repository',
        'list_branches',
        'get_branch',
        'get_file_contents',
        'list_commits',
        'get_commit',
        'list_tags',
      ]),
    );
  });
});
