# github-mcp-server-js — `orgs_teams` Toolset Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Add the `orgs_teams` toolset (8 tools: 6 read for org/team/member introspection + 2 write for team-membership management) to `github-mcp-server-js`, following the exact structural, permission-gating, and response/error pattern established by the eleven shipped toolsets.

**Architecture:** Same pattern as `issues`/`gists`/`activity`: one `registerOrgsTeamsTools(server, octokit, permission)` function registers each tool; every handler wraps its octokit call in try/catch, returning raw JSON via `toToolResult`/`toToolError`; write tools are registered only when `permission === 'read-write'`; `server.ts` gains one more registration call. Reads use `octokit.rest.orgs.*`, `octokit.rest.teams.*`, and one `octokit.rest.repos.listForOrg` (cross-namespace — the `list_org_repos` tool is conceptually organization-scoped even though the octokit method lives under `repos`; this is the same pattern the design's example row implies).

**Tech Stack:** Same as prior plans — TypeScript, `@modelcontextprotocol/server@^2.0.0`, `octokit@^5.0.5`, `zod@^4.2.0`, `vitest`, `nock`. No new dependencies.

## Global Constraints

- Tool responses return the raw octokit response body as JSON, unmodified. No field trimming.
- Errors propagate unmodified via `toToolError`.
- List tools use `paginationSchema` from `common.ts` (page default 1, per_page default 30, max 100).
- `GITHUB_PERMISSION=read-only` prevents write-tool handlers from being registered.
- Every tool's `org`/`team_slug`/`username` parameters use inline Zod fields with the exact `.describe()` text established below (no new shared schema added to `common.ts` — these fields are used only by this one toolset).
- Verified tool-name collision check against the 64 existing tool names on `main` (8 repos + 12 issues + 10 pull_requests + 5 search + 5 users + 5 gists + 5 activity + 4 packages + 4 misc + 3 apps + 3 copilot): **zero collisions** with the 8 tool names chosen below (`get_org`, `list_org_members`, `list_org_repos`, `list_teams`, `get_team_by_name`, `list_team_members`, `add_or_update_team_membership`, `remove_team_membership`). Verified before finalizing names.
- `remove_team_membership` returns `204 No Content` — synthesize `{ removed: true }` in the handler (matches lock/unlock/unstar precedent).
- TypeScript only, no new runtime dependencies.

---

## File Structure

```
github-mcp-server-js/
  src/
    toolsets/
      orgs_teams.ts             # NEW: registerOrgsTeamsTools(server, octokit, permission)
    server.ts                   # MODIFIED: calls registerOrgsTeamsTools
  test/
    unit/
      toolsets/
        orgs_teams.test.ts      # NEW: mirrors issues.test.ts
```

---

## Reference: verified octokit shapes

Confirmed against `octokit.rest.*[method].endpoint.DEFAULTS` and `@octokit/openapi-types/types.d.ts` lines 89095, 95309, 97643, 98755, 98852, 99562, 99638, 99687.

| Tool | octokit method | HTTP | Path/query params |
|---|---|---|---|
| `get_org` | `orgs.get` | GET `/orgs/{org}` | path: `org` |
| `list_org_members` | `orgs.listMembers` | GET `/orgs/{org}/members` | path: `org`; query: `filter` (`2fa_disabled`\|`2fa_insecure`\|`all`), `role` (`all`\|`admin`\|`member`), `page`, `per_page` |
| `list_org_repos` | `repos.listForOrg` | GET `/orgs/{org}/repos` | path: `org`; query: `type` (`all`\|`public`\|`private`\|`forks`\|`sources`\|`member`), `sort` (`created`\|`updated`\|`pushed`\|`full_name`), `direction` (`asc`\|`desc`), `page`, `per_page` |
| `list_teams` | `teams.list` | GET `/orgs/{org}/teams` | path: `org`; query: `page`, `per_page` |
| `get_team_by_name` | `teams.getByName` | GET `/orgs/{org}/teams/{team_slug}` | path: `org`, `team_slug` |
| `list_team_members` | `teams.listMembersInOrg` | GET `/orgs/{org}/teams/{team_slug}/members` | path: `org`, `team_slug`; query: `role` (`member`\|`maintainer`\|`all`), `page`, `per_page` |
| `add_or_update_team_membership` | `teams.addOrUpdateMembershipForUserInOrg` | PUT `/orgs/{org}/teams/{team_slug}/memberships/{username}` | path: `org`, `team_slug`, `username`; body: `role` (`member`\|`maintainer`) |
| `remove_team_membership` | `teams.removeMembershipForUserInOrg` | DELETE `/orgs/{org}/teams/{team_slug}/memberships/{username}` | path: `org`, `team_slug`, `username` |

Response bodies:
- `get_org` → `organization-full`
- `list_org_members` → `simple-user[]`
- `list_org_repos` → `minimal-repository[]`
- `list_teams`, `list_team_members` → `team[]` / `simple-user[]`
- `get_team_by_name` → `team-full`
- `add_or_update_team_membership` → `team-membership`
- `remove_team_membership` → `204 No Content` → synthesize `{ removed: true }`

**Deliberate scope decisions:**

1. **Excluded org-admin surface:** `orgs.blockUser`/`unblockUser`, `orgs.createInvitation`/`cancelInvitation`, `orgs.createWebhook`/`updateWebhook`/`deleteWebhook`, `orgs.update`/`delete`, `orgs.setMembershipForUser`/`removeMembershipForUser`, all custom-properties, all org-roles, all attestations, all PAT-grant endpoints. Reason: admin-tier operations that most PAT users can't perform (403) and are dangerous to surface in an LLM-driven tool. Team creation/deletion (`teams.create`/`teams.deleteInOrg`) is also excluded for the same reason — creating/removing a team is a rare enough operation that human-driven UX is preferred.

2. **Excluded team-discussion surface:** all `teams.*Discussion*` methods (create/get/update/delete discussions and discussion comments). Reason: team discussions are a legacy communication surface; org communication has largely moved to Slack/Teams integrations and organization discussions on repositories. Not enough utility to justify the tool count.

3. **Excluded team-repo permission management:** `teams.addOrUpdateRepoPermissionsInOrg`, `teams.removeRepoInOrg`, `teams.listReposInOrg`, `teams.checkPermissionsForRepoInOrg`. Reason: the team↔repo permission surface is complex enough that it warrants a dedicated follow-up plan if needed; leaving it out keeps the toolset at the design's ~8 estimate.

4. **`list_org_repos` uses `repos.listForOrg` (cross-namespace):** the design's example row explicitly names `list_org_repos` as an `orgs_teams` tool even though the underlying octokit method is `repos.listForOrg`. This crossing is intentional — the tool is semantically organization-scoped, and grouping it alongside `get_org` / `list_org_members` matches how a caller thinks about organization data. The alternative (putting it in `repos`) would fragment the org-inspection experience.

5. **Excluded child-teams and pending-invitations for teams:** `teams.listChildInOrg`, `teams.listPendingInvitationsInOrg`, `teams.getMembershipForUserInOrg`. Reason: `list_team_members` covers the common case; membership state for a single user can be inferred from the list. Nested team hierarchies are a rare need and out of scope for v1.

---

## Task 1: Implement the `orgs_teams` toolset — read tools (6 tools)

**Files:**
- Create: `src/toolsets/orgs_teams.ts`
- Test: `test/unit/toolsets/orgs_teams.test.ts`

**Interfaces:**
- Consumes: `paginationSchema`, `toToolResult`, `toToolError` from `./common.js`.
- Produces (for Task 2 to extend and Task 3 / `server.ts` to consume):
  - `registerOrgsTeamsTools(server: McpServer, octokit: Octokit, permission: 'read-only' | 'read-write'): void`

- [x] **Step 1: Write the failing tests**

Create `test/unit/toolsets/orgs_teams.test.ts`:

```typescript
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
```

- [x] **Step 2: Run tests to verify they fail**

Run: `npm test -- orgs_teams`
Expected: FAIL with module-not-found on `src/toolsets/orgs_teams.js`.

- [x] **Step 3: Create `src/toolsets/orgs_teams.ts`**

```typescript
import type { McpServer } from '@modelcontextprotocol/server';
import type { Octokit } from 'octokit';
import { z } from 'zod';
import { paginationSchema, toToolResult, toToolError } from './common.js';

const orgSchema = {
  org: z.string().describe('Organization login (e.g. "acme")'),
};

const teamSlugSchema = {
  team_slug: z.string().describe('Team slug (URL-friendly name; e.g. "engineering")'),
};

const usernameSchema = {
  username: z.string().describe('GitHub username (login)'),
};

export function registerOrgsTeamsTools(
  server: McpServer,
  octokit: Octokit,
  permission: 'read-only' | 'read-write',
): void {
  server.registerTool(
    'get_org',
    {
      description: 'Get a GitHub organization by login.',
      inputSchema: z.object({ ...orgSchema }),
    },
    async ({ org }) => {
      try {
        const response = await octokit.rest.orgs.get({ org });
        return toToolResult(response.data);
      } catch (error) {
        return toToolError(error);
      }
    },
  );

  server.registerTool(
    'list_org_members',
    {
      description: 'List members of a GitHub organization.',
      inputSchema: z.object({
        ...orgSchema,
        filter: z
          .enum(['2fa_disabled', '2fa_insecure', 'all'])
          .optional()
          .describe('Filter members (2fa_disabled/2fa_insecure only visible to org owners).'),
        role: z.enum(['all', 'admin', 'member']).optional().describe('Filter by role.'),
        ...paginationSchema,
      }),
    },
    async ({ org, filter, role, page, per_page }) => {
      try {
        const response = await octokit.rest.orgs.listMembers({
          org,
          filter,
          role,
          page,
          per_page,
        });
        return toToolResult(response.data);
      } catch (error) {
        return toToolError(error);
      }
    },
  );

  server.registerTool(
    'list_org_repos',
    {
      description: 'List repositories in a GitHub organization.',
      inputSchema: z.object({
        ...orgSchema,
        type: z
          .enum(['all', 'public', 'private', 'forks', 'sources', 'member'])
          .optional()
          .describe('Type of repositories to list.'),
        sort: z
          .enum(['created', 'updated', 'pushed', 'full_name'])
          .optional()
          .describe('Field to sort by.'),
        direction: z.enum(['asc', 'desc']).optional().describe('Sort direction.'),
        ...paginationSchema,
      }),
    },
    async ({ org, type, sort, direction, page, per_page }) => {
      try {
        const response = await octokit.rest.repos.listForOrg({
          org,
          type,
          sort,
          direction,
          page,
          per_page,
        });
        return toToolResult(response.data);
      } catch (error) {
        return toToolError(error);
      }
    },
  );

  server.registerTool(
    'list_teams',
    {
      description: 'List teams in a GitHub organization.',
      inputSchema: z.object({
        ...orgSchema,
        ...paginationSchema,
      }),
    },
    async ({ org, page, per_page }) => {
      try {
        const response = await octokit.rest.teams.list({ org, page, per_page });
        return toToolResult(response.data);
      } catch (error) {
        return toToolError(error);
      }
    },
  );

  server.registerTool(
    'get_team_by_name',
    {
      description: 'Get a GitHub team by its slug within an organization.',
      inputSchema: z.object({
        ...orgSchema,
        ...teamSlugSchema,
      }),
    },
    async ({ org, team_slug }) => {
      try {
        const response = await octokit.rest.teams.getByName({ org, team_slug });
        return toToolResult(response.data);
      } catch (error) {
        return toToolError(error);
      }
    },
  );

  server.registerTool(
    'list_team_members',
    {
      description: 'List the members of a GitHub team.',
      inputSchema: z.object({
        ...orgSchema,
        ...teamSlugSchema,
        role: z.enum(['member', 'maintainer', 'all']).optional().describe('Filter by team role.'),
        ...paginationSchema,
      }),
    },
    async ({ org, team_slug, role, page, per_page }) => {
      try {
        const response = await octokit.rest.teams.listMembersInOrg({
          org,
          team_slug,
          role,
          page,
          per_page,
        });
        return toToolResult(response.data);
      } catch (error) {
        return toToolError(error);
      }
    },
  );

  if (permission === 'read-write') {
    server.registerTool(
      'add_or_update_team_membership',
      {
        description:
          'Add a user to a team or update their team role. Requires org-owner or team-maintainer permission.',
        inputSchema: z.object({
          ...orgSchema,
          ...teamSlugSchema,
          ...usernameSchema,
          role: z
            .enum(['member', 'maintainer'])
            .optional()
            .describe('Role to grant (defaults to "member").'),
        }),
      },
      async ({ org, team_slug, username, role }) => {
        try {
          const response = await octokit.rest.teams.addOrUpdateMembershipForUserInOrg({
            org,
            team_slug,
            username,
            role,
          });
          return toToolResult(response.data);
        } catch (error) {
          return toToolError(error);
        }
      },
    );

    server.registerTool(
      'remove_team_membership',
      {
        description:
          'Remove a user from a team. Does not delete the user, only their team membership. Requires org-owner or team-admin permission.',
        inputSchema: z.object({
          ...orgSchema,
          ...teamSlugSchema,
          ...usernameSchema,
        }),
      },
      async ({ org, team_slug, username }) => {
        try {
          await octokit.rest.teams.removeMembershipForUserInOrg({ org, team_slug, username });
          return toToolResult({ removed: true });
        } catch (error) {
          return toToolError(error);
        }
      },
    );
  }
}
```

- [x] **Step 4: Run tests to verify they pass**

Run: `npm test -- orgs_teams`
Expected: PASS (11 tests).

- [x] **Step 5: Run the full suite**

Run: `npm test`
Expected: 151 (prior) + 11 = 162 passing.

- [x] **Step 6: Commit**

Stage `src/toolsets/orgs_teams.ts`, `test/unit/toolsets/orgs_teams.test.ts`, and `cspell.json` (only if hook flags fixture words like `acme` — `acme` is a very common dictionary word so probably not needed). Then:

```bash
git commit -m "feat: add orgs_teams toolset (6 read + 2 write tools)"
```

---

## Task 2: Wire `registerOrgsTeamsTools` into `server.ts`

**Files:**
- Modify: `src/server.ts`
- Modify: `README.md` (Toolsets section)

**Interfaces:**
- Consumes: `registerOrgsTeamsTools` from Task 1.

- [x] **Step 1: Modify `src/server.ts`**

Insert the import alphabetically (between `registerMiscTools` and `registerPackagesTools`) and add the registration call after `registerCopilotTools` (ship-order — copilot was the previous toolset). Final file:

```typescript
import { McpServer } from '@modelcontextprotocol/server';
import type { Octokit } from 'octokit';
import { registerActivityTools } from './toolsets/activity.js';
import { registerAppsTools } from './toolsets/apps.js';
import { registerCopilotTools } from './toolsets/copilot.js';
import { registerGistsTools } from './toolsets/gists.js';
import { registerIssuesTools } from './toolsets/issues.js';
import { registerMiscTools } from './toolsets/misc.js';
import { registerOrgsTeamsTools } from './toolsets/orgs_teams.js';
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
  registerOrgsTeamsTools(server, octokit, permission);

  return server;
}
```

(If the existing `server.ts` has a different current shape — because some prior toolset ordering differs — preserve that ordering, insert the `registerOrgsTeamsTools` import alphabetically, and append the registration call at the end.)

- [x] **Step 2: Run the full test suite**

Run: `npm test`
Expected: PASS, 162 tests.

- [x] **Step 3: Typecheck, lint, build**

Run: `npm run typecheck && npm run lint && npm run build`
Expected: all PASS.

- [x] **Step 4: Update the README's Toolsets section**

Add a bullet after the `copilot` bullet in the "Currently implemented" list:

```markdown
- `orgs_teams` — organization inspection, team listing/lookup, and team-membership management
```

- [x] **Step 5: Commit**

```bash
git add src/server.ts README.md
git commit -m "feat: wire orgs_teams toolset into buildServer"
```

---

## Self-Review Notes

- **Spec coverage:** `orgs_teams` toolset row (octokit `orgs, teams`, examples `list_org_repos, get_org, list_teams, list_team_members`, est. count ~8) — all 4 named examples are covered; total tool count is exactly 8. Pagination and permission gating both applied. `list_org_repos` uses `repos.listForOrg` per the design's intent (cross-namespace grouping to keep org-inspection tools together).
- **Type consistency:** `registerOrgsTeamsTools(server, octokit, permission): void` matches every prior `register*Tools` signature. Write tools inside `if (permission === 'read-write')` matches issues/gists/activity/pull_requests. `remove_team_membership` synthesizes `{ removed: true }` on 204 per the lock/unlock/unstar/delete precedent.
- **No placeholders:** every step has complete runnable code. All octokit method names and parameter shapes verified against `@octokit/openapi-types/types.d.ts` lines 89095, 95309, 97643, 98755, 98852, 99562, 99638, 99687.
- **Task right-sizing:** Task 1 bundles all 6 read tools + 2 write tools together — with 8 near-identical shell handlers, splitting into read/write tasks would produce two near-copies with no meaningful review gate between them (unlike issues/gists where each half has substantively different endpoint shapes). Task 2 remains separate because wiring is where duplicate-registration and README-rot surface.
