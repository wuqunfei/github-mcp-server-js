import nock from 'nock';
import { afterEach, describe, expect, it } from 'vitest';
import { registerOrgsTeamsTools } from '../../../src/toolsets/orgs_teams.js';
import { connectedClient } from './test-helpers.js';

describe('registerOrgsTeamsTools', () => {
  afterEach(() => {
    nock.cleanAll();
  });

  it('registers get_org and returns the raw GitHub response as JSON', async () => {
    nock('https://api.github.com')
      .get('/orgs/acme')
      .reply(200, { id: 1, login: 'acme', name: 'Acme Corp' });

    const client = await connectedClient(registerOrgsTeamsTools, 'read-write');
    const result = await client.callTool({
      name: 'get_org',
      arguments: { org: 'acme' },
    });

    expect(result.isError).toBeFalsy();
    const text = (result.content as Array<{ type: string; text: string }>)[0]?.text ?? '';
    expect(JSON.parse(text)).toMatchObject({ login: 'acme', name: 'Acme Corp' });
  });

  it('propagates a 404 from get_org as an MCP tool error', async () => {
    nock('https://api.github.com')
      .get('/orgs/no-such-org')
      .reply(404, { message: 'Not Found', documentation_url: 'https://docs.github.com/rest' });

    const client = await connectedClient(registerOrgsTeamsTools, 'read-write');
    const result = await client.callTool({
      name: 'get_org',
      arguments: { org: 'no-such-org' },
    });

    expect(result.isError).toBe(true);
    const text = (result.content as Array<{ type: string; text: string }>)[0]?.text ?? '';
    expect(text).toContain('Not Found');
  });

  it('forwards filter/role/pagination on list_org_members to the wire', async () => {
    const scope = nock('https://api.github.com')
      .get('/orgs/acme/members')
      .query({ filter: 'all', role: 'admin', page: '2', per_page: '50' })
      .reply(200, [{ login: 'alice' }]);

    const client = await connectedClient(registerOrgsTeamsTools, 'read-write');
    const result = await client.callTool({
      name: 'list_org_members',
      arguments: { org: 'acme', filter: 'all', role: 'admin', page: 2, per_page: 50 },
    });

    expect(result.isError).toBeFalsy();
    expect(scope.isDone()).toBe(true);
  });

  it('forwards type/sort/direction on list_org_repos to the wire', async () => {
    const scope = nock('https://api.github.com')
      .get('/orgs/acme/repos')
      .query({
        type: 'public',
        sort: 'updated',
        direction: 'desc',
        page: '1',
        per_page: '30',
      })
      .reply(200, [{ id: 1, full_name: 'acme/foo' }]);

    const client = await connectedClient(registerOrgsTeamsTools, 'read-write');
    const result = await client.callTool({
      name: 'list_org_repos',
      arguments: { org: 'acme', type: 'public', sort: 'updated', direction: 'desc' },
    });

    expect(result.isError).toBeFalsy();
    expect(scope.isDone()).toBe(true);
  });

  it('registers list_teams and returns the raw response as JSON', async () => {
    nock('https://api.github.com')
      .get('/orgs/acme/teams')
      .query({ page: '1', per_page: '30' })
      .reply(200, [{ id: 1, slug: 'engineering', name: 'Engineering' }]);

    const client = await connectedClient(registerOrgsTeamsTools, 'read-write');
    const result = await client.callTool({
      name: 'list_teams',
      arguments: { org: 'acme' },
    });

    expect(result.isError).toBeFalsy();
    const text = (result.content as Array<{ type: string; text: string }>)[0]?.text ?? '';
    expect(JSON.parse(text)).toEqual([{ id: 1, slug: 'engineering', name: 'Engineering' }]);
  });

  it('registers get_team_by_name and returns the raw response as JSON', async () => {
    nock('https://api.github.com')
      .get('/orgs/acme/teams/engineering')
      .reply(200, { id: 1, slug: 'engineering', name: 'Engineering', members_count: 5 });

    const client = await connectedClient(registerOrgsTeamsTools, 'read-write');
    const result = await client.callTool({
      name: 'get_team_by_name',
      arguments: { org: 'acme', team_slug: 'engineering' },
    });

    expect(result.isError).toBeFalsy();
    const text = (result.content as Array<{ type: string; text: string }>)[0]?.text ?? '';
    expect(JSON.parse(text)).toMatchObject({ slug: 'engineering', members_count: 5 });
  });

  it('forwards role/pagination on list_team_members to the wire', async () => {
    const scope = nock('https://api.github.com')
      .get('/orgs/acme/teams/engineering/members')
      .query({ role: 'maintainer', page: '1', per_page: '30' })
      .reply(200, [{ login: 'alice' }]);

    const client = await connectedClient(registerOrgsTeamsTools, 'read-write');
    const result = await client.callTool({
      name: 'list_team_members',
      arguments: { org: 'acme', team_slug: 'engineering', role: 'maintainer' },
    });

    expect(result.isError).toBeFalsy();
    expect(scope.isDone()).toBe(true);
  });

  it('registers add_or_update_team_membership and returns the raw response as JSON', async () => {
    nock('https://api.github.com')
      .put('/orgs/acme/teams/engineering/memberships/alice', { role: 'maintainer' })
      .reply(200, { state: 'active', role: 'maintainer' });

    const client = await connectedClient(registerOrgsTeamsTools, 'read-write');
    const result = await client.callTool({
      name: 'add_or_update_team_membership',
      arguments: { org: 'acme', team_slug: 'engineering', username: 'alice', role: 'maintainer' },
    });

    expect(result.isError).toBeFalsy();
    const text = (result.content as Array<{ type: string; text: string }>)[0]?.text ?? '';
    expect(JSON.parse(text)).toEqual({ state: 'active', role: 'maintainer' });
  });

  it('registers remove_team_membership and synthesizes { removed: true } on 204', async () => {
    nock('https://api.github.com')
      .delete('/orgs/acme/teams/engineering/memberships/alice')
      .reply(204);

    const client = await connectedClient(registerOrgsTeamsTools, 'read-write');
    const result = await client.callTool({
      name: 'remove_team_membership',
      arguments: { org: 'acme', team_slug: 'engineering', username: 'alice' },
    });

    expect(result.isError).toBeFalsy();
    const text = (result.content as Array<{ type: string; text: string }>)[0]?.text ?? '';
    expect(JSON.parse(text)).toEqual({ removed: true });
  });

  it('registers exactly the 6 read tools in read-only mode', async () => {
    const client = await connectedClient(registerOrgsTeamsTools, 'read-only');
    const { tools } = await client.listTools();
    expect(tools.map((t) => t.name).sort()).toEqual([
      'get_org',
      'get_team_by_name',
      'list_org_members',
      'list_org_repos',
      'list_team_members',
      'list_teams',
    ]);
  });

  it('registers all 8 tools in read-write mode', async () => {
    const client = await connectedClient(registerOrgsTeamsTools, 'read-write');
    const { tools } = await client.listTools();
    expect(tools.map((t) => t.name).sort()).toEqual([
      'add_or_update_team_membership',
      'get_org',
      'get_team_by_name',
      'list_org_members',
      'list_org_repos',
      'list_team_members',
      'list_teams',
      'remove_team_membership',
    ]);
  });
});
