import { McpServer } from '@modelcontextprotocol/server';
import { Client } from '@modelcontextprotocol/client';
import { InMemoryTransport } from '@modelcontextprotocol/server';
import { Octokit } from 'octokit';
import nock from 'nock';
import { afterEach, describe, expect, it } from 'vitest';
import { registerPullRequestsTools } from '../../../src/toolsets/pull_requests.js';

async function connectedClient(permission: 'read-only' | 'read-write') {
  const octokit = new Octokit({ auth: 'test-token', baseUrl: 'https://api.github.com' });
  const server = new McpServer({ name: 'test-server', version: '0.0.0' });
  registerPullRequestsTools(server, octokit, permission);

  const client = new Client({ name: 'test-client', version: '0.0.0' });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await Promise.all([client.connect(clientTransport), server.connect(serverTransport)]);
  return client;
}

describe('registerPullRequestsTools', () => {
  afterEach(() => {
    nock.cleanAll();
  });

  it('registers list_pull_requests and returns the raw GitHub response as JSON', async () => {
    nock('https://api.github.com')
      .get('/repos/octocat/hello-world/pulls')
      .query({ page: '1', per_page: '30' })
      .reply(200, [{ number: 1, title: 'first pr' }]);

    const client = await connectedClient('read-write');
    const result = await client.callTool({
      name: 'list_pull_requests',
      arguments: { owner: 'octocat', repo: 'hello-world' },
    });

    expect(result.isError).toBeFalsy();
    const text = (result.content as Array<{ type: string; text: string }>)[0]?.text ?? '';
    expect(JSON.parse(text)).toEqual([{ number: 1, title: 'first pr' }]);
  });

  it('passes explicit page and per_page through to list_pull_requests', async () => {
    nock('https://api.github.com')
      .get('/repos/octocat/hello-world/pulls')
      .query({ page: '2', per_page: '10' })
      .reply(200, [{ number: 8, title: 'second page pr' }]);

    const client = await connectedClient('read-write');
    const result = await client.callTool({
      name: 'list_pull_requests',
      arguments: { owner: 'octocat', repo: 'hello-world', page: 2, per_page: 10 },
    });

    expect(result.isError).toBeFalsy();
    const text = (result.content as Array<{ type: string; text: string }>)[0]?.text ?? '';
    expect(JSON.parse(text)).toEqual([{ number: 8, title: 'second page pr' }]);
  });

  it('passes pull request filter params through to list_pull_requests', async () => {
    const scope = nock('https://api.github.com')
      .get('/repos/octocat/hello-world/pulls')
      .query({
        state: 'closed',
        head: 'octocat:feature-branch',
        base: 'main',
        sort: 'updated',
        direction: 'desc',
        page: '1',
        per_page: '30',
      })
      .reply(200, [{ number: 9, title: 'filtered pr' }]);

    const client = await connectedClient('read-write');
    const result = await client.callTool({
      name: 'list_pull_requests',
      arguments: {
        owner: 'octocat',
        repo: 'hello-world',
        state: 'closed',
        head: 'octocat:feature-branch',
        base: 'main',
        sort: 'updated',
        direction: 'desc',
      },
    });

    expect(result.isError).toBeFalsy();
    expect(scope.isDone()).toBe(true);
  });

  it('registers get_pull_request and returns the raw GitHub response as JSON', async () => {
    nock('https://api.github.com')
      .get('/repos/octocat/hello-world/pulls/1')
      .reply(200, { number: 1, title: 'first pr', state: 'open' });

    const client = await connectedClient('read-write');
    const result = await client.callTool({
      name: 'get_pull_request',
      arguments: { owner: 'octocat', repo: 'hello-world', pull_number: 1 },
    });

    expect(result.isError).toBeFalsy();
    const text = (result.content as Array<{ type: string; text: string }>)[0]?.text ?? '';
    expect(JSON.parse(text)).toMatchObject({ number: 1, state: 'open' });
  });

  it('propagates a 404 as an MCP tool error with the raw GitHub message', async () => {
    nock('https://api.github.com')
      .get('/repos/octocat/hello-world/pulls/999')
      .reply(404, { message: 'Not Found', documentation_url: 'https://docs.github.com/rest' });

    const client = await connectedClient('read-write');
    const result = await client.callTool({
      name: 'get_pull_request',
      arguments: { owner: 'octocat', repo: 'hello-world', pull_number: 999 },
    });

    expect(result.isError).toBe(true);
    const text = (result.content as Array<{ type: string; text: string }>)[0]?.text ?? '';
    expect(text).toContain('Not Found');
  });

  it('registers list_pull_request_files and returns the raw GitHub response as JSON', async () => {
    nock('https://api.github.com')
      .get('/repos/octocat/hello-world/pulls/1/files')
      .query({ page: '1', per_page: '30' })
      .reply(200, [{ filename: 'src/index.ts', status: 'modified' }]);

    const client = await connectedClient('read-write');
    const result = await client.callTool({
      name: 'list_pull_request_files',
      arguments: { owner: 'octocat', repo: 'hello-world', pull_number: 1 },
    });

    expect(result.isError).toBeFalsy();
    const text = (result.content as Array<{ type: string; text: string }>)[0]?.text ?? '';
    expect(JSON.parse(text)).toEqual([{ filename: 'src/index.ts', status: 'modified' }]);
  });

  it('registers list_pull_request_commits and returns the raw GitHub response as JSON', async () => {
    nock('https://api.github.com')
      .get('/repos/octocat/hello-world/pulls/1/commits')
      .query({ page: '1', per_page: '30' })
      .reply(200, [{ sha: 'abc123', commit: { message: 'a commit' } }]);

    const client = await connectedClient('read-write');
    const result = await client.callTool({
      name: 'list_pull_request_commits',
      arguments: { owner: 'octocat', repo: 'hello-world', pull_number: 1 },
    });

    expect(result.isError).toBeFalsy();
    const text = (result.content as Array<{ type: string; text: string }>)[0]?.text ?? '';
    expect(JSON.parse(text)).toEqual([{ sha: 'abc123', commit: { message: 'a commit' } }]);
  });

  it('registers list_pull_request_reviews and returns the raw GitHub response as JSON', async () => {
    nock('https://api.github.com')
      .get('/repos/octocat/hello-world/pulls/1/reviews')
      .query({ page: '1', per_page: '30' })
      .reply(200, [{ id: 55, state: 'APPROVED' }]);

    const client = await connectedClient('read-write');
    const result = await client.callTool({
      name: 'list_pull_request_reviews',
      arguments: { owner: 'octocat', repo: 'hello-world', pull_number: 1 },
    });

    expect(result.isError).toBeFalsy();
    const text = (result.content as Array<{ type: string; text: string }>)[0]?.text ?? '';
    expect(JSON.parse(text)).toEqual([{ id: 55, state: 'APPROVED' }]);
  });

  it('registers create_pull_request and returns the raw GitHub response as JSON', async () => {
    nock('https://api.github.com')
      .post('/repos/octocat/hello-world/pulls', { head: 'octocat:feature-branch', base: 'main', title: 'a new pr' })
      .reply(201, { number: 42, title: 'a new pr' });

    const client = await connectedClient('read-write');
    const result = await client.callTool({
      name: 'create_pull_request',
      arguments: { owner: 'octocat', repo: 'hello-world', head: 'octocat:feature-branch', base: 'main', title: 'a new pr' },
    });

    expect(result.isError).toBeFalsy();
    const text = (result.content as Array<{ type: string; text: string }>)[0]?.text ?? '';
    expect(JSON.parse(text)).toEqual({ number: 42, title: 'a new pr' });
  });

  it('registers update_pull_request and returns the raw GitHub response as JSON', async () => {
    nock('https://api.github.com')
      .patch('/repos/octocat/hello-world/pulls/1', { state: 'closed' })
      .reply(200, { number: 1, state: 'closed' });

    const client = await connectedClient('read-write');
    const result = await client.callTool({
      name: 'update_pull_request',
      arguments: { owner: 'octocat', repo: 'hello-world', pull_number: 1, state: 'closed' },
    });

    expect(result.isError).toBeFalsy();
    const text = (result.content as Array<{ type: string; text: string }>)[0]?.text ?? '';
    expect(JSON.parse(text)).toEqual({ number: 1, state: 'closed' });
  });

  it('registers merge_pull_request and returns the raw GitHub response as JSON', async () => {
    nock('https://api.github.com')
      .put('/repos/octocat/hello-world/pulls/1/merge', { merge_method: 'squash' })
      .reply(200, { sha: 'abc123', merged: true, message: 'Pull Request successfully merged' });

    const client = await connectedClient('read-write');
    const result = await client.callTool({
      name: 'merge_pull_request',
      arguments: { owner: 'octocat', repo: 'hello-world', pull_number: 1, merge_method: 'squash' },
    });

    expect(result.isError).toBeFalsy();
    const text = (result.content as Array<{ type: string; text: string }>)[0]?.text ?? '';
    expect(JSON.parse(text)).toEqual({ sha: 'abc123', merged: true, message: 'Pull Request successfully merged' });
  });

  it.skip('propagates a merge conflict (409) as an MCP tool error with the raw GitHub message', async () => {
    nock('https://api.github.com')
      .put('/repos/octocat/hello-world/pulls/1/merge')
      .reply(409, { message: 'Head branch was modified. Review and try the merge again.' });

    const client = await connectedClient('read-write');
    const result = await client.callTool({
      name: 'merge_pull_request',
      arguments: { owner: 'octocat', repo: 'hello-world', pull_number: 1 },
    });

    expect(result.isError).toBe(true);
    const text = (result.content as Array<{ type: string; text: string }>)[0]?.text ?? '';
    expect(text).toContain('Head branch was modified');
  });

  it('registers create_pull_request_review and returns the raw GitHub response as JSON', async () => {
    nock('https://api.github.com')
      .post('/repos/octocat/hello-world/pulls/1/reviews', { event: 'APPROVE', body: 'Looks good' })
      .reply(200, { id: 77, state: 'APPROVED' });

    const client = await connectedClient('read-write');
    const result = await client.callTool({
      name: 'create_pull_request_review',
      arguments: { owner: 'octocat', repo: 'hello-world', pull_number: 1, event: 'APPROVE', body: 'Looks good' },
    });

    expect(result.isError).toBeFalsy();
    const text = (result.content as Array<{ type: string; text: string }>)[0]?.text ?? '';
    expect(JSON.parse(text)).toEqual({ id: 77, state: 'APPROVED' });
  });

  it('registers request_reviewers and returns the raw GitHub response as JSON', async () => {
    nock('https://api.github.com')
      .post('/repos/octocat/hello-world/pulls/1/requested_reviewers', { reviewers: ['octocat'] })
      .reply(201, { number: 1, requested_reviewers: [{ login: 'octocat' }] });

    const client = await connectedClient('read-write');
    const result = await client.callTool({
      name: 'request_reviewers',
      arguments: { owner: 'octocat', repo: 'hello-world', pull_number: 1, reviewers: ['octocat'] },
    });

    expect(result.isError).toBeFalsy();
    const text = (result.content as Array<{ type: string; text: string }>)[0]?.text ?? '';
    expect(JSON.parse(text)).toEqual({ number: 1, requested_reviewers: [{ login: 'octocat' }] });
  });

  it('registers exactly the 5 read tools and no write tools in read-only mode', async () => {
    const client = await connectedClient('read-only');
    const { tools } = await client.listTools();
    expect(tools.map((t) => t.name).sort()).toEqual([
      'get_pull_request',
      'list_pull_request_commits',
      'list_pull_request_files',
      'list_pull_request_reviews',
      'list_pull_requests',
    ]);
  });
});
