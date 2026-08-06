import nock from 'nock';
import { afterEach, describe, expect, it } from 'vitest';
import { registerCodespacesTools } from '../../../src/toolsets/codespaces.js';
import { connectedClient } from './test-helpers.js';

describe('registerCodespacesTools', () => {
  afterEach(() => {
    nock.cleanAll();
  });

  it('registers list_codespaces and returns the raw envelope as JSON', async () => {
    nock('https://api.github.com')
      .get('/user/codespaces')
      .query({ page: '1', per_page: '30' })
      .reply(200, { total_count: 1, codespaces: [{ name: 'cs-1', state: 'Available' }] });

    const client = await connectedClient(registerCodespacesTools, 'read-write');
    const result = await client.callTool({
      name: 'list_codespaces',
      arguments: {},
    });

    expect(result.isError).toBeFalsy();
    const text = (result.content as Array<{ type: string; text: string }>)[0]?.text ?? '';
    expect(JSON.parse(text)).toEqual({ total_count: 1, codespaces: [{ name: 'cs-1', state: 'Available' }] });
  });

  it('forwards repository_id filter on list_codespaces to the wire', async () => {
    const scope = nock('https://api.github.com')
      .get('/user/codespaces')
      .query({ repository_id: '42', page: '2', per_page: '10' })
      .reply(200, { total_count: 0, codespaces: [] });

    const client = await connectedClient(registerCodespacesTools, 'read-write');
    const result = await client.callTool({
      name: 'list_codespaces',
      arguments: { repository_id: 42, page: 2, per_page: 10 },
    });

    expect(result.isError).toBeFalsy();
    expect(scope.isDone()).toBe(true);
  });

  it('registers get_codespace and returns the raw response as JSON', async () => {
    nock('https://api.github.com')
      .get('/user/codespaces/cs-1')
      .reply(200, { name: 'cs-1', state: 'Available' });

    const client = await connectedClient(registerCodespacesTools, 'read-write');
    const result = await client.callTool({
      name: 'get_codespace',
      arguments: { codespace_name: 'cs-1' },
    });

    expect(result.isError).toBeFalsy();
    const text = (result.content as Array<{ type: string; text: string }>)[0]?.text ?? '';
    expect(JSON.parse(text)).toMatchObject({ name: 'cs-1' });
  });

  it('propagates a 404 from get_codespace as an MCP tool error', async () => {
    nock('https://api.github.com')
      .get('/user/codespaces/missing')
      .reply(404, { message: 'Not Found' });

    const client = await connectedClient(registerCodespacesTools, 'read-write');
    const result = await client.callTool({
      name: 'get_codespace',
      arguments: { codespace_name: 'missing' },
    });

    expect(result.isError).toBe(true);
    const text = (result.content as Array<{ type: string; text: string }>)[0]?.text ?? '';
    expect(text).toContain('Not Found');
  });

  it('registers create_codespace_in_repo and forwards optional body fields', async () => {
    nock('https://api.github.com')
      .post('/repos/acme/foo/codespaces', { ref: 'main', machine: 'basicLinux32gb' })
      .reply(201, { name: 'cs-new', state: 'Provisioning' });

    const client = await connectedClient(registerCodespacesTools, 'read-write');
    const result = await client.callTool({
      name: 'create_codespace_in_repo',
      arguments: { owner: 'acme', repo: 'foo', ref: 'main', machine: 'basicLinux32gb' },
    });

    expect(result.isError).toBeFalsy();
    const text = (result.content as Array<{ type: string; text: string }>)[0]?.text ?? '';
    expect(JSON.parse(text)).toMatchObject({ name: 'cs-new', state: 'Provisioning' });
  });

  it('registers start_codespace and returns the raw codespace response', async () => {
    nock('https://api.github.com')
      .post('/user/codespaces/cs-1/start')
      .reply(200, { name: 'cs-1', state: 'Starting' });

    const client = await connectedClient(registerCodespacesTools, 'read-write');
    const result = await client.callTool({
      name: 'start_codespace',
      arguments: { codespace_name: 'cs-1' },
    });

    expect(result.isError).toBeFalsy();
  });

  it('registers stop_codespace and returns the raw codespace response', async () => {
    nock('https://api.github.com')
      .post('/user/codespaces/cs-1/stop')
      .reply(200, { name: 'cs-1', state: 'Stopping' });

    const client = await connectedClient(registerCodespacesTools, 'read-write');
    const result = await client.callTool({
      name: 'stop_codespace',
      arguments: { codespace_name: 'cs-1' },
    });

    expect(result.isError).toBeFalsy();
  });

  it('registers exactly the 2 read tools in read-only mode', async () => {
    const client = await connectedClient(registerCodespacesTools, 'read-only');
    const { tools } = await client.listTools();
    expect(tools.map((t) => t.name).sort()).toEqual([
      'get_codespace',
      'list_codespaces',
    ]);
  });

  it('registers all 5 tools in read-write mode', async () => {
    const client = await connectedClient(registerCodespacesTools, 'read-write');
    const { tools } = await client.listTools();
    expect(tools.map((t) => t.name).sort()).toEqual([
      'create_codespace_in_repo',
      'get_codespace',
      'list_codespaces',
      'start_codespace',
      'stop_codespace',
    ]);
  });
});
