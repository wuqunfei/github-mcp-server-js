import nock from 'nock';
import { afterEach, describe, expect, it } from 'vitest';
import { registerCopilotTools } from '../../../src/toolsets/copilot.js';
import { connectedClient } from './test-helpers.js';

describe('registerCopilotTools', () => {
  afterEach(() => {
    nock.cleanAll();
  });

  // ── get_copilot_organization_details ──────────────────────────────────────

  it('registers get_copilot_organization_details and returns the raw org details as JSON', async () => {
    nock('https://api.github.com')
      .get('/orgs/test-org/copilot/billing')
      .reply(200, {
        seat_breakdown: {
          total: 10,
          added_this_cycle: 2,
          pending_cancellation: 0,
          pending_invitation: 1,
          active_this_cycle: 8,
          inactive_this_cycle: 2,
        },
        public_code_suggestions: 'block',
        ide_chat: 'enabled',
        platform_chat: 'enabled',
        cli: 'enabled',
        seat_management_setting: 'assign_selected',
        plan_type: 'business',
      });

    const client = await connectedClient(registerCopilotTools, 'read-write');
    const result = await client.callTool({
      name: 'get_copilot_organization_details',
      arguments: { org: 'test-org' },
    });

    expect(result.isError).toBeFalsy();
    const text = (result.content as Array<{ type: string; text: string }>)[0]?.text ?? '';
    const parsed = JSON.parse(text) as {
      seat_breakdown: { total: number; active_this_cycle: number };
      plan_type: string;
      public_code_suggestions: string;
    };
    expect(parsed.seat_breakdown.total).toBe(10);
    expect(parsed.seat_breakdown.active_this_cycle).toBe(8);
    expect(parsed.plan_type).toBe('business');
    expect(parsed.public_code_suggestions).toBe('block');
  });

  it('propagates a 403 from get_copilot_organization_details as an MCP tool error', async () => {
    nock('https://api.github.com')
      .get('/orgs/test-org/copilot/billing')
      .reply(403, {
        message: 'Forbidden',
        documentation_url: 'https://docs.github.com/rest',
      });

    const client = await connectedClient(registerCopilotTools, 'read-write');
    const result = await client.callTool({
      name: 'get_copilot_organization_details',
      arguments: { org: 'test-org' },
    });

    expect(result.isError).toBe(true);
    const text = (result.content as Array<{ type: string; text: string }>)[0]?.text ?? '';
    expect(text).toContain('Forbidden');
  });

  it('propagates a 404 from get_copilot_organization_details as an MCP tool error', async () => {
    // 404 occurs when the org does not have a Copilot subscription.
    nock('https://api.github.com')
      .get('/orgs/test-org/copilot/billing')
      .reply(404, {
        message: 'Not Found',
        documentation_url: 'https://docs.github.com/rest',
      });

    const client = await connectedClient(registerCopilotTools, 'read-write');
    const result = await client.callTool({
      name: 'get_copilot_organization_details',
      arguments: { org: 'test-org' },
    });

    expect(result.isError).toBe(true);
    const text = (result.content as Array<{ type: string; text: string }>)[0]?.text ?? '';
    expect(text).toContain('Not Found');
  });

  // ── list_copilot_seats ────────────────────────────────────────────────────

  it('registers list_copilot_seats and returns the raw seat list as JSON', async () => {
    nock('https://api.github.com')
      .get('/orgs/test-org/copilot/billing/seats')
      .query({ page: '1', per_page: '30' })
      .reply(200, {
        total_seats: 2,
        seats: [
          {
            assignee: {
              login: 'alice',
              id: 101,
              node_id: 'U_alice',
              avatar_url: 'https://avatars.githubusercontent.com/u/101',
              url: 'https://api.github.com/users/alice',
              html_url: 'https://github.com/alice',
              type: 'User',
              site_admin: false,
            },
            created_at: '2024-01-15T00:00:00Z',
            last_activity_at: '2024-08-01T10:00:00Z',
            last_activity_editor: 'vscode/1.90.0',
            plan_type: 'business',
          },
          {
            assignee: {
              login: 'bob',
              id: 102,
              node_id: 'U_bob',
              avatar_url: 'https://avatars.githubusercontent.com/u/102',
              url: 'https://api.github.com/users/bob',
              html_url: 'https://github.com/bob',
              type: 'User',
              site_admin: false,
            },
            created_at: '2024-02-20T00:00:00Z',
            last_activity_at: null,
            last_activity_editor: null,
            plan_type: 'business',
          },
        ],
      });

    const client = await connectedClient(registerCopilotTools, 'read-write');
    const result = await client.callTool({
      name: 'list_copilot_seats',
      arguments: { org: 'test-org' },
    });

    expect(result.isError).toBeFalsy();
    const text = (result.content as Array<{ type: string; text: string }>)[0]?.text ?? '';
    const parsed = JSON.parse(text) as {
      total_seats: number;
      seats: Array<{ assignee: { login: string }; plan_type: string }>;
    };
    expect(parsed.total_seats).toBe(2);
    expect(parsed.seats).toHaveLength(2);
    expect(parsed.seats[0]).toMatchObject({ assignee: { login: 'alice' }, plan_type: 'business' });
    expect(parsed.seats[1]).toMatchObject({ assignee: { login: 'bob' } });
  });

  it('forwards org and pagination on list_copilot_seats to the wire', async () => {
    const scope = nock('https://api.github.com')
      .get('/orgs/test-org/copilot/billing/seats')
      .query({ page: '2', per_page: '10' })
      .reply(200, { total_seats: 0, seats: [] });

    const client = await connectedClient(registerCopilotTools, 'read-write');
    const result = await client.callTool({
      name: 'list_copilot_seats',
      arguments: { org: 'test-org', page: 2, per_page: 10 },
    });

    expect(result.isError).toBeFalsy();
    expect(scope.isDone()).toBe(true);
  });

  it('propagates a 403 from list_copilot_seats as an MCP tool error', async () => {
    nock('https://api.github.com')
      .get('/orgs/test-org/copilot/billing/seats')
      .query({ page: '1', per_page: '30' })
      .reply(403, {
        message: 'Forbidden',
        documentation_url: 'https://docs.github.com/rest',
      });

    const client = await connectedClient(registerCopilotTools, 'read-write');
    const result = await client.callTool({
      name: 'list_copilot_seats',
      arguments: { org: 'test-org' },
    });

    expect(result.isError).toBe(true);
    const text = (result.content as Array<{ type: string; text: string }>)[0]?.text ?? '';
    expect(text).toContain('Forbidden');
  });

  // ── get_copilot_seat_details_for_user ─────────────────────────────────────

  it('registers get_copilot_seat_details_for_user and returns the raw seat details as JSON', async () => {
    nock('https://api.github.com')
      .get('/orgs/test-org/members/alice/copilot')
      .reply(200, {
        assignee: {
          login: 'alice',
          id: 101,
          node_id: 'U_alice',
          avatar_url: 'https://avatars.githubusercontent.com/u/101',
          url: 'https://api.github.com/users/alice',
          html_url: 'https://github.com/alice',
          type: 'User',
          site_admin: false,
        },
        created_at: '2024-01-15T00:00:00Z',
        last_activity_at: '2024-08-01T10:00:00Z',
        last_activity_editor: 'vscode/1.90.0',
        last_authenticated_at: '2024-08-01T09:55:00Z',
        pending_cancellation_date: null,
        plan_type: 'business',
      });

    const client = await connectedClient(registerCopilotTools, 'read-write');
    const result = await client.callTool({
      name: 'get_copilot_seat_details_for_user',
      arguments: { org: 'test-org', username: 'alice' },
    });

    expect(result.isError).toBeFalsy();
    const text = (result.content as Array<{ type: string; text: string }>)[0]?.text ?? '';
    const parsed = JSON.parse(text) as {
      assignee: { login: string };
      last_activity_editor: string;
      plan_type: string;
    };
    expect(parsed.assignee.login).toBe('alice');
    expect(parsed.last_activity_editor).toBe('vscode/1.90.0');
    expect(parsed.plan_type).toBe('business');
  });

  it('forwards org and username on get_copilot_seat_details_for_user to the wire', async () => {
    const scope = nock('https://api.github.com')
      .get('/orgs/acme-corp/members/bob/copilot')
      .reply(200, {
        assignee: { login: 'bob', id: 102 },
        created_at: '2024-02-20T00:00:00Z',
      });

    const client = await connectedClient(registerCopilotTools, 'read-write');
    const result = await client.callTool({
      name: 'get_copilot_seat_details_for_user',
      arguments: { org: 'acme-corp', username: 'bob' },
    });

    expect(result.isError).toBeFalsy();
    expect(scope.isDone()).toBe(true);
  });

  it('propagates a 404 from get_copilot_seat_details_for_user as an MCP tool error', async () => {
    // 404 means the user does not have a Copilot seat in this org.
    nock('https://api.github.com')
      .get('/orgs/test-org/members/unknown-user/copilot')
      .reply(404, {
        message: 'Not Found',
        documentation_url: 'https://docs.github.com/rest',
      });

    const client = await connectedClient(registerCopilotTools, 'read-write');
    const result = await client.callTool({
      name: 'get_copilot_seat_details_for_user',
      arguments: { org: 'test-org', username: 'unknown-user' },
    });

    expect(result.isError).toBe(true);
    const text = (result.content as Array<{ type: string; text: string }>)[0]?.text ?? '';
    expect(text).toContain('Not Found');
  });

  it('propagates a 403 from get_copilot_seat_details_for_user as an MCP tool error', async () => {
    // 403 means the PAT user is not an org owner.
    nock('https://api.github.com')
      .get('/orgs/test-org/members/alice/copilot')
      .reply(403, {
        message: 'Forbidden',
        documentation_url: 'https://docs.github.com/rest',
      });

    const client = await connectedClient(registerCopilotTools, 'read-write');
    const result = await client.callTool({
      name: 'get_copilot_seat_details_for_user',
      arguments: { org: 'test-org', username: 'alice' },
    });

    expect(result.isError).toBe(true);
    const text = (result.content as Array<{ type: string; text: string }>)[0]?.text ?? '';
    expect(text).toContain('Forbidden');
  });

  // ── registration count ────────────────────────────────────────────────────

  it('registers exactly the 3 copilot tools in read-only mode (and the same set in read-write)', async () => {
    const expected = [
      'get_copilot_organization_details',
      'get_copilot_seat_details_for_user',
      'list_copilot_seats',
    ];

    const readOnlyClient = await connectedClient(registerCopilotTools, 'read-only');
    const readOnlyTools = await readOnlyClient.listTools();
    expect(readOnlyTools.tools.map((t) => t.name).sort()).toEqual(expected);

    const readWriteClient = await connectedClient(registerCopilotTools, 'read-write');
    const readWriteTools = await readWriteClient.listTools();
    expect(readWriteTools.tools.map((t) => t.name).sort()).toEqual(expected);
  });
});
