# github-mcp-server-js — `packages` Toolset Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Add the `packages` toolset (4 read-only tools wrapping GitHub's REST Packages endpoints — list packages, get a package, list package versions, get a specific package version, all scoped to the authenticated user) to `github-mcp-server-js`, following the exact structural, permission-gating, and response/error pattern established by the `search`, `users`, `gists`, and `activity` toolsets.

**Architecture:** Same pattern as prior toolsets: one `registerPackagesTools(server, octokit, permission)` function registers each tool with `server.registerTool(name, {description, inputSchema}, handler)`; every handler wraps its octokit call in try/catch, returning raw JSON via `toToolResult`/`toToolError`; `server.ts` gains one more registration call. All octokit calls use the `packages` namespace (`octokit.rest.packages.*`). Because every packages endpoint selected for this toolset is read-only, the `permission === 'read-write'` branch is unused — the `permission` parameter is accepted (to keep the signature uniform across every `register*Tools` function) but never inspected; it is renamed `_permission` inside the function body to satisfy the `@typescript-eslint/no-unused-vars` rule.

**Tech Stack:** Same as prior plans — TypeScript, `@modelcontextprotocol/server@^2.0.0`, `octokit@^5.0.5`, `zod@^4.2.0`, `vitest`, `nock`. No new dependencies.

## Global Constraints

- Tool responses return the raw octokit response body as JSON, unmodified. No field trimming, no text summarization. `list_packages_for_authenticated_user` returns a `package[]` array; `get_package_for_authenticated_user` returns a `package` object; `list_package_versions_for_authenticated_user` returns a `package-version[]` array; `get_package_version_for_authenticated_user` returns a `package-version` object. These exact shapes are preserved; callers pull fields themselves.
- Errors propagate unmodified: catch the octokit `RequestError`, surface `error.message` (which already includes the GitHub `message` field) in an MCP tool error result. No normalization layer.
- List tools take explicit `page` (default `1`) and `per_page` (default `30`, max `100`) parameters. No auto-pagination. This matches every other toolset's pagination model.
- `GITHUB_PERMISSION=read-only` gating is a no-op for this toolset because every packages tool is read-only; the read-only test in Task 1 still verifies the exact set of 4 tools is registered using `.toEqual([...exact set...])` rather than `arrayContaining`, following the lessons from prior plans.
- This toolset is deliberately scoped to **authenticated-user packages** only. The GitHub Packages API exposes three ownership levels: `user` (`/user/packages/*`), `org` (`/orgs/{org}/packages/*`), and `user-by-username` (`/users/{username}/packages/*`). Only the `/user/packages/*` family is included here (see Deliberate scope decisions).
- `package_type` is a **required** parameter on all four tools: the GitHub REST API requires it on the query string for `list_packages_for_authenticated_user` (per the OpenAPI spec `packages/list-packages-for-authenticated-user`, which marks `package_type` as a required query parameter) and in the path for `get_package_for_authenticated_user`, `list_package_versions_for_authenticated_user`, and `get_package_version_for_authenticated_user`.
- Tool names use the `_` separator convention and the `list_packages_` / `get_package_` prefix pattern. See collision check below.
- Verified tool-name collision check against the 50 existing tool names on `main` (8 from `repos.ts`, 12 from `issues.ts`, 10 from `pull_requests.ts`, 5 from `search.ts`, 5 from `users.ts`, 5 from `gists.ts`, 5 from `activity.ts`): **zero collisions** with the 4 tool names chosen below (`list_packages_for_authenticated_user`, `get_package_for_authenticated_user`, `list_package_versions_for_authenticated_user`, `get_package_version_for_authenticated_user`). None of these appear anywhere in the current tool name set.
- No modification to `common.ts`.
- TypeScript only, no new runtime dependencies.

---

## Octokit Surprise: Duplicate Aliases in `packages` Namespace

When enumerating `octokit.rest.packages.*` endpoint DEFAULTS, the namespace exposes **aliased method pairs** for version-listing:

- `getAllPackageVersionsForAPackageOwnedByTheAuthenticatedUser` and `getAllPackageVersionsForPackageOwnedByAuthenticatedUser` both resolve to `GET /user/packages/{package_type}/{package_name}/versions` — same URL, different JavaScript function objects (`===` returns false), same DEFAULTS.
- Same pattern appears for org and user-by-username variants (`getAllPackageVersionsForAPackageOwnedByAnOrg` / `getAllPackageVersionsForPackageOwnedByOrg`, etc.).

The **canonical name** used in this plan is `getAllPackageVersionsForPackageOwnedByAuthenticatedUser` (the shorter form, matching the naming pattern of the non-alias methods in the namespace). Both work identically at runtime; the shorter name is chosen to match the naming style of `getPackageForAuthenticatedUser` and `getPackageVersionForAuthenticatedUser`.

The `listPackagesForAuthenticatedUser` endpoint's DEFAULTS shows `url: /user/packages` with no required path parameters — the `package_type` filter is a **query** parameter (not a path parameter), confirmed via the OpenAPI spec at `packages/list-packages-for-authenticated-user`: `query.package_type` is required, `query.visibility` is optional.

---

## File Structure

```
github-mcp-server-js/
  src/
    toolsets/
      packages.ts              # NEW: registerPackagesTools(server, octokit, permission)
    server.ts                  # MODIFIED: calls registerPackagesTools
  test/
    unit/
      toolsets/
        packages.test.ts       # NEW: mirrors users.test.ts's structure
```

`common.ts` is NOT modified — no new shared schema fragment is warranted. `README.md`'s Toolsets section is updated in Task 2 (Step 5).

---

## Reference: verified octokit `packages` namespace shapes

Confirmed directly against the installed `@octokit/plugin-rest-endpoint-methods` generated endpoint table (`octokit.rest.packages[name].endpoint.DEFAULTS`) and the `@octokit/openapi-types` operation definitions at `node_modules/@octokit/openapi-types/types.d.ts`. All 4 selected endpoints are `GET`; none require a request body.

| Tool | octokit method | HTTP path | Path params | Query params | Response body |
|---|---|---|---|---|---|
| `list_packages_for_authenticated_user` | `packages.listPackagesForAuthenticatedUser` | GET `/user/packages` | — | `package_type` (required), `visibility?`, `page?`, `per_page?` | `package[]` |
| `get_package_for_authenticated_user` | `packages.getPackageForAuthenticatedUser` | GET `/user/packages/{package_type}/{package_name}` | `package_type`, `package_name` | — | `package` |
| `list_package_versions_for_authenticated_user` | `packages.getAllPackageVersionsForPackageOwnedByAuthenticatedUser` | GET `/user/packages/{package_type}/{package_name}/versions` | `package_type`, `package_name` | `state?`, `page?`, `per_page?` | `package-version[]` |
| `get_package_version_for_authenticated_user` | `packages.getPackageVersionForAuthenticatedUser` | GET `/user/packages/{package_type}/{package_name}/versions/{package_version_id}` | `package_type`, `package_name`, `package_version_id` | — | `package-version` |

**`package_type` enum** (from `components["parameters"]["package-type"]` in `@octokit/openapi-types`):
`"npm" | "maven" | "rubygems" | "docker" | "nuget" | "container"`

**`visibility` enum** (from `components["parameters"]["package-visibility"]`):
`"public" | "private" | "internal"`

**`state` enum** (from `packages/get-all-package-versions-for-package-owned-by-authenticated-user` query):
`"active" | "deleted"`

**`package_version_id`**: `number` (integer) — from `components["parameters"]["package-version-id"]`.

Response body notes (raw passthrough, all `200 OK`):
- `list_packages_for_authenticated_user` → `[{ id, name, package_type, owner, version_count, visibility, created_at, updated_at, repository, url, html_url }, ...]` (package array). Requires `read:packages` token scope.
- `get_package_for_authenticated_user` → single `package` object of same shape.
- `list_package_versions_for_authenticated_user` → `[{ id, name, url, package_html_url, created_at, updated_at, html_url, metadata: { package_type, container?: { tags }, npm?: {...} } }, ...]` (package-version array).
- `get_package_version_for_authenticated_user` → single `package-version` object of same shape.
- Non-2xx errors surface as `RequestError` and are handled by the same catch/`toToolError` path as every other tool.

**cspell.json note:** No new words need to be added. All words used in tool names, descriptions, and test fixture strings (`nuget`, `rubygems`, `maven`, `ghcr`) are either: already in `cspell.json` words list, recognized English words, or standard technical abbreviations that cspell recognizes. If cspell flags `nuget`, `rubygems`, `ghcr`, or `maven` during the pre-commit hook, add them to the `words` array in `cspell.json` at that time.

---

## Task 1: Implement the `packages` toolset (4 read-only tools) and its tests

**Files:**
- Create: `src/toolsets/packages.ts`
- Test: `test/unit/toolsets/packages.test.ts`

**Interfaces:**
- Consumes: `paginationSchema`, `toToolResult`, `toToolError` from `./common.js` (already exist — no modification needed).
- Produces (for Task 2 / `server.ts` to consume):
  - `registerPackagesTools(server: McpServer, octokit: Octokit, permission: 'read-only' | 'read-write'): void` — same signature shape as `registerUsersTools`/`registerSearchTools`/`registerGistsTools`/`registerActivityTools`. The `permission` parameter is accepted for signature uniformity but never inspected inside the function (all 4 tools are read-only); the parameter is renamed `_permission` inside the function body to satisfy the `@typescript-eslint/no-unused-vars` rule.

- [x] **Step 1: Write the failing tests**

Create `test/unit/toolsets/packages.test.ts`:

```typescript
import nock from 'nock';
import { afterEach, describe, expect, it } from 'vitest';
import { registerPackagesTools } from '../../../src/toolsets/packages.js';
import { connectedClient } from './test-helpers.js';

describe('registerPackagesTools', () => {
  afterEach(() => {
    nock.cleanAll();
  });

  it('registers list_packages_for_authenticated_user and returns the raw package array as JSON', async () => {
    nock('https://api.github.com')
      .get('/user/packages')
      .query({ package_type: 'npm', page: '1', per_page: '30' })
      .reply(200, [
        {
          id: 1,
          name: 'my-package',
          package_type: 'npm',
          version_count: 3,
          visibility: 'private',
          url: 'https://api.github.com/user/packages/npm/my-package',
          html_url: 'https://github.com/users/monalisa/packages/npm/package/my-package',
        },
      ]);

    const client = await connectedClient(registerPackagesTools, 'read-write');
    const result = await client.callTool({
      name: 'list_packages_for_authenticated_user',
      arguments: { package_type: 'npm' },
    });

    expect(result.isError).toBeFalsy();
    const text = (result.content as Array<{ type: string; text: string }>)[0]?.text ?? '';
    const parsed = JSON.parse(text) as Array<{ name: string }>;
    expect(parsed).toHaveLength(1);
    expect(parsed[0]).toMatchObject({ name: 'my-package', package_type: 'npm' });
  });

  it('forwards visibility and pagination on list_packages_for_authenticated_user to the wire', async () => {
    const scope = nock('https://api.github.com')
      .get('/user/packages')
      .query({ package_type: 'container', visibility: 'public', page: '2', per_page: '50' })
      .reply(200, []);

    const client = await connectedClient(registerPackagesTools, 'read-write');
    const result = await client.callTool({
      name: 'list_packages_for_authenticated_user',
      arguments: { package_type: 'container', visibility: 'public', page: 2, per_page: 50 },
    });

    expect(result.isError).toBeFalsy();
    expect(scope.isDone()).toBe(true);
  });

  it('propagates a 401 from list_packages_for_authenticated_user as an MCP tool error', async () => {
    nock('https://api.github.com')
      .get('/user/packages')
      .query({ package_type: 'npm', page: '1', per_page: '30' })
      .reply(401, {
        message: 'Requires authentication',
        documentation_url: 'https://docs.github.com/rest',
      });

    const client = await connectedClient(registerPackagesTools, 'read-write');
    const result = await client.callTool({
      name: 'list_packages_for_authenticated_user',
      arguments: { package_type: 'npm' },
    });

    expect(result.isError).toBe(true);
    const text = (result.content as Array<{ type: string; text: string }>)[0]?.text ?? '';
    expect(text).toContain('Requires authentication');
  });

  it('registers get_package_for_authenticated_user and returns the raw package object as JSON', async () => {
    nock('https://api.github.com')
      .get('/user/packages/npm/my-package')
      .reply(200, {
        id: 1,
        name: 'my-package',
        package_type: 'npm',
        version_count: 3,
        visibility: 'private',
        url: 'https://api.github.com/user/packages/npm/my-package',
        html_url: 'https://github.com/users/monalisa/packages/npm/package/my-package',
      });

    const client = await connectedClient(registerPackagesTools, 'read-write');
    const result = await client.callTool({
      name: 'get_package_for_authenticated_user',
      arguments: { package_type: 'npm', package_name: 'my-package' },
    });

    expect(result.isError).toBeFalsy();
    const text = (result.content as Array<{ type: string; text: string }>)[0]?.text ?? '';
    expect(JSON.parse(text)).toMatchObject({ name: 'my-package', version_count: 3 });
  });

  it('propagates a 404 from get_package_for_authenticated_user as an MCP tool error', async () => {
    nock('https://api.github.com')
      .get('/user/packages/npm/nonexistent-pkg')
      .reply(404, { message: 'Not Found', documentation_url: 'https://docs.github.com/rest' });

    const client = await connectedClient(registerPackagesTools, 'read-write');
    const result = await client.callTool({
      name: 'get_package_for_authenticated_user',
      arguments: { package_type: 'npm', package_name: 'nonexistent-pkg' },
    });

    expect(result.isError).toBe(true);
    const text = (result.content as Array<{ type: string; text: string }>)[0]?.text ?? '';
    expect(text).toContain('Not Found');
  });

  it('registers list_package_versions_for_authenticated_user and returns the raw package-version array as JSON', async () => {
    nock('https://api.github.com')
      .get('/user/packages/npm/my-package/versions')
      .query({ page: '1', per_page: '30' })
      .reply(200, [
        {
          id: 101,
          name: '1.0.0',
          url: 'https://api.github.com/user/packages/npm/my-package/versions/101',
          package_html_url: 'https://github.com/users/monalisa/packages/npm/package/my-package',
          created_at: '2022-01-01T00:00:00Z',
          updated_at: '2022-01-01T00:00:00Z',
          html_url: 'https://github.com/users/monalisa/packages/npm/package/my-package/101',
        },
        {
          id: 102,
          name: '1.1.0',
          url: 'https://api.github.com/user/packages/npm/my-package/versions/102',
          package_html_url: 'https://github.com/users/monalisa/packages/npm/package/my-package',
          created_at: '2022-06-01T00:00:00Z',
          updated_at: '2022-06-01T00:00:00Z',
          html_url: 'https://github.com/users/monalisa/packages/npm/package/my-package/102',
        },
      ]);

    const client = await connectedClient(registerPackagesTools, 'read-write');
    const result = await client.callTool({
      name: 'list_package_versions_for_authenticated_user',
      arguments: { package_type: 'npm', package_name: 'my-package' },
    });

    expect(result.isError).toBeFalsy();
    const text = (result.content as Array<{ type: string; text: string }>)[0]?.text ?? '';
    const parsed = JSON.parse(text) as Array<{ id: number; name: string }>;
    expect(parsed).toHaveLength(2);
    expect(parsed[0]).toMatchObject({ id: 101, name: '1.0.0' });
  });

  it('forwards state and pagination on list_package_versions_for_authenticated_user to the wire', async () => {
    const scope = nock('https://api.github.com')
      .get('/user/packages/container/my-image/versions')
      .query({ state: 'deleted', page: '2', per_page: '10' })
      .reply(200, []);

    const client = await connectedClient(registerPackagesTools, 'read-write');
    const result = await client.callTool({
      name: 'list_package_versions_for_authenticated_user',
      arguments: {
        package_type: 'container',
        package_name: 'my-image',
        state: 'deleted',
        page: 2,
        per_page: 10,
      },
    });

    expect(result.isError).toBeFalsy();
    expect(scope.isDone()).toBe(true);
  });

  it('registers get_package_version_for_authenticated_user and returns the raw package-version object as JSON', async () => {
    nock('https://api.github.com')
      .get('/user/packages/npm/my-package/versions/101')
      .reply(200, {
        id: 101,
        name: '1.0.0',
        url: 'https://api.github.com/user/packages/npm/my-package/versions/101',
        package_html_url: 'https://github.com/users/monalisa/packages/npm/package/my-package',
        created_at: '2022-01-01T00:00:00Z',
        updated_at: '2022-01-01T00:00:00Z',
        html_url: 'https://github.com/users/monalisa/packages/npm/package/my-package/101',
        metadata: { package_type: 'npm', npm: { name: 'my-package', version: '1.0.0' } },
      });

    const client = await connectedClient(registerPackagesTools, 'read-write');
    const result = await client.callTool({
      name: 'get_package_version_for_authenticated_user',
      arguments: { package_type: 'npm', package_name: 'my-package', package_version_id: 101 },
    });

    expect(result.isError).toBeFalsy();
    const text = (result.content as Array<{ type: string; text: string }>)[0]?.text ?? '';
    expect(JSON.parse(text)).toMatchObject({ id: 101, name: '1.0.0' });
  });

  it('propagates a 404 from get_package_version_for_authenticated_user as an MCP tool error', async () => {
    nock('https://api.github.com')
      .get('/user/packages/npm/my-package/versions/9999')
      .reply(404, { message: 'Not Found', documentation_url: 'https://docs.github.com/rest' });

    const client = await connectedClient(registerPackagesTools, 'read-write');
    const result = await client.callTool({
      name: 'get_package_version_for_authenticated_user',
      arguments: { package_type: 'npm', package_name: 'my-package', package_version_id: 9999 },
    });

    expect(result.isError).toBe(true);
    const text = (result.content as Array<{ type: string; text: string }>)[0]?.text ?? '';
    expect(text).toContain('Not Found');
  });

  it('registers exactly the 4 packages tools in read-only mode (and the same set in read-write)', async () => {
    const expected = [
      'get_package_for_authenticated_user',
      'get_package_version_for_authenticated_user',
      'list_package_versions_for_authenticated_user',
      'list_packages_for_authenticated_user',
    ];

    const readOnlyClient = await connectedClient(registerPackagesTools, 'read-only');
    const readOnlyTools = await readOnlyClient.listTools();
    expect(readOnlyTools.tools.map((t) => t.name).sort()).toEqual(expected);

    const readWriteClient = await connectedClient(registerPackagesTools, 'read-write');
    const readWriteTools = await readWriteClient.listTools();
    expect(readWriteTools.tools.map((t) => t.name).sort()).toEqual(expected);
  });
});
```

- [x] **Step 2: Run tests to verify they fail**

Run: `npm test -- packages`
Expected: FAIL with a module-not-found error for `../../../src/toolsets/packages.js` (the file doesn't exist yet).

- [x] **Step 3: Create `src/toolsets/packages.ts`**

```typescript
import type { McpServer } from '@modelcontextprotocol/server';
import type { Octokit } from 'octokit';
import { z } from 'zod';
import { paginationSchema, toToolResult, toToolError } from './common.js';

const packageTypeSchema = z
  .enum(['npm', 'maven', 'rubygems', 'docker', 'nuget', 'container'])
  .describe(
    'The type of package. One of: npm, maven, rubygems, docker, nuget, container. ' +
      'Packages pushed to GitHub Container Registry (ghcr.io) have type "container". ' +
      'Packages pushed to the legacy Docker registry (docker.pkg.github.com) have type "docker".',
  );

export function registerPackagesTools(
  server: McpServer,
  octokit: Octokit,
  _permission: 'read-only' | 'read-write',
): void {
  server.registerTool(
    'list_packages_for_authenticated_user',
    {
      description:
        'List packages owned by the authenticated user (the owner of GITHUB_TOKEN). ' +
        'Requires the read:packages token scope. The package_type filter is required — ' +
        'pass one of npm, maven, rubygems, docker, nuget, or container. ' +
        'Optionally filter by visibility (public, private, internal). ' +
        'Paginate with page and per_page.',
      inputSchema: z.object({
        package_type: packageTypeSchema,
        visibility: z
          .enum(['public', 'private', 'internal'])
          .optional()
          .describe('Filter packages by visibility. Returns all visibilities if omitted.'),
        ...paginationSchema,
      }),
    },
    async ({ package_type, visibility, page, per_page }) => {
      try {
        const response = await octokit.rest.packages.listPackagesForAuthenticatedUser({
          package_type,
          visibility,
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
    'get_package_for_authenticated_user',
    {
      description:
        'Get a specific package owned by the authenticated user. ' +
        'Returns the package metadata including name, type, version count, visibility, ' +
        'repository link, and timestamps. Requires the read:packages token scope.',
      inputSchema: z.object({
        package_type: packageTypeSchema,
        package_name: z.string().describe('The name of the package.'),
      }),
    },
    async ({ package_type, package_name }) => {
      try {
        const response = await octokit.rest.packages.getPackageForAuthenticatedUser({
          package_type,
          package_name,
        });
        return toToolResult(response.data);
      } catch (error) {
        return toToolError(error);
      }
    },
  );

  server.registerTool(
    'list_package_versions_for_authenticated_user',
    {
      description:
        'List all versions of a package owned by the authenticated user. ' +
        'Returns an array of package-version objects, each with an id, version name, ' +
        'creation/update timestamps, and type-specific metadata (e.g. container tags, npm dist-tags). ' +
        'Optionally filter by state: "active" (default) returns live versions; ' +
        '"deleted" returns versions that have been deleted but can still be restored within 30 days. ' +
        'Requires the read:packages token scope.',
      inputSchema: z.object({
        package_type: packageTypeSchema,
        package_name: z.string().describe('The name of the package.'),
        state: z
          .enum(['active', 'deleted'])
          .optional()
          .describe(
            'Filter versions by state. "active" returns live versions (default); ' +
              '"deleted" returns versions deleted within the last 30 days.',
          ),
        ...paginationSchema,
      }),
    },
    async ({ package_type, package_name, state, page, per_page }) => {
      try {
        const response =
          await octokit.rest.packages.getAllPackageVersionsForPackageOwnedByAuthenticatedUser({
            package_type,
            package_name,
            state,
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
    'get_package_version_for_authenticated_user',
    {
      description:
        'Get a specific version of a package owned by the authenticated user. ' +
        'Returns the package-version object including the version id, name, ' +
        'creation/update timestamps, and type-specific metadata. ' +
        'Use list_package_versions_for_authenticated_user to find version ids. ' +
        'Requires the read:packages token scope.',
      inputSchema: z.object({
        package_type: packageTypeSchema,
        package_name: z.string().describe('The name of the package.'),
        package_version_id: z
          .number()
          .int()
          .describe('The unique identifier of the package version.'),
      }),
    },
    async ({ package_type, package_name, package_version_id }) => {
      try {
        const response = await octokit.rest.packages.getPackageVersionForAuthenticatedUser({
          package_type,
          package_name,
          package_version_id,
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

Run: `npm test -- packages`
Expected: PASS (9 tests in `packages.test.ts`).

- [x] **Step 5: Run the full test suite to confirm no regression in other toolsets**

Run: `npm test`
Expected: PASS. Total test count is the previous suite total plus the 9 new tests in `packages.test.ts`. No pre-existing test file is modified; `common.ts` is unchanged so `common.test.ts` still passes verbatim.

- [x] **Step 6: Commit**

```bash
git add src/toolsets/packages.ts test/unit/toolsets/packages.test.ts
git commit -m "feat: add packages toolset (4 read-only tools)"
```

---

## Task 2: Wire `registerPackagesTools` into `server.ts`

**Files:**
- Modify: `src/server.ts`
- Modify: `README.md` (Toolsets section)

**Interfaces:**
- Consumes: `registerPackagesTools(server, octokit, permission)` from Task 1.
- Produces: nothing new — this is the final integration point.

- [x] **Step 1: Modify `src/server.ts`**

Current content (as of `main` after the activity toolset was wired):

```typescript
import { McpServer } from '@modelcontextprotocol/server';
import type { Octokit } from 'octokit';
import { registerActivityTools } from './toolsets/activity.js';
import { registerGistsTools } from './toolsets/gists.js';
import { registerIssuesTools } from './toolsets/issues.js';
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

  return server;
}
```

Replace with (new import sorted alphabetically, new call added after `registerActivityTools`):

```typescript
import { McpServer } from '@modelcontextprotocol/server';
import type { Octokit } from 'octokit';
import { registerActivityTools } from './toolsets/activity.js';
import { registerGistsTools } from './toolsets/gists.js';
import { registerIssuesTools } from './toolsets/issues.js';
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

  return server;
}
```

- [x] **Step 2: Run the full test suite**

Run: `npm test`
Expected: PASS, same test count as after Task 1 (no test exercises `server.ts` directly — `buildServer` is a thin, non-branching composition function verified by the manual smoke test below).

- [x] **Step 3: Typecheck, lint, build**

Run: `npm run typecheck && npm run lint && npm run build`
Expected: all PASS. The build step confirms `dist/cli.js`'s bundled dependency graph now transitively includes `packages.ts`.

- [x] **Step 4: Manual end-to-end smoke test**

Run:
```bash
GITHUB_TOKEN=fake-token node dist/cli.js --transport=http --port=3995 &
sleep 1
curl -s -D /tmp/mcp-init-headers.txt -X POST http://localhost:3995/mcp \
  -H 'Content-Type: application/json' \
  -H 'Accept: application/json, text/event-stream' \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"smoke-test","version":"0.0.0"}}}'
SESSION=$(grep -i mcp-session-id /tmp/mcp-init-headers.txt | awk '{print $2}' | tr -d '\r')
curl -s -X POST http://localhost:3995/mcp \
  -H 'Content-Type: application/json' \
  -H 'Accept: application/json, text/event-stream' \
  -H "Mcp-Session-Id: $SESSION" \
  -d '{"jsonrpc":"2.0","id":2,"method":"tools/list","params":{}}'
kill %1
```

Expected: the `initialize` response contains `"serverInfo":{"name":"github-mcp-server-js"...}`. The `tools/list` response includes all four packages tools (`list_packages_for_authenticated_user`, `get_package_for_authenticated_user`, `list_package_versions_for_authenticated_user`, `get_package_version_for_authenticated_user`) alongside all previously-shipped tools from `repos`, `issues`, `pull_requests`, `search`, `users`, `gists`, and `activity` — proving all toolsets are live in the same server with no duplicate-registration crash.

- [x] **Step 5: Update the README's Toolsets section**

Modify `README.md`'s "Currently implemented" list to add:

```markdown
- `packages` — list and inspect GitHub Packages owned by the authenticated user (npm, maven, rubygems, docker, nuget, container)
```

Slot it after the existing `activity` bullet, keeping the toolsets listed in the order they were shipped.

- [x] **Step 6: Commit**

```bash
git add src/server.ts README.md
git commit -m "feat: wire packages toolset into buildServer"
```

---

## Deliberate scope decisions

The following `octokit.rest.packages.*` methods were introspected and are **intentionally excluded** from this toolset. Each exclusion is justified below.

### Org-scoped endpoints (`/orgs/{org}/packages/*`) — out of scope

1. **`listPackagesForOrganization` (GET `/orgs/{org}/packages`) — out of scope.** Lists packages for an org rather than the authenticated user. The authenticated-user variants already cover the most common case for a token-based MCP server (the token owner's own packages). Org package listing is a distinct access pattern with its own permission story (requires `admin:org` or `read:packages` with org visibility) and is better served by an `orgs_teams` toolset extension or a follow-up plan. Adding it here would expand the scope beyond ~4 tools without clear incremental value for a v1 toolset.

2. **`getPackageForOrganization` (GET `/orgs/{org}/packages/{package_type}/{package_name}`) — out of scope.** Same reasoning as `listPackagesForOrganization`. Out of scope for the same `~4 tool` estimate rationale.

3. **`getAllPackageVersionsForPackageOwnedByOrg` (GET `/orgs/{org}/packages/{package_type}/{package_name}/versions`) — out of scope.** Out of scope for the same reasons.

4. **`getPackageVersionForOrganization` (GET `/orgs/{org}/packages/{package_type}/{package_name}/versions/{package_version_id}`) — out of scope.** Out of scope for the same reasons.

### User-by-username endpoints (`/users/{username}/packages/*`) — out of scope

5. **`listPackagesForUser`, `getPackageForUser`, `getAllPackageVersionsForPackageOwnedByUser`, `getPackageVersionForUser` — out of scope.** These look up packages belonging to an arbitrary public GitHub user (by username), not the authenticated user. They are useful for inspecting other users' public packages but represent a separate access pattern. Like the org variants, they are excluded from the v1 `~4 tool` scope — the authenticated-user tools already cover the token owner's packages (public and private), and user-by-username tools add breadth without adding depth to the core use case. Can be added in a follow-up plan.

### Mutating / account-management endpoints — excluded

6. **`deletePackageForAuthenticatedUser` (DELETE `/user/packages/{package_type}/{package_name}`) — write, excluded.** Deletes a package. Write/destructive operation. Cannot delete public packages with >5,000 downloads without contacting GitHub support. The read-only scope of this toolset excludes all mutations.

7. **`deletePackageVersionForAuthenticatedUser` (DELETE `/user/packages/{package_type}/{package_name}/versions/{package_version_id}`) — write, excluded.** Deletes a specific package version. Same write-exclusion rationale. Additionally destructive with no undo path for versions with high download counts.

8. **`restorePackageForAuthenticatedUser` (POST `/user/packages/{package_type}/{package_name}/restore`) — write, excluded.** Restores a deleted package (within the 30-day restore window). Write/mutating operation — excluded. The `state: "deleted"` filter on `list_package_versions_for_authenticated_user` exposes visibility into deleted versions without exposing the restore mutation.

9. **`restorePackageVersionForAuthenticatedUser` (POST `/user/packages/{package_type}/{package_name}/versions/{package_version_id}/restore`) — write, excluded.** Same write-exclusion rationale as `restorePackageForAuthenticatedUser`.

10. **Org-scoped delete/restore variants** (`deletePackageForOrg`, `deletePackageVersionForOrg`, `restorePackageForOrg`, `restorePackageVersionForOrg`) **— write and org-scoped, doubly excluded.** Both mutation exclusion and org-scope exclusion apply.

11. **User-by-username delete/restore variants** (`deletePackageForUser`, `deletePackageVersionForUser`, `restorePackageForUser`, `restorePackageVersionForUser`) **— write and off-scope, doubly excluded.** Both mutation exclusion and user-by-username-scope exclusion apply.

### Docker migration endpoint — excluded

12. **`listDockerMigrationConflictingPackagesForAuthenticatedUser` (GET `/user/docker/conflicts`) — out of scope.** Returns a list of packages that cannot be migrated from the legacy Docker registry (`docker.pkg.github.com`) to the GitHub Container Registry (`ghcr.io`) because they have a naming conflict. This is a one-time migration audit tool relevant only to users who have packages in the old Docker registry — a niche legacy use case not warranted in a ~4-tool general-purpose scope. The org and user-by-username variants (`listDockerMigrationConflictingPackagesForOrganization`, `listDockerMigrationConflictingPackagesForUser`) are excluded for the same reason plus the org/user-by-username scope exclusion.

---

## Self-Review Notes

- **Spec coverage:** `packages` toolset (Toolset Inventory row: octokit `packages` namespace, example tools `list_packages, get_package_version`, est. count ~4). Both named examples are covered with their authenticated-user equivalents (`list_packages_for_authenticated_user`, `get_package_version_for_authenticated_user`); the count exactly matches the ~4 estimate; the two additional tools (`get_package_for_authenticated_user`, `list_package_versions_for_authenticated_user`) are the natural companions needed to make the pair of example tools useful in practice (you cannot call `get_package_version` without knowing the version id, which `list_package_versions` provides). Pagination (`page`/`per_page` defaults, max 100) — Task 1. Raw JSON response/error passthrough — Task 1.

- **Octokit method alias:** `getAllPackageVersionsForPackageOwnedByAuthenticatedUser` (shorter alias) is used in preference to `getAllPackageVersionsForAPackageOwnedByTheAuthenticatedUser` (verbose alias). Both resolve to the same URL at runtime and are confirmed present in the installed version. The shorter name is chosen to match the naming cadence of the other selected methods in this file.

- **`package_type` is required on all 4 tools.** This differs from some other toolsets where filtering parameters are optional. The OpenAPI spec marks `package_type` as required in the query for `list_packages_for_authenticated_user` and required in the path for the other three. There is no "list all packages of any type" endpoint. The Zod schema reflects this by using `z.enum([...])` without `.optional()` on `package_type` in all four tools.

- **`packageTypeSchema` is a module-level constant**, not spread into `common.ts`. It is used in all 4 tools in this file and nowhere else; extracting it to `common.ts` would couple a general-purpose helper module to a packages-specific enum, violating the same principle that kept `orderSchema` in `search.ts` rather than `common.ts`.

- **Lessons applied from prior toolset plans:**
  - **`issues` I1 (strict permission-gating equality):** Task 1's read-only test uses `expect(tools.map((t) => t.name).sort()).toEqual([...exact 4 names...])`, not `arrayContaining`. It also runs the same assertion against a `read-write` client, proving this toolset has no hidden write branch.
  - **`issues` I3 (wire-level filter passthrough):** Task 1's `visibility` and `state` forwarding tests use `nock(...).query({...full params...})` plus `expect(scope.isDone()).toBe(true)`, proving every optional parameter is forwarded on the wire.
  - **`users` M (tool-name collision check):** performed explicitly — see Global Constraints. All 4 names checked against the 50 existing tool names; zero collisions.
  - **`search` M (all-read-only `_permission` naming):** applied — the `permission` parameter is `_permission` inside the function body.

- **No placeholders:** every step includes complete, runnable code. All octokit method names (`listPackagesForAuthenticatedUser`, `getPackageForAuthenticatedUser`, `getAllPackageVersionsForPackageOwnedByAuthenticatedUser`, `getPackageVersionForAuthenticatedUser`), HTTP verbs, path templates, and parameter shapes were verified directly against the installed `@octokit/plugin-rest-endpoint-methods` endpoint table (via `octokit.rest.packages[name].endpoint.DEFAULTS`) and the `@octokit/openapi-types` operation definitions in `types.d.ts` — not memorized or guessed. Every intentionally excluded method from `octokit.rest.packages.*` is called out explicitly in the Deliberate scope decisions section.

- **Task right-sizing note:** Task 1 bundles all 4 tools + their tests into a single reviewer gate, identical to the `search`, `users`, `gists`, and `activity` plans' rationale. The tools are similarly near-identical shells over near-identical GitHub endpoints; splitting them into multiple tasks would produce copy-paste reviews with no meaningful decision between them. Task 2 remains a separate gate because wiring is where duplicate-registration crashes and stale-README rot surface — same pattern all prior toolset plans use.
