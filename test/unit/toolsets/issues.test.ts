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
});
