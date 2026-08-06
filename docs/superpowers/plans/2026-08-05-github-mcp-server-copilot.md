# github-mcp-server-js — `copilot` Toolset Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Add the `copilot` toolset (3 read-only tools wrapping GitHub's Copilot org-admin endpoints) to `github-mcp-server-js`, following the exact structural, permission-gating, and response/error pattern established by the `misc`, `apps`, and `packages` toolsets.

**Architecture:** Same pattern as prior toolsets: one `registerCopilotTools(server, octokit, permission)` function registers each tool with `server.registerTool(name, {description, inputSchema}, handler)`; every handler wraps its octokit call in try/catch, returning raw data via `toToolResult`/`toToolError`; `server.ts` gains one more registration call. All octokit calls use the `copilot` namespace (`octokit.rest.copilot.*`). Because every selected endpoint is read-only, the `permission` parameter is accepted (to keep the signature uniform) but never inspected; it is renamed `_permission` inside the function body to satisfy `@typescript-eslint/no-unused-vars`.

**Auth note (critical):** All three Copilot endpoints in this toolset require the caller to be an **organization owner** or **enterprise billing manager**. A PAT that has the right scopes (`manage_billing:copilot` or `read:org`) but belongs to a non-owner org member will receive `403 Forbidden`. A PAT pointing at an org that does not have a Copilot Business or Copilot Enterprise subscription will receive `404 Not Found` (org does not have Copilot enabled) or `422 Unprocessable Entity` (subscription issue). These auth limitations are documented in each tool's description and in the test error-case assertions. No endpoints in the `copilot` namespace are usable without org-owner or enterprise-admin privileges — this is a GitHub API constraint that cannot be worked around.

**Tech Stack:** Same as prior plans — TypeScript, `@modelcontextprotocol/server@^2.0.0`, `octokit@^5.0.5`, `zod@^4.2.0`, `vitest`, `nock`. No new dependencies.

## Global Constraints

- Tool responses return the raw octokit response body as JSON, unmodified. Each tool returns the exact schema documented in the Octokit Verification section. Callers extract fields themselves.
- Errors propagate unmodified: catch the octokit `RequestError`, surface `error.message` in an MCP tool error result via `toToolError`. No normalization layer.
- `get_copilot_organization_details` and `get_copilot_seat_details_for_user` return single objects — no pagination. `list_copilot_seats` is paginated: takes `page` and `per_page` via `paginationSchema`.
- `GITHUB_PERMISSION=read-only` gating is a no-op for this toolset because every tool is read-only. The read-only test still verifies the exact set of 3 tools is registered using `.toEqual([...exact set...])`, not `arrayContaining`, following the pattern established by prior plans.
- Verified tool-name collision check against all 61 existing tool names (8 repos + 12 issues + 10 pull_requests + 5 search + 5 users + 5 gists + 5 activity + 4 packages + 4 misc + 3 apps): **zero collisions** with the 3 new names (`get_copilot_organization_details`, `list_copilot_seats`, `get_copilot_seat_details_for_user`). None of these appear anywhere in the current tool name set.
- No modification to `common.ts`.
- TypeScript only, no new runtime dependencies.

---

## Octokit Verification Results

Verified via `node --input-type=module -e "..."` against the installed `octokit@^5.0.5`:

### `octokit.rest.copilot` — full method table (sorted)

| Method | HTTP | URL |
|---|---|---|
| `addCopilotSeatsForTeams` | POST | `/orgs/{org}/copilot/billing/selected_teams` |
| `addCopilotSeatsForUsers` | POST | `/orgs/{org}/copilot/billing/selected_users` |
| `cancelCopilotSeatAssignmentForTeams` | DELETE | `/orgs/{org}/copilot/billing/selected_teams` |
| `cancelCopilotSeatAssignmentForUsers` | DELETE | `/orgs/{org}/copilot/billing/selected_users` |
| `copilotMetricsForOrganization` | GET | `/orgs/{org}/copilot/metrics` |
| `copilotMetricsForTeam` | GET | `/orgs/{org}/team/{team_slug}/copilot/metrics` |
| `getCopilotOrganizationDetails` | GET | `/orgs/{org}/copilot/billing` |
| `getCopilotSeatDetailsForUser` | GET | `/orgs/{org}/members/{username}/copilot` |
| `listCopilotSeats` | GET | `/orgs/{org}/copilot/billing/seats` |

**Octokit surprise — metrics methods use the name `copilotMetrics*` not `listCopilotMetrics*`:** The two metrics methods are named `copilotMetricsForOrganization` and `copilotMetricsForTeam` (not prefixed with `list` or `get`). This naming is unusual compared to other octokit REST methods (which consistently use `list*`, `get*`, `create*`, etc.) but reflects how the underlying REST endpoint name maps to the method (the operation ID is `copilot/copilot-metrics-for-organization`). Both are GET endpoints returning arrays of daily metrics objects.

**Octokit surprise — seat management write endpoints present:** The `copilot` namespace includes 4 write/mutating endpoints (`addCopilotSeatsForTeams`, `addCopilotSeatsForUsers`, `cancelCopilotSeatAssignmentForTeams`, `cancelCopilotSeatAssignmentForUsers`). These are all excluded — they are seat provisioning/deprovisioning operations (write) and require `manage_billing:copilot` or `admin:org` scope.

**Auth compatibility note:** All 9 methods in the `copilot` namespace require org-owner or enterprise-admin credentials. There are no public or PAT-user-context endpoints in this namespace (unlike the `apps` namespace which had `/user/installations` endpoints). Every read endpoint requires either `manage_billing:copilot` or `read:org` scope, **and** the calling user must be an org owner. This means the copilot toolset is strictly for org admins; regular PAT users will receive `403` from every tool.

---

## Reference: Verified Octokit Parameter Shapes

Confirmed against `@octokit/openapi-types/types.d.ts` operations:

| Tool | octokit method | HTTP | Path params | Query params | Response body type |
|---|---|---|---|---|---|
| `get_copilot_organization_details` | `copilot.getCopilotOrganizationDetails` | GET `/orgs/{org}/copilot/billing` | `org` (string) | — | `copilot-organization-details` (JSON) |
| `list_copilot_seats` | `copilot.listCopilotSeats` | GET `/orgs/{org}/copilot/billing/seats` | `org` (string) | `page?`, `per_page?` | `{ total_seats?, seats?: copilot-seat-details[] }` (JSON) |
| `get_copilot_seat_details_for_user` | `copilot.getCopilotSeatDetailsForUser` | GET `/orgs/{org}/members/{username}/copilot` | `org` (string), `username` (string) | — | `copilot-seat-details` (JSON) |

**`copilot-organization-details` schema** (from `components["schemas"]["copilot-organization-details"]`):
```
{
  seat_breakdown: {
    total?: number,
    added_this_cycle?: number,
    pending_cancellation?: number,
    pending_invitation?: number,
    active_this_cycle?: number,
    inactive_this_cycle?: number
  },
  public_code_suggestions: "allow" | "block" | "unconfigured",
  ide_chat?: "enabled" | "disabled" | "unconfigured",
  platform_chat?: "enabled" | "disabled" | "unconfigured",
  cli?: "enabled" | "disabled" | "unconfigured",
  seat_management_setting: "assign_all" | "assign_selected" | "disabled" | "unconfigured",
  plan_type?: "business" | "enterprise",
  [key: string]: unknown
}
```
Status codes: `200 OK`, `401 Unauthorized`, `403 Forbidden`, `404 Not Found`, `422 Unprocessable Entity`, `500 Internal Server Error`.

**`list-copilot-seats` response** (from `operations["copilot/list-copilot-seats"]`):
```
{
  total_seats?: number,
  seats?: copilot-seat-details[]
}
```
Status codes: `200 OK`, `401 Unauthorized`, `403 Forbidden`, `404 Not Found`, `500 Internal Server Error`.

**`copilot-seat-details` schema** (from `components["schemas"]["copilot-seat-details"]`):
```
{
  assignee?: nullable-simple-user,
  organization?: nullable-organization-simple,
  assigning_team?: team | enterprise-team | null,
  pending_cancellation_date?: string | null,
  last_activity_at?: string | null,
  last_activity_editor?: string | null,
  last_authenticated_at?: string | null,
  created_at: string,
  updated_at?: string,     // deprecated
  plan_type?: "business" | "enterprise" | "unknown"
}
```

**`get-copilot-seat-details-for-user` response** (from `operations["copilot/get-copilot-seat-details-for-user"]`):
Returns a single `copilot-seat-details` object.
Status codes: `200 OK`, `401 Unauthorized`, `403 Forbidden`, `404 Not Found`, `422 Unprocessable Entity`, `500 Internal Server Error`.

**Auth notes from OpenAPI spec:**
- `getCopilotOrganizationDetails`: needs `manage_billing:copilot` or `read:org` scope; only organization owners can call this.
- `listCopilotSeats`: needs `manage_billing:copilot` or `read:org` scope; only organization owners can view assigned seats.
- `getCopilotSeatDetailsForUser`: needs `manage_billing:copilot` or `read:org` scope; only organization owners can view seat details for members.

**`per_page` note for `listCopilotSeats`:** The OpenAPI spec defines `per_page` as a plain `number` (not a reference to the standard `per-page` parameter). The effective maximum is 100 (consistent with GitHub's standard pagination). `paginationSchema` from `common.ts` uses `max(100).default(30)`, which matches.

**cspell.json note:** The word `copilot` is recognized by cspell's default English dictionary (it is a standard word). No new words need to be added to `cspell.json` for this toolset. `org` and `username` are standard identifiers not spell-checked as prose. If cspell flags `unconfigured` in a description string, add it to `cspell.json`'s `words` array at pre-commit time — but this is expected to be a no-op since the word does not appear in source strings (it only appears in this plan document).

---

## File Structure

```
github-mcp-server-js/
  src/
    toolsets/
      copilot.ts              # NEW: registerCopilotTools(server, octokit, permission)
    server.ts                 # MODIFIED: calls registerCopilotTools
  test/
    unit/
      toolsets/
        copilot.test.ts       # NEW: mirrors apps.test.ts's structure
```

`common.ts` is NOT modified. `README.md`'s Toolsets section is updated in Task 2 (Step 5).

---

## Task 1: Implement the `copilot` toolset (3 tools) and its tests

**Files:**
- Create: `src/toolsets/copilot.ts`
- Create: `test/unit/toolsets/copilot.test.ts`

**Interfaces:**
- Consumes: `paginationSchema`, `toToolResult`, `toToolError` from `./common.js`. Does NOT need `ownerRepoSchema`, `issueNumberSchema`, or `pullNumberSchema`.
- Produces (for Task 2 / `server.ts` to consume):
  - `registerCopilotTools(server: McpServer, octokit: Octokit, permission: 'read-only' | 'read-write'): void`

- [x] **Step 1: Write the failing tests**

Create `test/unit/toolsets/copilot.test.ts`:

```typescript
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
```

- [x] **Step 2: Run tests to verify they fail**

Run: `npm test -- copilot`
Expected: FAIL with a module-not-found error for `../../../src/toolsets/copilot.js` (the file doesn't exist yet).

- [x] **Step 3: Create `src/toolsets/copilot.ts`**

```typescript
import type { McpServer } from '@modelcontextprotocol/server';
import type { Octokit } from 'octokit';
import { z } from 'zod';
import { paginationSchema, toToolError, toToolResult } from './common.js';

export function registerCopilotTools(
  server: McpServer,
  octokit: Octokit,
  _permission: 'read-only' | 'read-write',
): void {
  // ── get_copilot_organization_details ──────────────────────────────────────

  server.registerTool(
    'get_copilot_organization_details',
    {
      description:
        'Get GitHub Copilot seat information and policy settings for an organization. ' +
        'Returns seat breakdown (total, active, inactive, pending cancellation, pending invitation, ' +
        'added this cycle), subscription plan type (business or enterprise), and policy settings ' +
        '(public code suggestions filter, IDE chat, platform chat, CLI enablement, ' +
        'seat management mode). ' +
        'Requires the authenticated user to be an organization owner. ' +
        'Requires a token with manage_billing:copilot or read:org scope. ' +
        'Returns 404 if the organization does not have a Copilot Business or Enterprise subscription. ' +
        'Returns 403 if the token lacks sufficient scope or the user is not an org owner.',
      inputSchema: z.object({
        org: z.string().describe('The organization login name (e.g. "my-company").'),
      }),
    },
    async ({ org }) => {
      try {
        const response = await octokit.rest.copilot.getCopilotOrganizationDetails({ org });
        return toToolResult(response.data);
      } catch (error) {
        return toToolError(error);
      }
    },
  );

  // ── list_copilot_seats ────────────────────────────────────────────────────

  server.registerTool(
    'list_copilot_seats',
    {
      description:
        'List all GitHub Copilot seat assignments for an organization. ' +
        'Returns each assigned seat with the assignee user details, the team or organization ' +
        'through which access was granted, the seat creation date, last Copilot activity timestamp, ' +
        'last editor used, and pending cancellation date if applicable. ' +
        'Requires the authenticated user to be an organization owner. ' +
        'Requires a token with manage_billing:copilot or read:org scope. ' +
        'Returns 404 if the organization does not have a Copilot subscription. ' +
        'Returns 403 if the token lacks sufficient scope or the user is not an org owner. ' +
        'Paginate with page and per_page (default 30, max 100).',
      inputSchema: z.object({
        org: z.string().describe('The organization login name (e.g. "my-company").'),
        ...paginationSchema,
      }),
    },
    async ({ org, page, per_page }) => {
      try {
        const response = await octokit.rest.copilot.listCopilotSeats({ org, page, per_page });
        return toToolResult(response.data);
      } catch (error) {
        return toToolError(error);
      }
    },
  );

  // ── get_copilot_seat_details_for_user ─────────────────────────────────────

  server.registerTool(
    'get_copilot_seat_details_for_user',
    {
      description:
        'Get GitHub Copilot seat assignment details for a specific member of an organization. ' +
        'Returns the seat creation date, last Copilot activity timestamp, last editor used, ' +
        'last authentication timestamp, pending cancellation date (if applicable), ' +
        'the team or organization granting access, and the Copilot plan type. ' +
        'Only returns results for users who currently have an active Copilot seat. ' +
        'Users must have telemetry enabled in their IDE for activity data to be populated. ' +
        'Requires the authenticated user to be an organization owner. ' +
        'Requires a token with manage_billing:copilot or read:org scope. ' +
        'Returns 404 if the user does not have a Copilot seat in this organization, ' +
        'or if the organization does not have a Copilot subscription. ' +
        'Returns 403 if the token lacks sufficient scope or the user is not an org owner.',
      inputSchema: z.object({
        org: z.string().describe('The organization login name (e.g. "my-company").'),
        username: z
          .string()
          .describe('The GitHub username of the organization member to look up.'),
      }),
    },
    async ({ org, username }) => {
      try {
        const response = await octokit.rest.copilot.getCopilotSeatDetailsForUser({
          org,
          username,
        });
        return toToolResult(response.data);
      } catch (error) {
        return toToolError(error);
      }
    },
  );
}
```

- [x] **Step 4: Run tests to verify they pass**

Run: `npm test -- copilot`
Expected: PASS (11 tests in `copilot.test.ts`).

- [x] **Step 5: Run the full test suite to confirm no regression in other toolsets**

Run: `npm test`
Expected: PASS. Total test count is the previous suite total plus the 11 new tests in `copilot.test.ts`. No pre-existing test file is modified; `common.ts` is unchanged so `common.test.ts` still passes verbatim.

- [x] **Step 6: Commit**

```bash
git add src/toolsets/copilot.ts test/unit/toolsets/copilot.test.ts
git commit -m "feat: add copilot toolset (3 read-only tools: get_copilot_organization_details, list_copilot_seats, get_copilot_seat_details_for_user)"
```

---

## Task 2: Wire `registerCopilotTools` into `server.ts`

**Files:**
- Modify: `src/server.ts`
- Modify: `README.md` (Toolsets section)

**Interfaces:**
- Consumes: `registerCopilotTools(server, octokit, permission)` from Task 1.
- Produces: nothing new — this is the final integration point.

- [x] **Step 1: Modify `src/server.ts`**

Current content (after `apps` was wired — verified against the actual file on `main`):

```typescript
import { McpServer } from '@modelcontextprotocol/server';
import type { Octokit } from 'octokit';
import { registerActivityTools } from './toolsets/activity.js';
import { registerAppsTools } from './toolsets/apps.js';
import { registerGistsTools } from './toolsets/gists.js';
import { registerIssuesTools } from './toolsets/issues.js';
import { registerMiscTools } from './toolsets/misc.js';
import { registerPackagesTools } from './toolsets/packages.js';
import { registerPullRequestsTools } from './toolsets/pull_requests.js';
import { registerReposTools } from './toolsets/repos.js';
import { registerSearchTools } from './toolsets/search.js';
import { registerUsersTools } from './toolsets/users.js';

const SERVER_NAME = 'github-mcp-server-js';
const SERVER_VERSION = '0.1.0';

export function buildServer(
  octokit: Octokit,
  permission: 'read-only' | 'read-write',
): McpServer {
  const server = new McpServer({ name: SERVER_NAME, version: SERVER_VERSION });

  registerReposTools(server, octokit, permission);
  registerIssuesTools(server, octokit, permission);
  registerPullRequestsTools(server, octokit, permission);
  registerSearchTools(server, octokit, permission);
  registerUsersTools(server, octokit, permission);
  registerGistsTools(server, octokit, permission);
  registerActivityTools(server, octokit, permission);
  registerPackagesTools(server, octokit, permission);
  registerMiscTools(server, octokit, permission);
  registerAppsTools(server, octokit, permission);

  return server;
}
```

Replace with (new import sorted alphabetically, new call appended):

```typescript
import { McpServer } from '@modelcontextprotocol/server';
import type { Octokit } from 'octokit';
import { registerActivityTools } from './toolsets/activity.js';
import { registerAppsTools } from './toolsets/apps.js';
import { registerCopilotTools } from './toolsets/copilot.js';
import { registerGistsTools } from './toolsets/gists.js';
import { registerIssuesTools } from './toolsets/issues.js';
import { registerMiscTools } from './toolsets/misc.js';
import { registerPackagesTools } from './toolsets/packages.js';
import { registerPullRequestsTools } from './toolsets/pull_requests.js';
import { registerReposTools } from './toolsets/repos.js';
import { registerSearchTools } from './toolsets/search.js';
import { registerUsersTools } from './toolsets/users.js';

const SERVER_NAME = 'github-mcp-server-js';
const SERVER_VERSION = '0.1.0';

export function buildServer(
  octokit: Octokit,
  permission: 'read-only' | 'read-write',
): McpServer {
  const server = new McpServer({ name: SERVER_NAME, version: SERVER_VERSION });

  registerReposTools(server, octokit, permission);
  registerIssuesTools(server, octokit, permission);
  registerPullRequestsTools(server, octokit, permission);
  registerSearchTools(server, octokit, permission);
  registerUsersTools(server, octokit, permission);
  registerGistsTools(server, octokit, permission);
  registerActivityTools(server, octokit, permission);
  registerPackagesTools(server, octokit, permission);
  registerMiscTools(server, octokit, permission);
  registerAppsTools(server, octokit, permission);
  registerCopilotTools(server, octokit, permission);

  return server;
}
```

- [x] **Step 2: Run the full test suite**

Run: `npm test`
Expected: PASS, same test count as after Task 1 (no test exercises `server.ts` directly — `buildServer` is a thin, non-branching composition function verified by the manual smoke test below).

- [x] **Step 3: Typecheck, lint, build**

Run: `npm run typecheck && npm run lint && npm run build`
Expected: all PASS. The build step confirms `dist/cli.js`'s bundled dependency graph now transitively includes `copilot.ts`.

- [x] **Step 4: Manual end-to-end smoke test**

Run:
```bash
GITHUB_TOKEN=fake-token node dist/cli.js --transport=http --port=3993 &
sleep 1
curl -s -D /tmp/mcp-init-headers.txt -X POST http://localhost:3993/mcp \
  -H 'Content-Type: application/json' \
  -H 'Accept: application/json, text/event-stream' \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"smoke-test","version":"0.0.0"}}}'
SESSION=$(grep -i mcp-session-id /tmp/mcp-init-headers.txt | awk '{print $2}' | tr -d '\r')
curl -s -X POST http://localhost:3993/mcp \
  -H 'Content-Type: application/json' \
  -H 'Accept: application/json, text/event-stream' \
  -H "Mcp-Session-Id: $SESSION" \
  -d '{"jsonrpc":"2.0","id":2,"method":"tools/list","params":{}}'
kill %1
```

Expected: the `initialize` response contains `"serverInfo":{"name":"github-mcp-server-js"...}`. The `tools/list` response includes all 3 copilot tools (`get_copilot_organization_details`, `list_copilot_seats`, `get_copilot_seat_details_for_user`) alongside all 61 previously-shipped tools — proving all toolsets are live in the same server with no duplicate-registration crash. Total tool count: 64.

- [x] **Step 5: Update the README's Toolsets section**

Modify `README.md`'s "Currently implemented" list to add:

```markdown
- `copilot` — Copilot org-admin tools (org-owner PAT required): Copilot subscription details, seat list, per-user seat details (`get_copilot_organization_details`, `list_copilot_seats`, `get_copilot_seat_details_for_user`)
```

Slot it after the existing `apps` bullet, keeping the toolsets listed in the order they were shipped.

- [x] **Step 6: If cspell flags any word, add it to `cspell.json`**

No new cspell words are anticipated for this toolset (all words used — `copilot`, `org`, `username`, `billing`, `seat` — are standard English or recognized technical terms). If cspell does flag something, open `cspell.json` and add the flagged word to the `words` array. This step is expected to be a no-op.

- [x] **Step 7: Commit**

```bash
git add src/server.ts README.md
git commit -m "feat: wire copilot toolset into buildServer"
```

---

## Deliberate Scope Decisions

The following `octokit.rest.copilot.*` methods were introspected and are **intentionally excluded** from this toolset. Each exclusion is justified below.

### Write / seat-management endpoints — excluded (mutating operations)

1. **`addCopilotSeatsForTeams` (POST `/orgs/{org}/copilot/billing/selected_teams`) — write, excluded.** Purchases GitHub Copilot seats for all members of specified teams. Mutating billing operation; excluded unconditionally (not gated on `permission === 'read-write'` because billing seat changes are highly consequential and should not be performed through a general-purpose MCP tool without explicit human confirmation workflows). Requires `manage_billing:copilot` or `admin:org` scope.

2. **`addCopilotSeatsForUsers` (POST `/orgs/{org}/copilot/billing/selected_users`) — write, excluded.** Purchases GitHub Copilot seats for specified individual users. Same rationale as `addCopilotSeatsForTeams` — mutating billing operation excluded unconditionally.

3. **`cancelCopilotSeatAssignmentForTeams` (DELETE `/orgs/{org}/copilot/billing/selected_teams`) — write, excluded.** Sets Copilot seats for all members of specified teams to "pending cancellation". Destructive billing operation — users lose Copilot access at the end of the billing cycle. Excluded unconditionally.

4. **`cancelCopilotSeatAssignmentForUsers` (DELETE `/orgs/{org}/copilot/billing/selected_users`) — write, excluded.** Sets Copilot seats for specified users to "pending cancellation". Same destructive billing rationale. Excluded unconditionally.

### Metrics endpoints — excluded (org-admin and enterprise-only, out of scope for ~3-tool estimate)

5. **`copilotMetricsForOrganization` (GET `/orgs/{org}/copilot/metrics`) — excluded (out of scope).** Returns aggregated daily metrics for Copilot features across an organization (code completions, chat, PR summaries), broken down by editor, language, and model. Read-only and technically includable, but excluded for two reasons:
   - **Auth wall:** Requires the Copilot Metrics API access policy to be explicitly enabled for the organization in GitHub settings — this is an additional admin action beyond just having Copilot. A PAT from an org owner still returns `422 Unprocessable Entity` if the Metrics API policy is not enabled.
   - **Scope budget:** The ~3-tool estimate is met by the three selected tools. The metrics response is a deeply nested array of per-day objects with per-editor/per-language/per-model breakdowns — high informational value but appropriate as a follow-up toolset extension once the base copilot toolset is established.

6. **`copilotMetricsForTeam` (GET `/orgs/{org}/team/{team_slug}/copilot/metrics`) — excluded (out of scope).** Same as `copilotMetricsForOrganization` but scoped to a specific team. Same dual exclusion rationale: Metrics API policy must be explicitly enabled, and this is beyond the ~3-tool scope budget. If metrics tools are added in a follow-up, both `copilotMetricsForOrganization` and `copilotMetricsForTeam` should be added together as a pair.

---

## Self-Review Notes

- **Spec coverage:** `copilot` toolset (Toolset Inventory row: octokit `copilot` namespace, example tools `get_copilot_seat_details, list_copilot_usage`, est. count ~3). The spec's example tool `get_copilot_seat_details` maps to `getCopilotSeatDetailsForUser` in octokit — the full tool name `get_copilot_seat_details_for_user` is used (consistent with the `packages` and `apps` naming convention of appending `_for_user` or `_for_authenticated_user` when the endpoint is user-scoped). The spec's example `list_copilot_usage` does not map to a single octokit method — the closest is `copilotMetricsForOrganization`, which is excluded (see Deliberate scope decisions). The third tool (`get_copilot_organization_details`) substitutes as the org-level information tool, analogous to how `get_app` substituted for the JWT-only `getAuthenticated` in the `apps` plan. Count exactly matches ~3.

- **Why `list_copilot_usage` is not implemented:** The spec's `list_copilot_usage` example maps conceptually to `copilotMetricsForOrganization`. However, this endpoint has a secondary auth requirement (Metrics API policy must be enabled in org settings) beyond the standard org-owner PAT requirement shared by all copilot endpoints. This creates a confusing failure mode: an org owner with the right token scopes still gets `422` until an admin enables the policy. Given the ~3-tool budget is met by the three selected tools and all of them have a more straightforward failure mode (403/404 from missing auth/subscription), the metrics tools are deferred to a follow-up plan. The plan documents this clearly so a future implementer can add them without re-researching the auth requirements.

- **All three tools are org-admin-only — documented in descriptions:** Unlike the `apps` toolset (which had PAT-user-context endpoints), every endpoint in the `copilot` namespace requires org-owner credentials. This is documented in each tool's description with explicit scope requirements and expected error codes (403 for insufficient scope/role, 404 for missing subscription, 422 for billing issues). LLM clients will surface these descriptions to users, preventing confusion about why tools fail for non-admin tokens.

- **Error test assertions use 403 and 404, not 500:** The two most common failure modes for copilot tools are:
  - `403 Forbidden` — PAT lacks scope or user is not an org owner
  - `404 Not Found` — org doesn't have a Copilot subscription, or user doesn't have a seat
  The tests specifically cover both of these for the relevant tools rather than testing generic 500 errors, making the test suite meaningful for the actual failure cases that operators will encounter.

- **`list_copilot_seats` pagination:** `listCopilotSeats` accepts `page` and `per_page` as optional query parameters. The OpenAPI spec's `per_page` is a plain `number` (not referencing the standard `per-page` parameter component), but the effective max is 100, consistent with `paginationSchema`. `paginationSchema` is spread into the input schema, same as in `list_installations_for_authenticated_user` in the `apps` toolset.

- **Test fixture values are plain English:** All test fixture org names use `test-org` and `acme-corp` — meaningful English words that will not pollute cspell.json. Username fixtures use `alice` and `bob` — common English names, well within any spell dictionary. No base64-looking strings are used (lessons from the `apps` plan's `Oklud`, `Vncm`, `Nlcj` additions).

- **`_permission` naming:** Applied throughout — `_permission` inside the function body to satisfy `@typescript-eslint/no-unused-vars`, consistent with `misc`, `apps`, `packages`, `search`, and all other all-read-only toolsets.

- **Tool-name collision check performed:** All 3 tool names (`get_copilot_organization_details`, `list_copilot_seats`, `get_copilot_seat_details_for_user`) verified against all 61 existing tool names: zero collisions. The prefix `copilot_` does not appear in any existing tool name.

- **Lessons applied from prior plans:**
  - **`issues` I1 (strict permission-gating equality):** Task 1's registration-count test uses `.toEqual([...exact 3 names...])`, not `arrayContaining`. Run against both `read-only` and `read-write` clients.
  - **`issues` I3 (wire-level filter passthrough):** `list_copilot_seats`'s pagination test uses `nock(...).query({...full params...})` plus `expect(scope.isDone()).toBe(true)`. The `get_copilot_seat_details_for_user` wire-passthrough test uses a different org (`acme-corp`) to prove path params are forwarded, not hardcoded.
  - **`search` M (all-read-only `_permission` naming):** Applied.
  - **`packages` M (tool-name collision check):** Performed explicitly.
  - **`apps` auth awareness:** Like the `apps` plan, each included method's auth requirements were individually verified. Unlike `apps` (which had a mix of JWT-only, PAT-user-context, and fully-public endpoints), all copilot endpoints uniformly require org-owner credentials — this simplifies the selection (no PAT-compatibility filtering needed) but means the toolset is strictly for org admins.

- **No placeholders:** All octokit method names (`copilot.getCopilotOrganizationDetails`, `copilot.listCopilotSeats`, `copilot.getCopilotSeatDetailsForUser`), HTTP verbs, URL paths, path parameters, query parameters, and response body shapes were verified directly against the installed `octokit@^5.0.5` (via `node --input-type=module` introspection) and `@octokit/openapi-types/types.d.ts` operation definitions. Every intentionally excluded method is documented in the Deliberate scope decisions section.

- **Task right-sizing:** Task 1 bundles all 3 tools + tests into one reviewer gate, matching every prior plan. Task 2 is a separate gate: wiring is where duplicate-registration crashes and stale-README rot surface.
