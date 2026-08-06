import nock from 'nock';
import { afterEach, describe, expect, it } from 'vitest';
import { registerProjectsTools } from '../../../src/toolsets/projects.js';
import { connectedClient } from './test-helpers.js';

describe('registerProjectsTools', () => {
  afterEach(() => {
    nock.cleanAll();
  });

  it('registers list_org_projects and returns the raw response as JSON', async () => {
    nock('https://api.github.com')
      .get('/orgs/acme/projectsV2')
      .query({ page: '1', per_page: '30' })
      .reply(200, [{ id: 1, number: 1, title: 'Roadmap' }]);

    const client = await connectedClient(registerProjectsTools, 'read-write');
    const result = await client.callTool({
      name: 'list_org_projects',
      arguments: { org: 'acme' },
    });

    expect(result.isError).toBeFalsy();
    const text = (result.content as Array<{ type: string; text: string }>)[0]?.text ?? '';
    expect(JSON.parse(text)).toEqual([{ id: 1, number: 1, title: 'Roadmap' }]);
  });

  it('forwards pagination on list_org_projects to the wire', async () => {
    const scope = nock('https://api.github.com')
      .get('/orgs/acme/projectsV2')
      .query({ page: '2', per_page: '50' })
      .reply(200, []);

    const client = await connectedClient(registerProjectsTools, 'read-write');
    const result = await client.callTool({
      name: 'list_org_projects',
      arguments: { org: 'acme', page: 2, per_page: 50 },
    });

    expect(result.isError).toBeFalsy();
    expect(scope.isDone()).toBe(true);
  });

  it('registers get_org_project and returns the raw response as JSON', async () => {
    nock('https://api.github.com')
      .get('/orgs/acme/projectsV2/1')
      .reply(200, { id: 1, number: 1, title: 'Roadmap' });

    const client = await connectedClient(registerProjectsTools, 'read-write');
    const result = await client.callTool({
      name: 'get_org_project',
      arguments: { org: 'acme', project_number: 1 },
    });

    expect(result.isError).toBeFalsy();
    const text = (result.content as Array<{ type: string; text: string }>)[0]?.text ?? '';
    expect(JSON.parse(text)).toMatchObject({ number: 1, title: 'Roadmap' });
  });

  it('propagates a 404 from get_org_project as an MCP tool error', async () => {
    nock('https://api.github.com')
      .get('/orgs/acme/projectsV2/999')
      .reply(404, { message: 'Not Found' });

    const client = await connectedClient(registerProjectsTools, 'read-write');
    const result = await client.callTool({
      name: 'get_org_project',
      arguments: { org: 'acme', project_number: 999 },
    });

    expect(result.isError).toBe(true);
    const text = (result.content as Array<{ type: string; text: string }>)[0]?.text ?? '';
    expect(text).toContain('Not Found');
  });

  it('registers list_org_project_items and returns the raw response as JSON', async () => {
    nock('https://api.github.com')
      .get('/orgs/acme/projectsV2/1/items')
      .query({ page: '1', per_page: '30' })
      .reply(200, [{ id: 100, content_type: 'Issue' }]);

    const client = await connectedClient(registerProjectsTools, 'read-write');
    const result = await client.callTool({
      name: 'list_org_project_items',
      arguments: { org: 'acme', project_number: 1 },
    });

    expect(result.isError).toBeFalsy();
    const text = (result.content as Array<{ type: string; text: string }>)[0]?.text ?? '';
    expect(JSON.parse(text)).toEqual([{ id: 100, content_type: 'Issue' }]);
  });

  it('registers list_org_project_fields and returns the raw response as JSON', async () => {
    nock('https://api.github.com')
      .get('/orgs/acme/projectsV2/1/fields')
      .query({ page: '1', per_page: '30' })
      .reply(200, [{ id: 10, name: 'Status', data_type: 'SINGLE_SELECT' }]);

    const client = await connectedClient(registerProjectsTools, 'read-write');
    const result = await client.callTool({
      name: 'list_org_project_fields',
      arguments: { org: 'acme', project_number: 1 },
    });

    expect(result.isError).toBeFalsy();
    const text = (result.content as Array<{ type: string; text: string }>)[0]?.text ?? '';
    expect(JSON.parse(text)).toEqual([{ id: 10, name: 'Status', data_type: 'SINGLE_SELECT' }]);
  });

  it('registers get_org_project_item and returns the raw response as JSON', async () => {
    nock('https://api.github.com')
      .get('/orgs/acme/projectsV2/1/items/100')
      .reply(200, { id: 100, content_type: 'Issue', title: 'Bug' });

    const client = await connectedClient(registerProjectsTools, 'read-write');
    const result = await client.callTool({
      name: 'get_org_project_item',
      arguments: { org: 'acme', project_number: 1, item_id: 100 },
    });

    expect(result.isError).toBeFalsy();
    const text = (result.content as Array<{ type: string; text: string }>)[0]?.text ?? '';
    expect(JSON.parse(text)).toMatchObject({ id: 100 });
  });

  it('registers exactly the 5 tools in both permission modes', async () => {
    const expected = [
      'get_org_project',
      'get_org_project_item',
      'list_org_project_fields',
      'list_org_project_items',
      'list_org_projects',
    ];

    const roClient = await connectedClient(registerProjectsTools, 'read-only');
    expect((await roClient.listTools()).tools.map((t) => t.name).sort()).toEqual(expected);

    const rwClient = await connectedClient(registerProjectsTools, 'read-write');
    expect((await rwClient.listTools()).tools.map((t) => t.name).sort()).toEqual(expected);
  });
});
