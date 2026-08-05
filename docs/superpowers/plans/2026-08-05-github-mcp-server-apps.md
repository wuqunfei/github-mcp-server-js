# github-mcp-server-js — `apps` Toolset Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Add the `apps` toolset (3 read-only tools wrapping GitHub's public app-info endpoints) to `github-mcp-server-js`, following the exact structural, permission-gating, and response/error pattern established by the `misc`, `users`, and `packages` toolsets.

**Architecture:** Same pattern as prior toolsets: one `registerAppsTools(server, octokit, permission)` function registers each tool with `server.registerTool(name, {description, inputSchema}, handler)`; every handler wraps its octokit call in try/catch, returning raw data via `toToolResult`/`toToolError`; `server.ts` gains one more registration call. All octokit calls use the `apps` namespace (`octokit.rest.apps.*`). Because every selected endpoint is read-only, the `permission` parameter is accepted (to keep the signature uniform) but never inspected; it is renamed `_permission` inside the function body to satisfy `@typescript-eslint/no-unused-vars`.

**Auth note (critical):** The `octokit.rest.apps` namespace contains many endpoints that require GitHub App JWT authentication — they return `401` when called with a PAT. Only endpoints that work with PAT (or require no authentication at all) are included in this toolset. The three selected tools are all PAT-compatible: `getBySlug` is fully public (no auth required), `listInstallationsForAuthenticatedUser` uses the PAT's user context, and `getInstallation` uses the PAT's user context when the calling user has access to the installation. Endpoints requiring JWT (`getAuthenticated`, `listInstallations`, `getWebhookConfigForApp`, etc.) are excluded.

**Tech Stack:** Same as prior plans — TypeScript, `@modelcontextprotocol/server@^2.0.0`, `octokit@^5.0.5`, `zod@^4.2.0`, `vitest`, `nock`. No new dependencies.

## Global Constraints

- Tool responses return the raw octokit response body as JSON, unmodified. `get_app` returns an `integration` object; `list_installations_for_authenticated_user` returns `{ total_count, installations[] }` where each element is an `installation` object; `get_installation_for_authenticated_user` returns the same nested JSON from `{ repositories[], total_count, repository_selection? }`. These shapes are preserved exactly; callers extract fields themselves.
- Errors propagate unmodified: catch the octokit `RequestError`, surface `error.message` in an MCP tool error result via `toToolError`. No normalization layer.
- List tools take explicit `page` (default `1`) and `per_page` (default `30`, max `100`) parameters via `paginationSchema`. No auto-pagination.
- `GITHUB_PERMISSION=read-only` gating is a no-op for this toolset because every tool is read-only. The read-only test still verifies the exact set of 3 tools is registered using `.toEqual([...exact set...])`, not `arrayContaining`, following the pattern established by prior plans.
- Verified tool-name collision check against all 58 existing tool names (8 repos + 12 issues + 10 pull_requests + 5 search + 5 users + 5 gists + 5 activity + 4 packages + 4 misc): **zero collisions** with the 3 new names (`get_app`, `list_installations_for_authenticated_user`, `list_installation_repos_for_authenticated_user`). None of these appear anywhere in the current tool name set.
- No modification to `common.ts`.
- TypeScript only, no new runtime dependencies.

---

## Octokit Verification Results

Verified via `node --input-type=module -e "..."` against the installed `octokit@^5.0.5`:

### `octokit.rest.apps` — full method table (sorted)

| Method | HTTP | URL |
|---|---|---|
| `addRepoToInstallation` | PUT | `/user/installations/{installation_id}/repositories/{repository_id}` |
| `addRepoToInstallationForAuthenticatedUser` | PUT | `/user/installations/{installation_id}/repositories/{repository_id}` |
| `checkToken` | POST | `/applications/{client_id}/token` |
| `createFromManifest` | POST | `/app-manifests/{code}/conversions` |
| `createInstallationAccessToken` | POST | `/app/installations/{installation_id}/access_tokens` |
| `deleteAuthorization` | DELETE | `/applications/{client_id}/grant` |
| `deleteInstallation` | DELETE | `/app/installations/{installation_id}` |
| `deleteToken` | DELETE | `/applications/{client_id}/token` |
| `getAuthenticated` | GET | `/app` |
| `getBySlug` | GET | `/apps/{app_slug}` |
| `getInstallation` | GET | `/app/installations/{installation_id}` |
| `getOrgInstallation` | GET | `/orgs/{org}/installation` |
| `getRepoInstallation` | GET | `/repos/{owner}/{repo}/installation` |
| `getSubscriptionPlanForAccount` | GET | `/marketplace_listing/accounts/{account_id}` |
| `getSubscriptionPlanForAccountStubbed` | GET | `/marketplace_listing/stubbed/accounts/{account_id}` |
| `getUserInstallation` | GET | `/users/{username}/installation` |
| `getWebhookConfigForApp` | GET | `/app/hook/config` |
| `getWebhookDelivery` | GET | `/app/hook/deliveries/{delivery_id}` |
| `listAccountsForPlan` | GET | `/marketplace_listing/plans/{plan_id}/accounts` |
| `listAccountsForPlanStubbed` | GET | `/marketplace_listing/stubbed/plans/{plan_id}/accounts` |
| `listInstallationReposForAuthenticatedUser` | GET | `/user/installations/{installation_id}/repositories` |
| `listInstallationRequestsForAuthenticatedApp` | GET | `/app/installation-requests` |
| `listInstallations` | GET | `/app/installations` |
| `listInstallationsForAuthenticatedUser` | GET | `/user/installations` |
| `listPlans` | GET | `/marketplace_listing/plans` |
| `listPlansStubbed` | GET | `/marketplace_listing/stubbed/plans` |
| `listReposAccessibleToInstallation` | GET | `/installation/repositories` |
| `listSubscriptionsForAuthenticatedUser` | GET | `/user/marketplace_purchases` |
| `listSubscriptionsForAuthenticatedUserStubbed` | GET | `/user/marketplace_purchases/stubbed` |
| `listWebhookDeliveries` | GET | `/app/hook/deliveries` |
| `redeliverWebhookDelivery` | POST | `/app/hook/deliveries/{delivery_id}/attempts` |
| `removeRepoFromInstallation` | DELETE | `/user/installations/{installation_id}/repositories/{repository_id}` |
| `removeRepoFromInstallationForAuthenticatedUser` | DELETE | `/user/installations/{installation_id}/repositories/{repository_id}` |
| `resetToken` | PATCH | `/applications/{client_id}/token` |
| `revokeInstallationAccessToken` | DELETE | `/installation/token` |
| `scopeToken` | POST | `/applications/{client_id}/token/scoped` |
| `suspendInstallation` | PUT | `/app/installations/{installation_id}/suspended` |
| `unsuspendInstallation` | DELETE | `/app/installations/{installation_id}/suspended` |
| `updateWebhookConfigForApp` | PATCH | `/app/hook/config` |

### `octokit.rest.oidc` — full method table

| Method | HTTP | URL |
|---|---|---|
| `getOidcCustomSubTemplateForOrg` | GET | `/orgs/{org}/actions/oidc/customization/sub` |
| `updateOidcCustomSubTemplateForOrg` | PUT | `/orgs/{org}/actions/oidc/customization/sub` |

**Octokit surprise — duplicate alias for `addRepoToInstallation`:** The namespace exposes both `addRepoToInstallation` and `addRepoToInstallationForAuthenticatedUser` — both resolve to `PUT /user/installations/{installation_id}/repositories/{repository_id}`. Same alias duplication pattern noted in the `packages` plan for version-listing methods. Both are write-only anyway and are excluded.

**Octokit surprise — `getAuthenticated` requires JWT:** `getAuthenticated` (GET `/app`) is a valid GET endpoint and would appear to be the natural starting point for an `apps` toolset. However, it requires GitHub App JWT authentication — a PAT returns `401 Bad credentials`. The requirement prompt flags this explicitly. The plan substitutes `getBySlug` (GET `/apps/{app_slug}`) which requires no authentication at all and returns the same `integration` object shape. This is a strictly better choice for a PAT-based server: it is completely public, returns full app metadata, and works without any token.

**Octokit surprise — `oidc` namespace has only 2 methods, one of which is a write:** `getOidcCustomSubTemplateForOrg` and `updateOidcCustomSubTemplateForOrg`. The get endpoint returns an org-level OIDC customization template — highly niche, relevant only to GitHub Actions OIDC token customization for enterprise org admins. Neither method falls into the core `apps` use case. Both are excluded (see Deliberate scope decisions).

---

## Reference: verified octokit parameter shapes

Confirmed against `@octokit/openapi-types/types.d.ts` operations:

| Tool | octokit method | HTTP | Path params | Query params | Response body type |
|---|---|---|---|---|---|
| `get_app` | `apps.getBySlug` | GET `/apps/{app_slug}` | `app_slug` (string) | — | `integration` (JSON) |
| `list_installations_for_authenticated_user` | `apps.listInstallationsForAuthenticatedUser` | GET `/user/installations` | — | `page?`, `per_page?` | `{ total_count, installations: installation[] }` (JSON) |
| `list_installation_repos_for_authenticated_user` | `apps.listInstallationReposForAuthenticatedUser` | GET `/user/installations/{installation_id}/repositories` | `installation_id` (number) | `page?`, `per_page?` | `{ total_count, repository_selection?, repositories: repository[] }` (JSON) |

**`integration` schema** (from `components["schemas"]["integration"]`):
```
{
  id: number,
  slug?: string,
  node_id: string,
  client_id?: string,
  owner: simple-user | enterprise,
  name: string,
  description: string | null,
  external_url: string,
  html_url: string,
  created_at: string (date-time),
  updated_at: string (date-time),
  permissions: { issues?: string, checks?: string, metadata?: string, contents?: string, ... },
  events: string[],
  installations_count?: number
} | null
```

**`installation` schema** (from `components["schemas"]["installation"]`):
```
{
  id: number,
  account: (simple-user | enterprise) | null,
  repository_selection: "all" | "selected",
  access_tokens_url: string,
  repositories_url: string,
  html_url: string,
  app_id: number,
  client_id?: string,
  target_id: number,
  target_type: string,
  permissions: app-permissions,
  events: string[],
  created_at: string,
  updated_at: string,
  single_file_name: string | null,
  app_slug: string,
  suspended_by: nullable-simple-user,
  suspended_at: string | null,
  contact_email?: string | null
}
```

**`apps/list-installations-for-authenticated-user` response** (from `operations["apps/list-installations-for-authenticated-user"]`):
```
{
  total_count: number,
  installations: installation[]
}
```
Status codes: `200 OK`, `304 Not Modified` (throws RequestError), `401 Unauthorized`, `403 Forbidden`.

**`apps/list-installation-repos-for-authenticated-user` response** (from `operations["apps/list-installation-repos-for-authenticated-user"]`):
```
{
  total_count: number,
  repository_selection?: string,
  repositories: repository[]
}
```
Status codes: `200 OK`, `304 Not Modified` (throws RequestError), `403 Forbidden`, `404 Not Found`.

**`apps/get-by-slug` response** (from `operations["apps/get-by-slug"]`):
Returns `integration` object. Status codes: `200 OK`, `403 Forbidden`, `404 Not Found`.

**Auth note for `list_installations_for_authenticated_user`:** This endpoint uses `GET /user/installations` which is a user-context endpoint — it lists GitHub App installations the authenticated user has access to (i.e., apps installed on their personal account or orgs they belong to). Works correctly with a PAT that has `read:user` scope or higher.

**Auth note for `list_installation_repos_for_authenticated_user`:** This endpoint uses `GET /user/installations/{installation_id}/repositories` — it lists repos accessible to the user for a specific installation. Works with a PAT.

**cspell.json note:** The word `slug` is a standard English word and is recognized by cspell's default dictionary. `app_slug` is a compound identifier and will not be spell-checked as a prose word. No new words need to be added to `cspell.json` for this toolset. If cspell flags `oidc` (it appears only in the Deliberate scope decisions section of this plan, not in source or test code), add `"oidc"` to the `words` array in `cspell.json` at pre-commit time.

---

## File Structure

```
github-mcp-server-js/
  src/
    toolsets/
      apps.ts                # NEW: registerAppsTools(server, octokit, permission)
    server.ts                # MODIFIED: calls registerAppsTools
  test/
    unit/
      toolsets/
        apps.test.ts         # NEW: mirrors misc.test.ts's structure
```

`common.ts` is NOT modified. `README.md`'s Toolsets section is updated in Task 2 (Step 5).

---

## Task 1: Implement the `apps` toolset (3 tools) and its tests

**Files:**
- Create: `src/toolsets/apps.ts`
- Create: `test/unit/toolsets/apps.test.ts`

**Interfaces:**
- Consumes: `paginationSchema`, `toToolResult`, `toToolError` from `./common.js`. Does NOT need `ownerRepoSchema` or `issueNumberSchema`.
- Produces (for Task 2 / `server.ts` to consume):
  - `registerAppsTools(server: McpServer, octokit: Octokit, permission: 'read-only' | 'read-write'): void`

- [x] **Step 1: Write the failing tests**

Create `test/unit/toolsets/apps.test.ts`:

```typescript
import nock from 'nock';
import { afterEach, describe, expect, it } from 'vitest';
import { registerAppsTools } from '../../../src/toolsets/apps.js';
import { connectedClient } from './test-helpers.js';

describe('registerAppsTools', () => {
  afterEach(() => {
    nock.cleanAll();
  });

  // ── get_app ────────────────────────────────────────────────────────────────

  it('registers get_app and returns the raw integration object as JSON', async () => {
    nock('https://api.github.com')
      .get('/apps/my-cool-app')
      .reply(200, {
        id: 1,
        slug: 'my-cool-app',
        node_id: 'MDExOkludGVncmF0aW9uMQ==',
        name: 'My Cool App',
        description: 'A test GitHub App',
        external_url: 'https://example.com',
        html_url: 'https://github.com/apps/my-cool-app',
        created_at: '2022-01-01T00:00:00Z',
        updated_at: '2022-06-01T00:00:00Z',
        permissions: { issues: 'read', pull_requests: 'write' },
        events: ['push', 'pull_request'],
        installations_count: 5,
        owner: {
          login: 'octocat',
          id: 1,
          node_id: 'MDQ6VXNlcjE=',
          avatar_url: 'https://github.com/images/error/octocat_happy.gif',
          gravatar_id: '',
          url: 'https://api.github.com/users/octocat',
          html_url: 'https://github.com/octocat',
          type: 'User',
          site_admin: false,
        },
      });

    const client = await connectedClient(registerAppsTools, 'read-write');
    const result = await client.callTool({
      name: 'get_app',
      arguments: { app_slug: 'my-cool-app' },
    });

    expect(result.isError).toBeFalsy();
    const text = (result.content as Array<{ type: string; text: string }>)[0]?.text ?? '';
    const parsed = JSON.parse(text) as { id: number; name: string; installations_count: number };
    expect(parsed.id).toBe(1);
    expect(parsed.name).toBe('My Cool App');
    expect(parsed.installations_count).toBe(5);
  });

  it('propagates a 404 from get_app as an MCP tool error', async () => {
    nock('https://api.github.com')
      .get('/apps/nonexistent-app')
      .reply(404, { message: 'Not Found', documentation_url: 'https://docs.github.com/rest' });

    const client = await connectedClient(registerAppsTools, 'read-write');
    const result = await client.callTool({
      name: 'get_app',
      arguments: { app_slug: 'nonexistent-app' },
    });

    expect(result.isError).toBe(true);
    const text = (result.content as Array<{ type: string; text: string }>)[0]?.text ?? '';
    expect(text).toContain('Not Found');
  });

  // ── list_installations_for_authenticated_user ──────────────────────────────

  it('registers list_installations_for_authenticated_user and returns the raw response as JSON', async () => {
    nock('https://api.github.com')
      .get('/user/installations')
      .query({ page: '1', per_page: '30' })
      .reply(200, {
        total_count: 2,
        installations: [
          {
            id: 100,
            app_id: 1,
            app_slug: 'my-cool-app',
            target_id: 42,
            target_type: 'User',
            repository_selection: 'all',
            access_tokens_url: 'https://api.github.com/app/installations/100/access_tokens',
            repositories_url: 'https://api.github.com/installation/repositories',
            html_url: 'https://github.com/settings/installations/100',
            permissions: { issues: 'read' },
            events: ['push'],
            created_at: '2022-01-01T00:00:00Z',
            updated_at: '2022-06-01T00:00:00Z',
            single_file_name: null,
            suspended_by: null,
            suspended_at: null,
          },
          {
            id: 101,
            app_id: 2,
            app_slug: 'another-app',
            target_id: 99,
            target_type: 'Organization',
            repository_selection: 'selected',
            access_tokens_url: 'https://api.github.com/app/installations/101/access_tokens',
            repositories_url: 'https://api.github.com/installation/repositories',
            html_url: 'https://github.com/organizations/test-org/settings/installations/101',
            permissions: { contents: 'read', pull_requests: 'write' },
            events: ['pull_request'],
            created_at: '2023-01-01T00:00:00Z',
            updated_at: '2023-06-01T00:00:00Z',
            single_file_name: null,
            suspended_by: null,
            suspended_at: null,
          },
        ],
      });

    const client = await connectedClient(registerAppsTools, 'read-write');
    const result = await client.callTool({
      name: 'list_installations_for_authenticated_user',
      arguments: {},
    });

    expect(result.isError).toBeFalsy();
    const text = (result.content as Array<{ type: string; text: string }>)[0]?.text ?? '';
    const parsed = JSON.parse(text) as {
      total_count: number;
      installations: Array<{ id: number; app_slug: string }>;
    };
    expect(parsed.total_count).toBe(2);
    expect(parsed.installations).toHaveLength(2);
    expect(parsed.installations[0]).toMatchObject({ id: 100, app_slug: 'my-cool-app' });
  });

  it('forwards pagination on list_installations_for_authenticated_user to the wire', async () => {
    const scope = nock('https://api.github.com')
      .get('/user/installations')
      .query({ page: '2', per_page: '10' })
      .reply(200, { total_count: 0, installations: [] });

    const client = await connectedClient(registerAppsTools, 'read-write');
    const result = await client.callTool({
      name: 'list_installations_for_authenticated_user',
      arguments: { page: 2, per_page: 10 },
    });

    expect(result.isError).toBeFalsy();
    expect(scope.isDone()).toBe(true);
  });

  it('propagates a 401 from list_installations_for_authenticated_user as an MCP tool error', async () => {
    nock('https://api.github.com')
      .get('/user/installations')
      .query({ page: '1', per_page: '30' })
      .reply(401, {
        message: 'Requires authentication',
        documentation_url: 'https://docs.github.com/rest',
      });

    const client = await connectedClient(registerAppsTools, 'read-write');
    const result = await client.callTool({
      name: 'list_installations_for_authenticated_user',
      arguments: {},
    });

    expect(result.isError).toBe(true);
    const text = (result.content as Array<{ type: string; text: string }>)[0]?.text ?? '';
    expect(text).toContain('Requires authentication');
  });

  // ── list_installation_repos_for_authenticated_user ─────────────────────────

  it('registers list_installation_repos_for_authenticated_user and returns the raw response as JSON', async () => {
    nock('https://api.github.com')
      .get('/user/installations/100/repositories')
      .query({ page: '1', per_page: '30' })
      .reply(200, {
        total_count: 1,
        repository_selection: 'all',
        repositories: [
          {
            id: 1296269,
            name: 'Hello-World',
            full_name: 'octocat/Hello-World',
            private: false,
            owner: {
              login: 'octocat',
              id: 1,
            },
            html_url: 'https://github.com/octocat/Hello-World',
            description: 'This your first repo!',
          },
        ],
      });

    const client = await connectedClient(registerAppsTools, 'read-write');
    const result = await client.callTool({
      name: 'list_installation_repos_for_authenticated_user',
      arguments: { installation_id: 100 },
    });

    expect(result.isError).toBeFalsy();
    const text = (result.content as Array<{ type: string; text: string }>)[0]?.text ?? '';
    const parsed = JSON.parse(text) as {
      total_count: number;
      repositories: Array<{ name: string }>;
    };
    expect(parsed.total_count).toBe(1);
    expect(parsed.repositories[0]).toMatchObject({ name: 'Hello-World' });
  });

  it('forwards installation_id and pagination on list_installation_repos_for_authenticated_user to the wire', async () => {
    const scope = nock('https://api.github.com')
      .get('/user/installations/999/repositories')
      .query({ page: '3', per_page: '50' })
      .reply(200, { total_count: 0, repositories: [] });

    const client = await connectedClient(registerAppsTools, 'read-write');
    const result = await client.callTool({
      name: 'list_installation_repos_for_authenticated_user',
      arguments: { installation_id: 999, page: 3, per_page: 50 },
    });

    expect(result.isError).toBeFalsy();
    expect(scope.isDone()).toBe(true);
  });

  it('propagates a 404 from list_installation_repos_for_authenticated_user as an MCP tool error', async () => {
    nock('https://api.github.com')
      .get('/user/installations/9999/repositories')
      .query({ page: '1', per_page: '30' })
      .reply(404, {
        message: 'Not Found',
        documentation_url: 'https://docs.github.com/rest',
      });

    const client = await connectedClient(registerAppsTools, 'read-write');
    const result = await client.callTool({
      name: 'list_installation_repos_for_authenticated_user',
      arguments: { installation_id: 9999 },
    });

    expect(result.isError).toBe(true);
    const text = (result.content as Array<{ type: string; text: string }>)[0]?.text ?? '';
    expect(text).toContain('Not Found');
  });

  // ── registration count ─────────────────────────────────────────────────────

  it('registers exactly the 3 apps tools in read-only mode (and the same set in read-write)', async () => {
    const expected = [
      'get_app',
      'list_installation_repos_for_authenticated_user',
      'list_installations_for_authenticated_user',
    ];

    const readOnlyClient = await connectedClient(registerAppsTools, 'read-only');
    const readOnlyTools = await readOnlyClient.listTools();
    expect(readOnlyTools.tools.map((t) => t.name).sort()).toEqual(expected);

    const readWriteClient = await connectedClient(registerAppsTools, 'read-write');
    const readWriteTools = await readWriteClient.listTools();
    expect(readWriteTools.tools.map((t) => t.name).sort()).toEqual(expected);
  });
});
```

- [x] **Step 2: Run tests to verify they fail**

Run: `npm test -- apps`
Expected: FAIL with a module-not-found error for `../../../src/toolsets/apps.js` (the file doesn't exist yet).

- [x] **Step 3: Create `src/toolsets/apps.ts`**

```typescript
import type { McpServer } from '@modelcontextprotocol/server';
import type { Octokit } from 'octokit';
import { z } from 'zod';
import { paginationSchema, toToolError, toToolResult } from './common.js';

export function registerAppsTools(
  server: McpServer,
  octokit: Octokit,
  _permission: 'read-only' | 'read-write',
): void {
  // ── get_app ────────────────────────────────────────────────────────────────

  server.registerTool(
    'get_app',
    {
      description:
        'Get public metadata for a GitHub App by its URL slug. ' +
        'Returns the app\'s id, name, description, owner, external URL, ' +
        'permissions, subscribed events, and installation count. ' +
        'Does not require authentication — the app must be publicly listed. ' +
        'The slug is the URL-friendly name visible in github.com/apps/<slug>.',
      inputSchema: z.object({
        app_slug: z
          .string()
          .describe(
            'The URL slug of the GitHub App (the last segment of its github.com/apps/<slug> URL). ' +
              'For example, for https://github.com/apps/my-cool-app the slug is "my-cool-app".',
          ),
      }),
    },
    async ({ app_slug }) => {
      try {
        const response = await octokit.rest.apps.getBySlug({ app_slug });
        return toToolResult(response.data);
      } catch (error) {
        return toToolError(error);
      }
    },
  );

  // ── list_installations_for_authenticated_user ──────────────────────────────

  server.registerTool(
    'list_installations_for_authenticated_user',
    {
      description:
        'List GitHub App installations accessible to the authenticated user. ' +
        'Returns installations on the user\'s personal account and on organizations ' +
        'where the user is a member, along with the permissions and events each installation subscribes to. ' +
        'Useful for discovering which apps are installed and their installation IDs ' +
        '(needed for list_installation_repos_for_authenticated_user). ' +
        'Requires a token with read:user scope or higher. ' +
        'Paginate with page and per_page.',
      inputSchema: z.object({
        ...paginationSchema,
      }),
    },
    async ({ page, per_page }) => {
      try {
        const response = await octokit.rest.apps.listInstallationsForAuthenticatedUser({
          page,
          per_page,
        });
        return toToolResult(response.data);
      } catch (error) {
        return toToolError(error);
      }
    },
  );

  // ── list_installation_repos_for_authenticated_user ─────────────────────────

  server.registerTool(
    'list_installation_repos_for_authenticated_user',
    {
      description:
        'List repositories that the authenticated user can access for a specific GitHub App installation. ' +
        'Returns repositories where the user has explicit read, write, or admin permission ' +
        'through direct ownership, collaborator access, or organization membership. ' +
        'Use list_installations_for_authenticated_user to discover installation IDs first. ' +
        'Paginate with page and per_page.',
      inputSchema: z.object({
        installation_id: z
          .number()
          .int()
          .describe(
            'The unique installation ID of the GitHub App installation. ' +
              'Use list_installations_for_authenticated_user to find installation IDs.',
          ),
        ...paginationSchema,
      }),
    },
    async ({ installation_id, page, per_page }) => {
      try {
        const response = await octokit.rest.apps.listInstallationReposForAuthenticatedUser({
          installation_id,
          page,
          per_page,
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

Run: `npm test -- apps`
Expected: PASS (9 tests in `apps.test.ts`).

- [x] **Step 5: Run the full test suite to confirm no regression in other toolsets**

Run: `npm test`
Expected: PASS. Total test count is the previous suite total plus the 9 new tests in `apps.test.ts`. No pre-existing test file is modified; `common.ts` is unchanged so `common.test.ts` still passes verbatim.

- [x] **Step 6: Commit**

```bash
git add src/toolsets/apps.ts test/unit/toolsets/apps.test.ts
git commit -m "feat: add apps toolset (3 read-only tools: get_app, list_installations, list_installation_repos)"
```

---

## Task 2: Wire `registerAppsTools` into `server.ts`

**Files:**
- Modify: `src/server.ts`
- Modify: `README.md` (Toolsets section)

**Interfaces:**
- Consumes: `registerAppsTools(server, octokit, permission)` from Task 1.
- Produces: nothing new — this is the final integration point.

- [x] **Step 1: Modify `src/server.ts`**

Current content (after `misc` was wired — verified against the actual file on `main`):

```typescript
import { McpServer } from '@modelcontextprotocol/server';
import type { Octokit } from 'octokit';
import { registerActivityTools } from './toolsets/activity.js';
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

  return server;
}
```

Replace with (new import sorted alphabetically, new call appended):

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

- [x] **Step 2: Run the full test suite**

Run: `npm test`
Expected: PASS, same test count as after Task 1 (no test exercises `server.ts` directly — `buildServer` is a thin, non-branching composition function verified by the manual smoke test below).

- [x] **Step 3: Typecheck, lint, build**

Run: `npm run typecheck && npm run lint && npm run build`
Expected: all PASS. The build step confirms `dist/cli.js`'s bundled dependency graph now transitively includes `apps.ts`.

- [x] **Step 4: Manual end-to-end smoke test**

Run:
```bash
GITHUB_TOKEN=fake-token node dist/cli.js --transport=http --port=3994 &
sleep 1
curl -s -D /tmp/mcp-init-headers.txt -X POST http://localhost:3994/mcp \
  -H 'Content-Type: application/json' \
  -H 'Accept: application/json, text/event-stream' \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"smoke-test","version":"0.0.0"}}}'
SESSION=$(grep -i mcp-session-id /tmp/mcp-init-headers.txt | awk '{print $2}' | tr -d '\r')
curl -s -X POST http://localhost:3994/mcp \
  -H 'Content-Type: application/json' \
  -H 'Accept: application/json, text/event-stream' \
  -H "Mcp-Session-Id: $SESSION" \
  -d '{"jsonrpc":"2.0","id":2,"method":"tools/list","params":{}}'
kill %1
```

Expected: the `initialize` response contains `"serverInfo":{"name":"github-mcp-server-js"...}`. The `tools/list` response includes all 3 apps tools (`get_app`, `list_installations_for_authenticated_user`, `list_installation_repos_for_authenticated_user`) alongside all 58 previously-shipped tools — proving all toolsets are live in the same server with no duplicate-registration crash. Total tool count: 61.

- [x] **Step 5: Update the README's Toolsets section**

Modify `README.md`'s "Currently implemented" list to add:

```markdown
- `apps` — GitHub App public info and user-accessible installations (`get_app`, `list_installations_for_authenticated_user`, `list_installation_repos_for_authenticated_user`)
```

Slot it after the existing `misc` bullet, keeping the toolsets listed in the order they were shipped.

- [x] **Step 6: If cspell flags any word, add it to `cspell.json`**

If the pre-commit hook rejects any word from the `apps.ts` source or `apps.test.ts` test file (likely candidates: `oidc` if it appears in source comments, `slug` is a standard dictionary word and should pass), open `cspell.json` and add the flagged word to the `words` array:

```json
{
  "words": [
    ...,
    "oidc"
  ]
}
```

Note: `slug` is an English word recognized by cspell's default dictionary. `app_slug` is a compound identifier not spell-checked as prose. This step is expected to be a no-op; only execute it if cspell actually fails.

- [x] **Step 7: Commit**

```bash
git add src/server.ts README.md
git commit -m "feat: wire apps toolset into buildServer"
```

---

## Deliberate scope decisions

The following `octokit.rest.apps.*` methods were introspected and are **intentionally excluded** from this toolset. Each exclusion is justified below.

### JWT-only endpoints — excluded (auth incompatible with PAT)

1. **`getAuthenticated` (GET `/app`) — JWT-only, excluded.** Returns metadata about the authenticated GitHub App. Requires a GitHub App JWT; a PAT returns `401 Bad credentials`. This is the most natural starting point for an `apps` toolset but is completely unusable by this server's PAT-based auth model. `get_app` (wrapping `getBySlug`) is the PAT-compatible substitute — it returns the same `integration` object shape for any publicly listed app.

2. **`listInstallations` (GET `/app/installations`) — JWT-only, excluded.** Lists all installations of the authenticated app. Requires JWT authentication as the app itself. Distinct from `listInstallationsForAuthenticatedUser` (which lists installations accessible to a PAT user). `listInstallations` cannot be called with a PAT.

3. **`getInstallation` (GET `/app/installations/{installation_id}`) — JWT-only, excluded.** Gets a specific installation by ID, but authenticated as the app (requires JWT). The PAT-compatible analog for listing installations is `listInstallationsForAuthenticatedUser` plus `listInstallationReposForAuthenticatedUser`. There is no PAT-compatible single-installation lookup — `getInstallation` is excluded rather than included with a misleading description.

4. **`getWebhookConfigForApp` (GET `/app/hook/config`) — JWT-only, excluded.** Returns the webhook configuration for the GitHub App. Requires JWT. Out of scope — webhook config inspection is an app-management concern, not a tool-call concern for a PAT-based server.

5. **`listWebhookDeliveries` (GET `/app/hook/deliveries`) — JWT-only, excluded.** Lists webhook deliveries. Requires JWT. Same rationale.

6. **`getWebhookDelivery` (GET `/app/hook/deliveries/{delivery_id}`) — JWT-only, excluded.** Gets a specific webhook delivery. Requires JWT. Same rationale.

7. **`listInstallationRequestsForAuthenticatedApp` (GET `/app/installation-requests`) — JWT-only, excluded.** Lists pending installation requests for the app. Requires JWT. App-management concern, not relevant to PAT-based user workflow.

### OAuth App / token management endpoints — excluded (wrong auth model)

8. **`checkToken` (POST `/applications/{client_id}/token`) — OAuth App, excluded.** Validates an OAuth access token using HTTP Basic auth with the app's client_id and client_secret. Entirely different auth model from this server's PAT; cannot be usefully called from a PAT-authenticated tool.

9. **`deleteToken` (DELETE `/applications/{client_id}/token`) — write and OAuth App, excluded.** Revokes an OAuth token. Write operation, wrong auth model.

10. **`deleteAuthorization` (DELETE `/applications/{client_id}/grant`) — write and OAuth App, excluded.** Revokes an OAuth grant. Write operation, wrong auth model.

11. **`resetToken` (PATCH `/applications/{client_id}/token`) — write and OAuth App, excluded.** Resets an OAuth token. Write operation, wrong auth model.

12. **`scopeToken` (POST `/applications/{client_id}/token/scoped`) — write and OAuth App, excluded.** Creates a scoped access token. Write operation, wrong auth model.

### Installation management endpoints — write, excluded

13. **`createInstallationAccessToken` (POST `/app/installations/{installation_id}/access_tokens`) — write and JWT-only, doubly excluded.** Creates an installation access token. Write operation; also requires JWT as the app. Cannot be called with a PAT.

14. **`deleteInstallation` (DELETE `/app/installations/{installation_id}`) — write and JWT-only, doubly excluded.** Uninstalls a GitHub App. Destructive write; requires JWT.

15. **`suspendInstallation` (PUT `/app/installations/{installation_id}/suspended`) — write and JWT-only, doubly excluded.** Suspends an installation. Write; requires JWT.

16. **`unsuspendInstallation` (DELETE `/app/installations/{installation_id}/suspended`) — write and JWT-only, doubly excluded.** Unsuspends an installation. Write; requires JWT.

17. **`addRepoToInstallationForAuthenticatedUser` (PUT `/user/installations/{installation_id}/repositories/{repository_id}`) — write, excluded.** Adds a repository to an installation. Write/mutating operation. The read-only scope of this toolset excludes all mutations. (Also: `addRepoToInstallation` is a duplicate alias — same URL, excluded for the same reason.)

18. **`removeRepoFromInstallationForAuthenticatedUser` (DELETE `/user/installations/{installation_id}/repositories/{repository_id}`) — write, excluded.** Removes a repository from an installation. Destructive write. (Also: `removeRepoFromInstallation` is a duplicate alias — excluded for the same reason.)

19. **`revokeInstallationAccessToken` (DELETE `/installation/token`) — write, excluded.** Revokes the currently-used installation access token. Destructive, not applicable to PAT auth.

20. **`createFromManifest` (POST `/app-manifests/{code}/conversions`) — write, excluded.** Completes the GitHub App Manifest flow and creates a new app. Write/creation operation; also a one-time setup operation unsuitable as an ongoing LLM tool.

### Installation lookup endpoints (JWT-only / niche) — excluded

21. **`getOrgInstallation` (GET `/orgs/{org}/installation`) — JWT-only, excluded.** Gets the installation for a specific org — returns the installation of the calling app on that org. Requires JWT authentication as the app. PAT-based servers use `listInstallationsForAuthenticatedUser` to discover which apps are installed on orgs the user belongs to.

22. **`getRepoInstallation` (GET `/repos/{owner}/{repo}/installation`) — JWT-only, excluded.** Gets the installation for a specific repo. Requires JWT. Same rationale.

23. **`getUserInstallation` (GET `/users/{username}/installation`) — JWT-only, excluded.** Gets the installation for a specific user account. Requires JWT. Same rationale.

24. **`listReposAccessibleToInstallation` (GET `/installation/repositories`) — JWT-or-installation-token only, excluded.** Lists repositories accessible to the current installation. Requires either a JWT or an installation access token — cannot be called with a PAT. The PAT-compatible analog is `listInstallationReposForAuthenticatedUser` (which is included as `list_installation_repos_for_authenticated_user`).

### Marketplace endpoints — out of scope

25. **`listPlans` / `listPlansStubbed` (GET `/marketplace_listing/plans` / `…/stubbed/plans`) — out of scope.** Lists GitHub Marketplace plans for a paid GitHub App. Relevant only to app vendors managing their Marketplace listings — not an end-user tool. Out of scope for the ~3-tool estimate.

26. **`listAccountsForPlan` / `listAccountsForPlanStubbed` (GET `/marketplace_listing/plans/{plan_id}/accounts`) — out of scope.** Lists accounts on a specific Marketplace plan. Same app-vendor rationale. Also requires OAuth App auth or JWT.

27. **`getSubscriptionPlanForAccount` / `getSubscriptionPlanForAccountStubbed` (GET `/marketplace_listing/accounts/{account_id}`) — out of scope.** Looks up the Marketplace subscription plan for a specific account. App-vendor concern, out of scope.

28. **`listSubscriptionsForAuthenticatedUser` / `listSubscriptionsForAuthenticatedUserStubbed` (GET `/user/marketplace_purchases`) — out of scope.** Lists Marketplace purchases for the authenticated user. Niche: only returns results for users who have purchased paid GitHub Apps via Marketplace. Marginal utility for a general-purpose MCP server; out of scope for the ~3-tool estimate. Could be added in a follow-up plan if Marketplace tooling becomes a use case.

### `oidc` namespace — out of scope

29. **`getOidcCustomSubTemplateForOrg` (GET `/orgs/{org}/actions/oidc/customization/sub`) — out of scope.** Returns the OIDC subject claim customization template for an org's GitHub Actions workflows. Highly niche: relevant only to enterprise/org admins who have configured OIDC token subject customization for their Actions pipelines. Not a general-purpose tool for an LLM. Out of scope for the ~3-tool `apps` budget; could belong in an `actions` or `orgs_teams` toolset extension if needed.

30. **`updateOidcCustomSubTemplateForOrg` (PUT `/orgs/{org}/actions/oidc/customization/sub`) — write and out of scope, doubly excluded.** Write/mutating operation for an already-niche endpoint.

---

## Self-Review Notes

- **Spec coverage:** `apps` toolset (Toolset Inventory row: octokit `apps`, `oidc` namespaces, example tools `get_app, list_installations`, est. count ~3). Both named examples are implemented exactly (`get_app`, `list_installations_for_authenticated_user`). The count exactly matches the ~3 estimate. The third tool (`list_installation_repos_for_authenticated_user`) is the natural companion to `list_installations_for_authenticated_user` — you cannot act on an installation without knowing its accessible repos, making this a pair as natural as `list_package_versions_for_authenticated_user` following `list_packages_for_authenticated_user` in the packages plan.

- **Auth model selection:** All three tools are verified to work with PAT authentication. `get_app` requires no auth at all (fully public). `list_installations_for_authenticated_user` and `list_installation_repos_for_authenticated_user` use `/user/...` endpoints that run in the context of the PAT owner, not in the context of a GitHub App. This is the correct set for a PAT-based server.

- **`getAuthenticated` substitution rationale:** The design row's example tool is `get_app`, which maps naturally to `getAuthenticated` (GET `/app`). However, `getAuthenticated` returns `401` with a PAT. `getBySlug` (GET `/apps/{app_slug}`) is the PAT-compatible substitute: it returns the identical `integration` response shape, requires no authentication, and is strictly more broadly usable (any public app, not just the calling app). The tool is named `get_app` to match the spec example, implemented via `getBySlug`.

- **`list_installations_for_authenticated_user` vs. design row `list_installations`:** The design row lists `list_installations` as the example tool name. In this codebase, tool names are suffixed with `_for_authenticated_user` when the endpoint is scoped to the PAT owner (precedent: all four `packages` tools). The full name `list_installations_for_authenticated_user` avoids ambiguity with the JWT-only `listInstallations` (GET `/app/installations`) and is consistent with the `packages` toolset naming convention.

- **`paginationSchema` spread:** Both `list_installations_for_authenticated_user` and `list_installation_repos_for_authenticated_user` spread `paginationSchema` from `common.ts`. `get_app` takes only `app_slug` — no pagination (single resource lookup). This matches the pattern: single-resource tools take required identifiers; list tools take `paginationSchema`.

- **304 responses:** Both list endpoints include `304 Not Modified` as a possible response code per the OpenAPI spec. Octokit throws a `RequestError("Not modified", 304, ...)` for 304s rather than returning a success response — same behavior as `get_meta` and `list_emojis` in the `misc` toolset. The `toToolError` catch path handles this correctly. No special test is written for 304 because it requires conditional request headers (`If-None-Match`) to trigger, which nock would require setting up as a stateful intercept. The error propagation path is already proven by the `misc` toolset's 304 tests and by the generic catch/`toToolError` pattern used identically in every other toolset.

- **`get_app` `z.object({})` vs. `z.object({ app_slug: ... })`:** `get_app` takes a required `app_slug` string parameter — unlike the parameterless tools in `misc`. The Zod schema is `z.object({ app_slug: z.string().describe(...) })`. This is the same pattern as `getBySlug` requires one path param.

- **Tool-name collision check performed:** All 3 tool names (`get_app`, `list_installations_for_authenticated_user`, `list_installation_repos_for_authenticated_user`) were verified against the 58 existing tool names (counted via `grep -c "server.registerTool(" src/toolsets/*.ts`): activity 5, gists 5, issues 12, misc 4, packages 4, pull_requests 10, repos 8, search 5, users 5. Zero collisions.

- **Lessons applied from prior plans:**
  - **`issues` I1 (strict permission-gating equality):** Task 1's registration-count test uses `.toEqual([...exact 3 names...])`, not `arrayContaining`. Run against both `read-only` and `read-write` clients.
  - **`issues` I3 (wire-level filter passthrough):** The pagination forwarding tests for both list tools use `nock(...).query({...full params...})` plus `expect(scope.isDone()).toBe(true)`, proving every parameter is forwarded on the wire.
  - **`search` M (all-read-only `_permission` naming):** Applied — `_permission` inside the function body.
  - **`packages` M (tool-name collision check):** Performed explicitly — see Global Constraints.
  - **`misc` auth awareness:** Unlike `misc` (where all 4 tools work without auth), the `apps` toolset requires careful auth-compatibility screening. Each of the 30 excluded methods is documented with its auth requirement. The 3 included tools are all PAT-compatible by verified design.

- **No placeholders:** All octokit method names (`apps.getBySlug`, `apps.listInstallationsForAuthenticatedUser`, `apps.listInstallationReposForAuthenticatedUser`), HTTP verbs, URL paths, path parameters, query parameters, and response body shapes were verified directly against the installed `@octokit/plugin-rest-endpoint-methods` endpoint table (via `octokit.rest.apps[name].endpoint.DEFAULTS`) and the `@octokit/openapi-types/types.d.ts` operation definitions — not memorized or guessed. Every intentionally excluded method is documented in the Deliberate scope decisions section.

- **Task right-sizing:** Task 1 bundles all 3 tools + tests into one reviewer gate, matching the `misc`, `users`, `packages`, `search`, `gists`, and `activity` plans. Task 2 is a separate gate for the same reason as all prior plans: wiring is where duplicate-registration crashes and stale-README rot surface.
