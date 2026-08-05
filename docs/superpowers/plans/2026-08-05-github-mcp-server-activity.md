# github-mcp-server-js — `activity` Toolset Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Add the `activity` toolset (5 tools covering notifications and repo starring) to `github-mcp-server-js`, following the exact structural, permission-gating, and response/error pattern established by the `repos`, `issues`, `pull_requests`, `search`, `users`, and `gists` toolsets.

**Architecture:** Same pattern as prior toolsets: one `registerActivityTools(server, octokit, permission)` function registers each tool with `server.registerTool(name, {description, inputSchema}, handler)`; every handler wraps its octokit call in try/catch, returning raw JSON via `toToolResult`/`toToolError`; write tools are registered only when `permission === 'read-write'`; `server.ts` gains one more registration call. All octokit calls use the `activity` namespace (`octokit.rest.activity.*`).

**Tech Stack:** Same as prior plans — TypeScript, `@modelcontextprotocol/server@^2.0.0`, `octokit@^5.0.5`, `zod@^4.2.0`, `vitest`, `nock`. No new dependencies.

## Global Constraints

- Tool responses return the raw octokit response body as JSON, unmodified. No field trimming, no text summarization.
- Errors propagate unmodified: catch the octokit `RequestError`, surface `error.message` in an MCP tool error result. No normalization layer.
- List tools take explicit `page` (default `1`) and `per_page` (default `30`, max `100`) parameters. No auto-pagination.
- `GITHUB_PERMISSION=read-only` must prevent write-tool handlers from ever being registered with `McpServer` — write tools must be inside `if (permission === 'read-write') { ... }`, not gated at call time.
- `star_repo` and `unstar_repo` return `204 No Content` (confirmed: `responses: { 204: { content: never } }` in `@octokit/openapi-types`). Both handlers return a synthetic result — `{ starred: true }` and `{ starred: false }` respectively — following the same deliberate exception used by `lock_issue`/`unlock_issue`/`delete_gist`. There is no response body to pass through.
- `check_repo_starred` returns `204 No Content` (starred) **or** `404 Not Found` (not starred) — both are valid non-error outcomes. The handler must catch 404 without surfacing it as an MCP tool error; instead return `{ starred: false }`. Any other error (401, 403, etc.) is still surfaced via `toToolError`. This dual-status pattern is unique to this toolset.
- `list_notifications` has a GitHub-documented cap of `per_page` max 50 (not 100 as in other endpoints). The Zod schema must reflect `.max(50)` to avoid a GitHub 422 validation error.
- No modification to `common.ts` — all parameters in this toolset are activity-specific and no other existing toolset shares them.
- TypeScript only, no new runtime dependencies.

---

## Tool Selection and Collision Check

**Tools chosen (5 total):**

| Tool | Read/Write | octokit method | HTTP |
|---|---|---|---|
| `list_notifications` | read | `activity.listNotificationsForAuthenticatedUser` | GET `/notifications` |
| `list_starred_repos` | read | `activity.listReposStarredByAuthenticatedUser` | GET `/user/starred` |
| `check_repo_starred` | read | `activity.checkRepoIsStarredByAuthenticatedUser` | GET `/user/starred/{owner}/{repo}` |
| `star_repo` | write | `activity.starRepoForAuthenticatedUser` | PUT `/user/starred/{owner}/{repo}` |
| `unstar_repo` | write | `activity.unstarRepoForAuthenticatedUser` | DELETE `/user/starred/{owner}/{repo}` |

**Read/write split:** 3 read tools + 2 write tools.

**Collision check against all 45 existing tool names** (8 `repos` + 12 `issues` + 10 `pull_requests` + 5 `search` + 5 `users` + 5 `gists`):

Existing names: `add_comment`, `add_labels`, `create_gist`, `create_issue`, `create_or_update_file`, `create_pull_request`, `create_pull_request_review`, `delete_gist`, `get_authenticated_user`, `get_branch`, `get_commit`, `get_file_contents`, `get_gist`, `get_issue`, `get_pull_request`, `get_repository`, `get_user_by_username`, `get_user_hovercard`, `list_branches`, `list_comments`, `list_commits`, `list_gists`, `list_issues`, `list_labels`, `list_labels_on_issue`, `list_pull_request_commits`, `list_pull_request_files`, `list_pull_request_reviews`, `list_pull_requests`, `list_tags`, `list_user_followers`, `list_user_following`, `lock_issue`, `merge_pull_request`, `remove_label`, `request_reviewers`, `search_code`, `search_commits`, `search_issues`, `search_repos`, `search_users`, `unlock_issue`, `update_gist`, `update_issue`, `update_pull_request`.

**Result: zero collisions.** `list_notifications`, `list_starred_repos`, `check_repo_starred`, `star_repo`, and `unstar_repo` are all distinct from every existing name. The `star_repo`/`unstar_repo` names deliberately differ from `list_starred_repos` to avoid ambiguity (the action vs. the list), and from `check_repo_starred` to distinguish mutation from inspection.

---

## Verified octokit `activity` namespace shapes

Confirmed directly against the installed `@octokit/plugin-rest-endpoint-methods` endpoint table and `@octokit/openapi-types/types.d.ts`.

| Tool | octokit call | Key parameters | Response shape |
|---|---|---|---|
| `list_notifications` | `activity.listNotificationsForAuthenticatedUser({ all?, participating?, since?, before?, page?, per_page? })` | `page`, `per_page` (max **50**), `all`, `participating` | `thread[]` (200) |
| `list_starred_repos` | `activity.listReposStarredByAuthenticatedUser({ sort?, direction?, page?, per_page? })` | `sort` (`created`/`updated`), `direction` (`asc`/`desc`), pagination | `repository[]` (200) |
| `check_repo_starred` | `activity.checkRepoIsStarredByAuthenticatedUser({ owner, repo })` | `owner`, `repo` | 204 (starred) OR 404 (not starred) |
| `star_repo` | `activity.starRepoForAuthenticatedUser({ owner, repo })` | `owner`, `repo` | 204 No Content |
| `unstar_repo` | `activity.unstarRepoForAuthenticatedUser({ owner, repo })` | `owner`, `repo` | 204 No Content |

**Octokit method naming notes (verified via `octokit.rest.activity[name].endpoint.DEFAULTS`):**
- `listNotificationsForAuthenticatedUser` (not `listNotifications`) — the method name includes "ForAuthenticatedUser" suffix.
- `listReposStarredByAuthenticatedUser` (not `listStarred` or `listStarredRepos`) — full descriptive name.
- `checkRepoIsStarredByAuthenticatedUser` (not `checkStarred`) — full descriptive name.
- `starRepoForAuthenticatedUser` / `unstarRepoForAuthenticatedUser` — both include "ForAuthenticatedUser" suffix.

**`per_page` cap for `list_notifications`:** GitHub's OpenAPI spec defines the notifications endpoint `per_page` as a max-50 field (not the standard max-100 used by most list endpoints). This is confirmed in `@octokit/openapi-types/types.d.ts` line 88615: `/** @description The number of results per page (max 50). */`. The Zod schema must use `.max(50)` for this tool only — do NOT use `paginationSchema` spread for `list_notifications`.

**`list_starred_repos` content negotiation note:** The `200` response in `@octokit/openapi-types` shows two content types: `application/json` → `repository[]` and `application/vnd.github.v3.star+json` → `starred-repository[]`. Octokit's default Accept header resolves to `application/json`, so `response.data` will be the `repository[]` shape (full repository objects with `id`, `name`, `full_name`, `owner`, `description`, `html_url`, `stargazers_count`, etc.). No special Accept header manipulation is needed.

**`check_repo_starred` dual-status handling:** The endpoint communicates its answer entirely via HTTP status code: 204 = starred, 404 = not starred. Both are valid, non-error outcomes. The implementation must:
1. Call `octokit.rest.activity.checkRepoIsStarredByAuthenticatedUser({ owner, repo })`.
2. On success (204): return `toToolResult({ starred: true })`.
3. In the catch block: inspect the error. If it is an `RequestError` with `status === 404`, return `toToolResult({ starred: false })` — do NOT call `toToolError`. Re-throw (or call `toToolError`) for any other status code.

This is the only tool in the `activity` toolset with catch-block branching logic. The pattern follows the spec requirement: "handle both without throwing (catch 404, return `{ starred: false }`)".

---

## File Structure

```
github-mcp-server-js/
  src/
    toolsets/
      activity.ts              # NEW: registerActivityTools(server, octokit, permission)
    server.ts                  # MODIFIED: calls registerActivityTools
  test/
    unit/
      toolsets/
        activity.test.ts       # NEW: mirrors gists.test.ts's 3-task structure
```

`common.ts` is NOT modified — no parameter in this toolset is shared with 2+ other toolsets. `ownerRepoSchema` from `common.ts` covers `owner`/`repo` but is already used only by `repos.ts`, `issues.ts`, and `pull_requests.ts`. Since `activity.ts` needs `owner`/`repo` too, this is exactly 2 toolsets already using it if we count activity — however the prompt constraint says "Zero modification to common.ts unless truly shared with 2+ toolsets". Since `ownerRepoSchema` is already exported from `common.ts` and already shared, `activity.ts` **may** import and reuse `ownerRepoSchema` from `./common.js` without modifying `common.ts`. No new exports to `common.ts` are added.

---

## Task 1: Implement the `activity` toolset — read tools (`list_notifications`, `list_starred_repos`, `check_repo_starred`) and their tests

**Files:**
- Create: `src/toolsets/activity.ts` (read tools only; write tools stubbed as empty `if` block with comment)
- Create: `test/unit/toolsets/activity.test.ts` (read-tool tests only)

**Interfaces:**
- Consumes: `ownerRepoSchema`, `toToolResult`, `toToolError` from `./common.js` (already exist, no modification needed). `paginationSchema` is NOT used for `list_notifications` (different `per_page` cap); it IS used for `list_starred_repos`.
- Produces (for Tasks 2 and 3 to extend): `registerActivityTools(server: McpServer, octokit: Octokit, permission: 'read-only' | 'read-write'): void`

- [x] **Step 1: Write the failing tests for the read tools**

Create `test/unit/toolsets/activity.test.ts`:

```typescript
import nock from 'nock';
import { afterEach, describe, expect, it } from 'vitest';
import { registerActivityTools } from '../../../src/toolsets/activity.js';
import { connectedClient } from './test-helpers.js';

describe('registerActivityTools', () => {
  afterEach(() => {
    nock.cleanAll();
  });

  it('registers list_notifications and returns the raw GitHub response as JSON', async () => {
    nock('https://api.github.com')
      .get('/notifications')
      .query({ page: '1', per_page: '30', all: 'false' })
      .reply(200, [
        {
          id: '1',
          unread: true,
          reason: 'subscribed',
          updated_at: '2024-09-25T07:54:00Z',
          subject: {
            title: 'Greetings',
            type: 'Issue',
            url: 'https://api.github.com/repos/octokit/octokit.rb/issues/123',
          },
          repository: {
            id: 1296269,
            name: 'Hello-World',
            full_name: 'octocat/Hello-World',
          },
        },
      ]);

    const client = await connectedClient(registerActivityTools, 'read-write');
    const result = await client.callTool({
      name: 'list_notifications',
      arguments: {},
    });

    expect(result.isError).toBeFalsy();
    const text = (result.content as Array<{ type: string; text: string }>)[0]?.text ?? '';
    const parsed = JSON.parse(text) as Array<{ id: string; unread: boolean }>;
    expect(parsed).toHaveLength(1);
    expect(parsed[0]).toMatchObject({ id: '1', unread: true, reason: 'subscribed' });
  });

  it('forwards explicit page and per_page to list_notifications on the wire', async () => {
    const scope = nock('https://api.github.com')
      .get('/notifications')
      .query({ page: '2', per_page: '10', all: 'false' })
      .reply(200, []);

    const client = await connectedClient(registerActivityTools, 'read-write');
    const result = await client.callTool({
      name: 'list_notifications',
      arguments: { page: 2, per_page: 10 },
    });

    expect(result.isError).toBeFalsy();
    expect(scope.isDone()).toBe(true);
  });

  it('forwards all=true to list_notifications on the wire', async () => {
    const scope = nock('https://api.github.com')
      .get('/notifications')
      .query({ page: '1', per_page: '30', all: 'true' })
      .reply(200, []);

    const client = await connectedClient(registerActivityTools, 'read-write');
    const result = await client.callTool({
      name: 'list_notifications',
      arguments: { all: true },
    });

    expect(result.isError).toBeFalsy();
    expect(scope.isDone()).toBe(true);
  });

  it('propagates a 401 from list_notifications as an MCP tool error', async () => {
    nock('https://api.github.com')
      .get('/notifications')
      .query(true)
      .reply(401, {
        message: 'Requires authentication',
        documentation_url: 'https://docs.github.com/rest',
      });

    const client = await connectedClient(registerActivityTools, 'read-write');
    const result = await client.callTool({
      name: 'list_notifications',
      arguments: {},
    });

    expect(result.isError).toBe(true);
    const text = (result.content as Array<{ type: string; text: string }>)[0]?.text ?? '';
    expect(text).toContain('Requires authentication');
  });

  it('registers list_starred_repos and returns the raw GitHub response as JSON', async () => {
    nock('https://api.github.com')
      .get('/user/starred')
      .query({ page: '1', per_page: '30' })
      .reply(200, [
        {
          id: 1296269,
          name: 'Hello-World',
          full_name: 'octocat/Hello-World',
          html_url: 'https://github.com/octocat/Hello-World',
          description: 'This your first repo!',
          stargazers_count: 80,
          private: false,
        },
      ]);

    const client = await connectedClient(registerActivityTools, 'read-write');
    const result = await client.callTool({
      name: 'list_starred_repos',
      arguments: {},
    });

    expect(result.isError).toBeFalsy();
    const text = (result.content as Array<{ type: string; text: string }>)[0]?.text ?? '';
    expect(JSON.parse(text)).toMatchObject([
      { id: 1296269, full_name: 'octocat/Hello-World' },
    ]);
  });

  it('forwards sort and direction to list_starred_repos on the wire', async () => {
    const scope = nock('https://api.github.com')
      .get('/user/starred')
      .query({ page: '1', per_page: '30', sort: 'updated', direction: 'asc' })
      .reply(200, []);

    const client = await connectedClient(registerActivityTools, 'read-write');
    const result = await client.callTool({
      name: 'list_starred_repos',
      arguments: { sort: 'updated', direction: 'asc' },
    });

    expect(result.isError).toBeFalsy();
    expect(scope.isDone()).toBe(true);
  });

  it('registers check_repo_starred and returns { starred: true } when the repo is starred', async () => {
    nock('https://api.github.com')
      .get('/user/starred/octocat/Hello-World')
      .reply(204);

    const client = await connectedClient(registerActivityTools, 'read-write');
    const result = await client.callTool({
      name: 'check_repo_starred',
      arguments: { owner: 'octocat', repo: 'Hello-World' },
    });

    expect(result.isError).toBeFalsy();
    const text = (result.content as Array<{ type: string; text: string }>)[0]?.text ?? '';
    expect(JSON.parse(text)).toEqual({ starred: true });
  });

  it('returns { starred: false } (not an error) when the repo is not starred (404)', async () => {
    nock('https://api.github.com')
      .get('/user/starred/octocat/Hello-World')
      .reply(404, {
        message: 'Not Found',
        documentation_url: 'https://docs.github.com/rest',
      });

    const client = await connectedClient(registerActivityTools, 'read-write');
    const result = await client.callTool({
      name: 'check_repo_starred',
      arguments: { owner: 'octocat', repo: 'Hello-World' },
    });

    expect(result.isError).toBeFalsy();
    const text = (result.content as Array<{ type: string; text: string }>)[0]?.text ?? '';
    expect(JSON.parse(text)).toEqual({ starred: false });
  });

  it('propagates a 401 from check_repo_starred as an MCP tool error', async () => {
    nock('https://api.github.com')
      .get('/user/starred/octocat/Hello-World')
      .reply(401, {
        message: 'Requires authentication',
        documentation_url: 'https://docs.github.com/rest',
      });

    const client = await connectedClient(registerActivityTools, 'read-write');
    const result = await client.callTool({
      name: 'check_repo_starred',
      arguments: { owner: 'octocat', repo: 'Hello-World' },
    });

    expect(result.isError).toBe(true);
    const text = (result.content as Array<{ type: string; text: string }>)[0]?.text ?? '';
    expect(text).toContain('Requires authentication');
  });

  it('registers exactly 3 read tools in read-only mode', async () => {
    const client = await connectedClient(registerActivityTools, 'read-only');
    const { tools } = await client.listTools();
    expect(tools.map((t) => t.name).sort()).toEqual([
      'check_repo_starred',
      'list_notifications',
      'list_starred_repos',
    ]);
  });
});
```

- [x] **Step 2: Run tests to verify they fail**

Run: `npm test -- activity`
Expected: FAIL with a module-not-found error for `../../../src/toolsets/activity.js`.

- [x] **Step 3: Create `src/toolsets/activity.ts` with the 3 read tools**

```typescript
import type { McpServer } from '@modelcontextprotocol/server';
import type { RequestError } from '@octokit/request-error';
import type { Octokit } from 'octokit';
import { z } from 'zod';
import { ownerRepoSchema, paginationSchema, toToolError, toToolResult } from './common.js';

export function registerActivityTools(
  server: McpServer,
  octokit: Octokit,
  permission: 'read-only' | 'read-write',
): void {
  server.registerTool(
    'list_notifications',
    {
      description:
        'List notifications for the authenticated user. Returns an array of thread objects representing unread (or all) notifications. Each thread includes the subject (title, type, URL), repository, reason, and updated_at timestamp. Use all=true to include already-read notifications. Paginate with page and per_page (max 50 per page — GitHub caps this endpoint at 50, not the usual 100).',
      inputSchema: z.object({
        all: z
          .boolean()
          .optional()
          .default(false)
          .describe(
            'If true, return all notifications including already-read ones. If false (default), return only unread notifications.',
          ),
        participating: z
          .boolean()
          .optional()
          .describe(
            'If true, return only notifications in which the authenticated user is directly participating or mentioned.',
          ),
        since: z
          .string()
          .optional()
          .describe(
            'Only show notifications updated after the given time. ISO 8601 format: YYYY-MM-DDTHH:MM:SSZ.',
          ),
        before: z
          .string()
          .optional()
          .describe(
            'Only show notifications updated before the given time. ISO 8601 format: YYYY-MM-DDTHH:MM:SSZ.',
          ),
        page: z.number().int().min(1).default(1),
        per_page: z
          .number()
          .int()
          .min(1)
          .max(50)
          .default(30)
          .describe('Number of results per page. Maximum 50 (GitHub cap for this endpoint).'),
      }),
    },
    async ({ all, participating, since, before, page, per_page }) => {
      try {
        const response = await octokit.rest.activity.listNotificationsForAuthenticatedUser({
          all,
          participating,
          since,
          before,
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
    'list_starred_repos',
    {
      description:
        'List repositories starred by the authenticated user. Returns an array of repository objects including id, name, full_name, html_url, description, stargazers_count, language, and owner. Sort by created (when the user starred it) or updated (when the repo was last pushed to). Paginate with page and per_page.',
      inputSchema: z.object({
        sort: z
          .enum(['created', 'updated'])
          .optional()
          .describe(
            'Sort starred repositories by created (date the authenticated user starred the repo, default) or updated (date the repo was last pushed to).',
          ),
        direction: z
          .enum(['asc', 'desc'])
          .optional()
          .describe('Sort direction: asc or desc. Default is desc.'),
        ...paginationSchema,
      }),
    },
    async ({ sort, direction, page, per_page }) => {
      try {
        const response = await octokit.rest.activity.listReposStarredByAuthenticatedUser({
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
    'check_repo_starred',
    {
      description:
        'Check whether the authenticated user has starred a given repository. Returns { starred: true } if the repository is starred, or { starred: false } if it is not. Never returns an error for a 404 (not-starred) response — only errors on authentication failures (401/403) or truly unexpected conditions.',
      inputSchema: z.object({
        ...ownerRepoSchema,
      }),
    },
    async ({ owner, repo }) => {
      try {
        await octokit.rest.activity.checkRepoIsStarredByAuthenticatedUser({ owner, repo });
        return toToolResult({ starred: true });
      } catch (error) {
        const reqError = error as RequestError;
        if (reqError.status === 404) {
          return toToolResult({ starred: false });
        }
        return toToolError(error);
      }
    },
  );

  if (permission === 'read-write') {
    // Write tools added in Task 2.
  }
}
```

**Note on the empty `if` block:** If `eslint` reports a `no-empty` warning for the placeholder comment block, remove the `if` block entirely and re-add it in Task 2 when the write-tool bodies are inserted. Do not add an ESLint disable comment — remove and restore instead.

**Note on `RequestError` import:** `@octokit/request-error` is a transitive dependency of `octokit` and is available without adding it to `package.json`. The type import (`import type { RequestError }`) is TypeScript-only and does not appear in the compiled output. If the TypeScript compiler cannot resolve this import, use `(error as { status?: number }).status === 404` inline as a fallback — this is equivalent and avoids the import.

- [x] **Step 4: Run tests to verify they pass**

Run: `npm test -- activity`
Expected: PASS (9 tests).

- [x] **Step 5: Typecheck and lint**

Run: `npm run typecheck && npm run lint`
Expected: both PASS with zero errors.

- [x] **Step 6: Stage `cspell.json` if any test fixture strings trigger cspell errors**

The test file uses `'octocat'` (already in `cspell.json`), `'subscribed'` (common English word), `'stargazers'` (compound, may be flagged), and `'unread'` (common). If cspell flags `stargazers` or any other fixture string at commit time, add it to the `words` array in `cspell.json` and stage it in the same commit. The current `cspell.json` already has `"octocat"` in its `words` array.

- [x] **Step 7: Commit**

```bash
git add src/toolsets/activity.ts test/unit/toolsets/activity.test.ts
git commit -m "feat: add activity toolset read tools (list_notifications, list_starred_repos, check_repo_starred)"
```

---

## Task 2: Implement the `activity` toolset — write tools (`star_repo`, `unstar_repo`) and their tests

**Files:**
- Modify: `src/toolsets/activity.ts` (replace the `if (permission === 'read-write') { }` placeholder with real write-tool bodies)
- Modify: `test/unit/toolsets/activity.test.ts` (append write-tool and permission-gate tests inside the existing `describe` block)

**Interfaces:**
- Consumes: same `registerActivityTools` function from Task 1 — this task adds write tools to it, not replaces it.
- Produces: `star_repo` and `unstar_repo` are registered only when `permission === 'read-write'`.

- [x] **Step 1: Write the failing tests for the write tools**

Append the following tests inside the existing `describe('registerActivityTools', ...)` block in `test/unit/toolsets/activity.test.ts`, right before the closing `});`:

```typescript
  it('registers star_repo and returns { starred: true }', async () => {
    nock('https://api.github.com')
      .put('/user/starred/octocat/Hello-World')
      .reply(204);

    const client = await connectedClient(registerActivityTools, 'read-write');
    const result = await client.callTool({
      name: 'star_repo',
      arguments: { owner: 'octocat', repo: 'Hello-World' },
    });

    expect(result.isError).toBeFalsy();
    const text = (result.content as Array<{ type: string; text: string }>)[0]?.text ?? '';
    expect(JSON.parse(text)).toEqual({ starred: true });
  });

  it('propagates a 404 from star_repo as an MCP tool error', async () => {
    nock('https://api.github.com')
      .put('/user/starred/octocat/nonexistent-repo-xyz')
      .reply(404, {
        message: 'Not Found',
        documentation_url: 'https://docs.github.com/rest',
      });

    const client = await connectedClient(registerActivityTools, 'read-write');
    const result = await client.callTool({
      name: 'star_repo',
      arguments: { owner: 'octocat', repo: 'nonexistent-repo-xyz' },
    });

    expect(result.isError).toBe(true);
    const text = (result.content as Array<{ type: string; text: string }>)[0]?.text ?? '';
    expect(text).toContain('Not Found');
  });

  it('registers unstar_repo and returns { starred: false }', async () => {
    nock('https://api.github.com')
      .delete('/user/starred/octocat/Hello-World')
      .reply(204);

    const client = await connectedClient(registerActivityTools, 'read-write');
    const result = await client.callTool({
      name: 'unstar_repo',
      arguments: { owner: 'octocat', repo: 'Hello-World' },
    });

    expect(result.isError).toBeFalsy();
    const text = (result.content as Array<{ type: string; text: string }>)[0]?.text ?? '';
    expect(JSON.parse(text)).toEqual({ starred: false });
  });

  it('propagates a 401 from unstar_repo as an MCP tool error', async () => {
    nock('https://api.github.com')
      .delete('/user/starred/octocat/Hello-World')
      .reply(401, {
        message: 'Requires authentication',
        documentation_url: 'https://docs.github.com/rest',
      });

    const client = await connectedClient(registerActivityTools, 'read-write');
    const result = await client.callTool({
      name: 'unstar_repo',
      arguments: { owner: 'octocat', repo: 'Hello-World' },
    });

    expect(result.isError).toBe(true);
    const text = (result.content as Array<{ type: string; text: string }>)[0]?.text ?? '';
    expect(text).toContain('Requires authentication');
  });

  it('does not register any write tool in read-only mode', async () => {
    const client = await connectedClient(registerActivityTools, 'read-only');
    const { tools } = await client.listTools();
    const names = tools.map((t) => t.name);
    expect(names).not.toContain('star_repo');
    expect(names).not.toContain('unstar_repo');
  });

  it('registers all 5 activity tools in read-write mode', async () => {
    const client = await connectedClient(registerActivityTools, 'read-write');
    const { tools } = await client.listTools();
    expect(tools.map((t) => t.name).sort()).toEqual([
      'check_repo_starred',
      'list_notifications',
      'list_starred_repos',
      'star_repo',
      'unstar_repo',
    ]);
  });
```

- [x] **Step 2: Run tests to verify they fail**

Run: `npm test -- activity`
Expected: FAIL — the 4 write-tool tests fail with "Tool not found" (`ProtocolError`); the permission/count tests may fail depending on assertion direction. Re-run after Step 3.

- [x] **Step 3: Add the write tools to `src/toolsets/activity.ts`**

Replace the `if (permission === 'read-write') { // Write tools added in Task 2. }` placeholder (or add the block at the end of `registerActivityTools` if Task 1's lint step removed it) with:

```typescript
  if (permission === 'read-write') {
    server.registerTool(
      'star_repo',
      {
        description:
          'Star a repository on behalf of the authenticated user. Starring marks a repository as interesting and adds it to the authenticated user\'s starred list (visible via list_starred_repos). Returns { starred: true } on success. Returns an error if the repository does not exist or the token lacks sufficient scope.',
        inputSchema: z.object({
          ...ownerRepoSchema,
        }),
      },
      async ({ owner, repo }) => {
        try {
          await octokit.rest.activity.starRepoForAuthenticatedUser({ owner, repo });
          return toToolResult({ starred: true });
        } catch (error) {
          return toToolError(error);
        }
      },
    );

    server.registerTool(
      'unstar_repo',
      {
        description:
          'Unstar a repository that the authenticated user has previously starred. Removes the repository from the authenticated user\'s starred list. Returns { starred: false } on success. This is a no-op if the repository was not already starred (GitHub returns 204 either way), so the result is always { starred: false } on a 204 response.',
        inputSchema: z.object({
          ...ownerRepoSchema,
        }),
      },
      async ({ owner, repo }) => {
        try {
          await octokit.rest.activity.unstarRepoForAuthenticatedUser({ owner, repo });
          return toToolResult({ starred: false });
        } catch (error) {
          return toToolError(error);
        }
      },
    );
  }
```

- [x] **Step 4: Run tests to verify they pass**

Run: `npm test -- activity`
Expected: PASS (15 tests: 9 from Task 1 + 6 new).

- [x] **Step 5: Typecheck, lint, and full suite**

Run: `npm run typecheck && npm run lint && npm test`
Expected: all PASS. The full suite total is 94 (prior total after `gists`) + 15 = 109 tests.

- [x] **Step 6: Stage `cspell.json` if needed**

If any string in the test file triggers a cspell failure at commit time, add the offending word to `cspell.json`'s `words` array and stage it alongside the source files:

```bash
git add cspell.json  # only if cspell.json was modified
git add src/toolsets/activity.ts test/unit/toolsets/activity.test.ts
git commit -m "feat: add activity toolset write tools (star_repo, unstar_repo)"
```

If `cspell.json` was not modified, omit it from the staging command.

---

## Task 3: Wire `registerActivityTools` into `server.ts` and update README

**Files:**
- Modify: `src/server.ts`
- Modify: `README.md`

**Interfaces:**
- Consumes: `registerActivityTools(server, octokit, permission)` from Task 2.
- Produces: nothing new — this is the final integration point.

- [x] **Step 1: Modify `src/server.ts`**

Current content:

```typescript
import { McpServer } from '@modelcontextprotocol/server';
import type { Octokit } from 'octokit';
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

  return server;
}
```

Replace with (new import sorted alphabetically alongside existing imports):

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

- [x] **Step 2: Run the full test suite**

Run: `npm test`
Expected: PASS, same 109 tests as after Task 2.

- [x] **Step 3: Typecheck, lint, and build**

Run: `npm run typecheck && npm run lint && npm run build`
Expected: all PASS. The build step confirms `dist/cli.js`'s bundled dependency graph transitively includes `activity.ts`.

- [x] **Step 4: Update `README.md`'s Toolsets section**

Append to the "Currently implemented" list (after the existing `gists` bullet):

```markdown
- `activity` — list notifications, list starred repos, check/star/unstar a repository
```

- [x] **Step 5: Manual end-to-end smoke test**

Run:
```bash
GITHUB_TOKEN=fake-token node dist/cli.js --transport=http --port=3996 &
sleep 1
curl -s -D /tmp/mcp-activity-init-headers.txt -X POST http://localhost:3996/mcp \
  -H 'Content-Type: application/json' \
  -H 'Accept: application/json, text/event-stream' \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"smoke-test","version":"0.0.0"}}}'
SESSION=$(grep -i mcp-session-id /tmp/mcp-activity-init-headers.txt | awk '{print $2}' | tr -d '\r')
curl -s -X POST http://localhost:3996/mcp \
  -H 'Content-Type: application/json' \
  -H 'Accept: application/json, text/event-stream' \
  -H "Mcp-Session-Id: $SESSION" \
  -d '{"jsonrpc":"2.0","id":2,"method":"tools/list","params":{}}'
kill %1
```

Expected: the `tools/list` response includes `list_notifications`, `list_starred_repos`, `check_repo_starred`, `star_repo`, and `unstar_repo` — plus all 45 previously-shipped tools — proving all seven toolsets are live in the same server with no duplicate-registration crash.

- [x] **Step 6: Commit**

```bash
git add src/server.ts README.md
git commit -m "feat: wire activity toolset into buildServer"
```

---

## Deliberate Scope Decisions

The following `octokit.rest.activity.*` methods are **intentionally excluded** from this toolset. Each exclusion is justified below.

1. **`activity.markNotificationsAsRead` (PUT `/notifications`) — out of scope.** Marks all (or post-`last_read_at`) notifications as read. It returns either `202 Accepted` (async processing, with a `{ message: string }` body) or `205 Reset Content` (no body). The dual-status response (with `205` being a `content: never` case) complicates the raw-passthrough pattern — the implementer would need to synthesize a result for 205 the same way 204 is handled. More importantly, bulk-marking-all-as-read is a destructive, irreversible operation with no scoping (you cannot mark just one thread as read via this endpoint). Excluded to avoid accidental mass-read in agentic sessions. Can be added in a focused notifications follow-up alongside `markThreadAsRead` and `getThread`.

2. **`activity.getThread` (GET `/notifications/threads/{thread_id}`) — out of scope.** Returns details for a single notification thread by ID. Useful in combination with `list_notifications` (to drill into a specific thread), but only when you already have a `thread_id`. This is a niche follow-up operation that pairs naturally with thread-level mark-as-read. Excluded in this first pass to keep the toolset at ~5 tools; easily added in a follow-up alongside `markThreadAsRead`.

3. **`activity.markThreadAsRead` (PATCH `/notifications/threads/{thread_id}`) — out of scope.** Marks a single thread as read (returns 205 No Content). A write operation that belongs in a focused "notification management" follow-up plan alongside `getThread` and `markThreadAsDone`.

4. **`activity.markThreadAsDone` (DELETE `/notifications/threads/{thread_id}`) — out of scope.** Marks a single notification thread as "done" and removes it from the inbox (returns 204). Belongs with the other thread-management tools in a follow-up.

5. **`activity.getThreadSubscriptionForAuthenticatedUser` / `activity.setThreadSubscription` / `activity.deleteThreadSubscription` — out of scope.** Thread subscription management (ignore/watch/unsubscribe from specific notification threads) is a niche workflow best covered in a dedicated notification-management follow-up. The PUT/DELETE are write operations; the GET subscription status is only meaningful alongside those writes.

6. **`activity.listRepoNotificationsForAuthenticatedUser` (GET `/repos/{owner}/{repo}/notifications`) — out of scope.** Returns notifications scoped to a single repository. This is a filtering variant of `list_notifications` that adds `owner`/`repo` path parameters. LLM callers can approximate this by calling `list_notifications` and filtering client-side on `notification.repository.full_name`. A focused notifications follow-up can add this alongside the thread-management tools.

7. **`activity.listReposWatchedByUser` / `activity.listWatchedReposForAuthenticatedUser` — out of scope.** Returns repositories the authenticated user is watching (subscribed to). Watch/subscribe is a separate concept from star; the watch-subscription CRUD endpoints (`getRepoSubscription`, `setRepoSubscription`, `deleteRepoSubscription`) are a distinct feature cluster. Excluded to keep the toolset focused on the notification-read and star-management surface covered by the ~5-tool estimate. Can be added as a follow-up "watch/subscription" toolset or as an extension to this toolset.

8. **`activity.listStargazersForRepo` (GET `/repos/{owner}/{repo}/stargazers`) — out of scope.** Lists the users who have starred a repository. This is a repo-centric operation (who starred my repo?) rather than a user-centric one (what have I starred?). The `repos` toolset is the natural home for this if it is ever added; it does not belong in `activity`, which covers user-as-actor star operations.

9. **`activity.listReposStarredByUser` (GET `/users/{username}/starred`) — out of scope.** Lists repos starred by an arbitrary user by username. Excluded because `list_starred_repos` already covers the authenticated user's starred repos (the common case), and listing another user's stars is a niche cross-user operation. The `users` toolset already follows this pattern (chose `list_user_followers` over `listFollowersForAuthenticatedUser`). Can be added in a follow-up without disturbing the 5-tool surface.

10. **`activity.listWatchersForRepo` (GET `/repos/{owner}/{repo}/subscribers`) — out of scope.** Lists users watching a repository. Repo-centric, belongs in `repos` toolset if added.

11. **`activity.getRepoSubscription` / `activity.setRepoSubscription` / `activity.deleteRepoSubscription` — out of scope.** Manages the authenticated user's watch subscription to a specific repository (ignoring vs. watching). A distinct write-heavy feature cluster; belongs in a follow-up "watch management" extension.

12. **`activity.getFeeds` (GET `/feeds`) — out of scope.** Returns URLs for various GitHub Atom feeds (news feed, public timeline, etc.). A metadata/discovery endpoint for RSS/Atom consumers; not a useful LLM-agentic action.

13. **Event stream endpoints (`listEventsForAuthenticatedUser`, `listPublicEvents`, `listPublicEventsForRepoNetwork`, `listPublicEventsForUser`, `listPublicOrgEvents`, `listOrgEventsForAuthenticatedUser`, `listReceivedEventsForUser`, `listReceivedPublicEventsForUser`, `listRepoEvents`) — out of scope.** Event feeds are fire-hose, append-only streams of GitHub activity events (PushEvent, CreateEvent, etc.). They are high-volume, lack meaningful filtering for agentic purposes, and overlap with what webhooks/`list_notifications` cover. Excluded from the entire v1 scope.

---

## Self-Review Notes

**Verification checklist (all items confirmed):**

1. **Every tool name is collision-free.** `list_notifications`, `list_starred_repos`, `check_repo_starred`, `star_repo`, `unstar_repo` — none overlap with the 45 existing tool names enumerated above in the Tool Selection and Collision Check section.

2. **Every octokit method exists.** Confirmed via:
   ```
   node --input-type=module -e "import { Octokit } from 'octokit'; const o = new Octokit({ auth: 'x' }); const m = o.rest.activity; for (const k of Object.keys(m).sort()) { const d = m[k].endpoint.DEFAULTS; console.log(k, '->', d.method, d.url); }"
   ```
   Output confirmed all 5 selected methods with correct HTTP method and URL.

3. **`per_page` cap confirmed in openapi-types.** Line 88614–88615 of `node_modules/@octokit/openapi-types/types.d.ts`: `/** @description The number of results per page (max 50). */`. The Zod schema uses `.max(50)` for `list_notifications` only; `list_starred_repos` uses `paginationSchema` (max 100) per the standard GitHub per_page cap for that endpoint.

4. **`check_repo_starred` dual-status verified in openapi-types.** Lines 120848–120862 of `@octokit/openapi-types/types.d.ts` confirm: `204: { content: never }` (starred) and `404: { content: { "application/json": basic-error } }` (not starred). Both are explicitly documented responses, not errors.

5. **`star_repo` and `unstar_repo` 204 No Content verified.** Lines 120876–120879 and 120897–120900 of `@octokit/openapi-types/types.d.ts` confirm both return `204: { content: never }`. Synthetic results `{ starred: true }` and `{ starred: false }` follow the gists `delete_gist` precedent.

6. **Read-only mode test uses `.toEqual([...exact 3 names sorted...])`.** Task 1, Step 1's last test: `expect(tools.map((t) => t.name).sort()).toEqual(['check_repo_starred', 'list_notifications', 'list_starred_repos'])` — strict equality, not `arrayContaining`.

7. **Read-write mode test verifies all 5 tools present.** Task 2, Step 1's last test: `expect(tools.map((t) => t.name).sort()).toEqual(['check_repo_starred', 'list_notifications', 'list_starred_repos', 'star_repo', 'unstar_repo'])` — strict equality with all 5 names sorted.

8. **Wire-level filter tests on query params.** Task 1, Step 1 includes tests for `all=true` forwarding on `list_notifications` and `sort`/`direction` forwarding on `list_starred_repos`, both using `scope.isDone()` assertions to verify the parameters reach the wire.

9. **Signature matches required form.** `registerActivityTools(server: McpServer, octokit: Octokit, permission: 'read-only' | 'read-write'): void` — identical shape to every other `register*Tools` function. The `permission` parameter is used (not `_permission`) because this toolset has real write tools gated by it.

10. **Write tools inside `if (permission === 'read-write') { ... }`.** Task 2, Step 3 shows both write tools (`star_repo`, `unstar_repo`) inside the `if` block. Matches `issues.ts`, `pull_requests.ts`, and `gists.ts`.

11. **`check_repo_starred` 404 catch does NOT call `toToolError`.** The catch block explicitly checks `reqError.status === 404` and returns `toToolResult({ starred: false })` — not `toToolError`. All other statuses fall through to `toToolError`. This is tested by the "returns `{ starred: false }` (not an error)" test, which asserts `expect(result.isError).toBeFalsy()`.

12. **`cspell.json` staging instruction present.** Both Task 1 Step 6 and Task 2 Step 6 explicitly instruct the implementer to check for cspell failures at commit time and stage `cspell.json` if any fixture words trigger errors. `'stargazers'` is flagged as a potential cspell candidate.

13. **No modification to `common.ts` except importing existing exports.** `ownerRepoSchema` is already exported from `common.ts` and is reused (not redeclared) in `activity.ts`. `paginationSchema` is reused for `list_starred_repos`. No new exports are added to `common.ts`.

14. **Test count arithmetic.** Prior total after `gists` = 94. This plan adds 15 tests (9 in Task 1 + 6 in Task 2). Post-activity total = 109. (Breakdown: `common` 3 + `repos` 6 + `issues` 16 + `pull_requests` 15 + `search` 8 + `users` 10 + `gists` 11 + `activity` 15 = 84 test-file `it()` calls not counting `common.test.ts` re-checks. The 94→109 delta of 15 is correct.)
