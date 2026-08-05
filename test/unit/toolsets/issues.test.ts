import { McpServer } from '@modelcontextprotocol/server';
import { Client } from '@modelcontextprotocol/client';
import { InMemoryTransport } from '@modelcontextprotocol/server';
import { Octokit } from 'octokit';
import nock from 'nock';
import { afterEach, describe, expect, it } from 'vitest';
import { registerIssuesTools } from '../../../src/toolsets/issues.js';

async function connectedClient(permission: 'read-only' | 'read-write') {
  const octokit = new Octokit({ auth: 'test-token', baseUrl: 'https://api.github.com' });
  const server = new McpServer({ name: 'test-server', version: '0.0.0' });
  registerIssuesTools(server, octokit, permission);

  const client = new Client({ name: 'test-client', version: '0.0.0' });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await Promise.all([client.connect(clientTransport), server.connect(serverTransport)]);
  return client;
}

describe('registerIssuesTools', () => {
  afterEach(() => {
    nock.cleanAll();
  });

  it('registers list_issues and returns the raw GitHub response as JSON', async () => {
    nock('https://api.github.com')
      .get('/repos/octocat/hello-world/issues')
      .query({ page: '1', per_page: '30' })
      .reply(200, [{ number: 1, title: 'first issue' }]);

    const client = await connectedClient('read-write');
    const result = await client.callTool({
      name: 'list_issues',
      arguments: { owner: 'octocat', repo: 'hello-world' },
    });

    expect(result.isError).toBeFalsy();
    const text = (result.content as Array<{ type: string; text: string }>)[0]?.text ?? '';
    expect(JSON.parse(text)).toEqual([{ number: 1, title: 'first issue' }]);
  });

  it('passes explicit page and per_page through to list_issues', async () => {
    nock('https://api.github.com')
      .get('/repos/octocat/hello-world/issues')
      .query({ page: '2', per_page: '10' })
      .reply(200, [{ number: 5, title: 'second page issue' }]);

    const client = await connectedClient('read-write');
    const result = await client.callTool({
      name: 'list_issues',
      arguments: { owner: 'octocat', repo: 'hello-world', page: 2, per_page: 10 },
    });

    expect(result.isError).toBeFalsy();
    const text = (result.content as Array<{ type: string; text: string }>)[0]?.text ?? '';
    expect(JSON.parse(text)).toEqual([{ number: 5, title: 'second page issue' }]);
  });

  it('registers get_issue and returns the raw GitHub response as JSON', async () => {
    nock('https://api.github.com')
      .get('/repos/octocat/hello-world/issues/1')
      .reply(200, { number: 1, title: 'first issue', state: 'open' });

    const client = await connectedClient('read-write');
    const result = await client.callTool({
      name: 'get_issue',
      arguments: { owner: 'octocat', repo: 'hello-world', issue_number: 1 },
    });

    expect(result.isError).toBeFalsy();
    const text = (result.content as Array<{ type: string; text: string }>)[0]?.text ?? '';
    expect(JSON.parse(text)).toMatchObject({ number: 1, state: 'open' });
  });

  it('propagates a 404 as an MCP tool error with the raw GitHub message', async () => {
    nock('https://api.github.com')
      .get('/repos/octocat/hello-world/issues/999')
      .reply(404, { message: 'Not Found', documentation_url: 'https://docs.github.com/rest' });

    const client = await connectedClient('read-write');
    const result = await client.callTool({
      name: 'get_issue',
      arguments: { owner: 'octocat', repo: 'hello-world', issue_number: 999 },
    });

    expect(result.isError).toBe(true);
    const text = (result.content as Array<{ type: string; text: string }>)[0]?.text ?? '';
    expect(text).toContain('Not Found');
  });

  it('registers list_comments and returns the raw GitHub response as JSON', async () => {
    nock('https://api.github.com')
      .get('/repos/octocat/hello-world/issues/1/comments')
      .query({ page: '1', per_page: '30' })
      .reply(200, [{ id: 10, body: 'a comment' }]);

    const client = await connectedClient('read-write');
    const result = await client.callTool({
      name: 'list_comments',
      arguments: { owner: 'octocat', repo: 'hello-world', issue_number: 1 },
    });

    expect(result.isError).toBeFalsy();
    const text = (result.content as Array<{ type: string; text: string }>)[0]?.text ?? '';
    expect(JSON.parse(text)).toEqual([{ id: 10, body: 'a comment' }]);
  });

  it('registers list_labels and returns the raw GitHub response as JSON', async () => {
    nock('https://api.github.com')
      .get('/repos/octocat/hello-world/labels')
      .query({ page: '1', per_page: '30' })
      .reply(200, [{ name: 'bug', color: 'ff0000' }]);

    const client = await connectedClient('read-write');
    const result = await client.callTool({
      name: 'list_labels',
      arguments: { owner: 'octocat', repo: 'hello-world' },
    });

    expect(result.isError).toBeFalsy();
    const text = (result.content as Array<{ type: string; text: string }>)[0]?.text ?? '';
    expect(JSON.parse(text)).toEqual([{ name: 'bug', color: 'ff0000' }]);
  });

  it('registers list_labels_on_issue and returns the raw GitHub response as JSON', async () => {
    nock('https://api.github.com')
      .get('/repos/octocat/hello-world/issues/1/labels')
      .query({ page: '1', per_page: '30' })
      .reply(200, [{ name: 'help wanted' }]);

    const client = await connectedClient('read-write');
    const result = await client.callTool({
      name: 'list_labels_on_issue',
      arguments: { owner: 'octocat', repo: 'hello-world', issue_number: 1 },
    });

    expect(result.isError).toBeFalsy();
    const text = (result.content as Array<{ type: string; text: string }>)[0]?.text ?? '';
    expect(JSON.parse(text)).toEqual([{ name: 'help wanted' }]);
  });

  it('registers create_issue and returns the raw GitHub response as JSON', async () => {
    nock('https://api.github.com')
      .post('/repos/octocat/hello-world/issues', { title: 'a new bug' })
      .reply(201, { number: 42, title: 'a new bug' });

    const client = await connectedClient('read-write');
    const result = await client.callTool({
      name: 'create_issue',
      arguments: { owner: 'octocat', repo: 'hello-world', title: 'a new bug' },
    });

    expect(result.isError).toBeFalsy();
    const text = (result.content as Array<{ type: string; text: string }>)[0]?.text ?? '';
    expect(JSON.parse(text)).toEqual({ number: 42, title: 'a new bug' });
  });

  it('registers update_issue and returns the raw GitHub response as JSON', async () => {
    nock('https://api.github.com')
      .patch('/repos/octocat/hello-world/issues/1', { state: 'closed' })
      .reply(200, { number: 1, state: 'closed' });

    const client = await connectedClient('read-write');
    const result = await client.callTool({
      name: 'update_issue',
      arguments: { owner: 'octocat', repo: 'hello-world', issue_number: 1, state: 'closed' },
    });

    expect(result.isError).toBeFalsy();
    const text = (result.content as Array<{ type: string; text: string }>)[0]?.text ?? '';
    expect(JSON.parse(text)).toEqual({ number: 1, state: 'closed' });
  });

  it('registers add_comment and returns the raw GitHub response as JSON', async () => {
    nock('https://api.github.com')
      .post('/repos/octocat/hello-world/issues/1/comments', { body: 'a comment' })
      .reply(201, { id: 99, body: 'a comment' });

    const client = await connectedClient('read-write');
    const result = await client.callTool({
      name: 'add_comment',
      arguments: { owner: 'octocat', repo: 'hello-world', issue_number: 1, body: 'a comment' },
    });

    expect(result.isError).toBeFalsy();
    const text = (result.content as Array<{ type: string; text: string }>)[0]?.text ?? '';
    expect(JSON.parse(text)).toEqual({ id: 99, body: 'a comment' });
  });

  it('registers add_labels and returns the raw GitHub response as JSON', async () => {
    nock('https://api.github.com')
      .post('/repos/octocat/hello-world/issues/1/labels', { labels: ['bug'] })
      .reply(200, [{ name: 'bug' }]);

    const client = await connectedClient('read-write');
    const result = await client.callTool({
      name: 'add_labels',
      arguments: { owner: 'octocat', repo: 'hello-world', issue_number: 1, labels: ['bug'] },
    });

    expect(result.isError).toBeFalsy();
    const text = (result.content as Array<{ type: string; text: string }>)[0]?.text ?? '';
    expect(JSON.parse(text)).toEqual([{ name: 'bug' }]);
  });

  it('registers remove_label and returns the raw GitHub response as JSON', async () => {
    nock('https://api.github.com')
      .delete('/repos/octocat/hello-world/issues/1/labels/bug')
      .reply(200, [{ name: 'enhancement' }]);

    const client = await connectedClient('read-write');
    const result = await client.callTool({
      name: 'remove_label',
      arguments: { owner: 'octocat', repo: 'hello-world', issue_number: 1, name: 'bug' },
    });

    expect(result.isError).toBeFalsy();
    const text = (result.content as Array<{ type: string; text: string }>)[0]?.text ?? '';
    expect(JSON.parse(text)).toEqual([{ name: 'enhancement' }]);
  });

  it('registers lock_issue and returns success with no content', async () => {
    nock('https://api.github.com')
      .put('/repos/octocat/hello-world/issues/1/lock', { lock_reason: 'resolved' })
      .reply(204);

    const client = await connectedClient('read-write');
    const result = await client.callTool({
      name: 'lock_issue',
      arguments: { owner: 'octocat', repo: 'hello-world', issue_number: 1, lock_reason: 'resolved' },
    });

    expect(result.isError).toBeFalsy();
  });

  it('registers unlock_issue and returns success with no content', async () => {
    nock('https://api.github.com')
      .delete('/repos/octocat/hello-world/issues/1/lock')
      .reply(204);

    const client = await connectedClient('read-write');
    const result = await client.callTool({
      name: 'unlock_issue',
      arguments: { owner: 'octocat', repo: 'hello-world', issue_number: 1 },
    });

    expect(result.isError).toBeFalsy();
  });

  it('does not register any write tool in read-only mode', async () => {
    const client = await connectedClient('read-only');
    const { tools } = await client.listTools();
    const names = tools.map((tool) => tool.name);
    expect(names).not.toEqual(
      expect.arrayContaining([
        'create_issue',
        'update_issue',
        'add_comment',
        'add_labels',
        'remove_label',
        'lock_issue',
        'unlock_issue',
      ]),
    );
  });

  it('registers all 5 read-only tools regardless of permission', async () => {
    const client = await connectedClient('read-only');
    const { tools } = await client.listTools();
    const names = tools.map((tool) => tool.name);
    expect(names).toEqual(
      expect.arrayContaining([
        'list_issues',
        'get_issue',
        'list_comments',
        'list_labels',
        'list_labels_on_issue',
      ]),
    );
  });
});
