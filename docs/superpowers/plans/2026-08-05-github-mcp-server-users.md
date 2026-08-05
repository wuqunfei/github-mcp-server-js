# github-mcp-server-js — `users` Toolset Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Add the `users` toolset (5 read-only tools wrapping GitHub's REST user-info endpoints — get user by username, get the authenticated user, list followers, list following, get hovercard context) to `github-mcp-server-js`, following the exact structural, permission-gating, and response/error pattern established by the `repos`, `issues`, `pull_requests`, and `search` toolsets.

**Architecture:** Same pattern as prior toolsets: one `registerUsersTools(server, octokit, permission)` function registers each tool with `server.registerTool(name, {description, inputSchema}, handler)`; every handler wraps its octokit call in try/catch, returning raw JSON via `toToolResult`/`toToolError`; `server.ts` gains one more registration call. All octokit calls use the `users` namespace (`octokit.rest.users.*`). Because every users endpoint selected for this toolset is read-only, the `permission === 'read-write'` branch is unused — the `permission` parameter is accepted (to keep the signature uniform across every `register*Tools` function) but never inspected.

**Tech Stack:** Same as prior plans — TypeScript, `@modelcontextprotocol/server@^2.0.0`, `octokit@^5.0.5`, `zod@^4.2.0`, `vitest`, `nock`. No new dependencies.

## Global Constraints

- Tool responses return the raw octokit response body as JSON, unmodified. No field trimming, no text summarization. `get_user_by_username` and `get_authenticated_user` return a `public-user` or `private-user` object; list tools return `simple-user[]` arrays; `get_user_hovercard` returns a `hovercard` object. These exact shapes are preserved; callers pull fields themselves.
- Errors propagate unmodified: catch the octokit `RequestError`, surface `error.message` (which already includes the GitHub `message` field) in an MCP tool error result. No normalization layer.
- List tools take explicit `page` (default `1`) and `per_page` (default `30`, max `100`) parameters. No auto-pagination. This matches every other toolset's pagination model.
- `GITHUB_PERMISSION=read-only` gating is a no-op for this toolset because every users tool is read-only; the read-only test in Task 1 still verifies the exact set of 5 tools is registered (using `.toEqual([...exact set...])` rather than `arrayContaining`, following the "lessons applied" note from the search plan's Self-Review Notes).
- `search_users` already exists in the `search` toolset (registered as part of `registerSearchTools`) and covers user discovery via keyword/qualifier queries. The `users` toolset does NOT re-implement search-by-query; it covers direct user-info lookup and social-graph list operations.
- Tool names use `_` separators and the `get_user_` / `list_user_` prefix pattern where disambiguation from other toolsets requires it. See collision check below.
- Verified tool-name collision check against the 35 existing tool names on `main` (8 from `repos.ts`, 12 from `issues.ts`, 10 from `pull_requests.ts`, 5 from `search.ts`): **zero collisions** with the 5 tool names chosen below (`get_user_by_username`, `get_authenticated_user`, `list_user_followers`, `list_user_following`, `get_user_hovercard`). The `get_user_` prefix was deliberately chosen over bare `get_user` because `get_user` is ambiguous and collides with an intuitive future tool name in `orgs_teams` (which could plausibly expose a `get_user`). `McpServer.registerTool` throws at registration time on duplicate names, so this was confirmed before finalizing names.
- No modification to `common.ts`.
- TypeScript only, no new runtime dependencies.

---

## File Structure

```
github-mcp-server-js/
  src/
    toolsets/
      users.ts               # NEW: registerUsersTools(server, octokit, permission)
    server.ts                 # MODIFIED: calls registerUsersTools
  test/
    unit/
      toolsets/
        users.test.ts          # NEW: mirrors search.test.ts's structure
```

`common.ts` is NOT modified — no new shared schema fragment is warranted (see Global Constraints above). `README.md`'s Toolsets section is updated in Task 2 (Step 5), same as the `search`/`pull_requests` plans did.

---

## Reference: verified octokit `users` namespace shapes

Confirmed directly against the installed `@octokit/plugin-rest-endpoint-methods` generated endpoint table (`octokit.rest.users[name].endpoint.DEFAULTS`) and the `@octokit/openapi-types` operation definitions at `node_modules/@octokit/openapi-types/types.d.ts`. All 5 selected endpoints are `GET`; none require a request body.

| Tool | octokit method | HTTP path | Path params | Query params | Response body |
|---|---|---|---|---|---|
| `get_user_by_username` | `users.getByUsername` | GET `/users/{username}` | `username` | — | `public-user \| private-user` |
| `get_authenticated_user` | `users.getAuthenticated` | GET `/user` | — | — | `public-user \| private-user` |
| `list_user_followers` | `users.listFollowersForUser` | GET `/users/{username}/followers` | `username` | `page`, `per_page` | `simple-user[]` |
| `list_user_following` | `users.listFollowingForUser` | GET `/users/{username}/following` | `username` | `page`, `per_page` | `simple-user[]` |
| `get_user_hovercard` | `users.getContextForUser` | GET `/users/{username}/hovercard` | `username` | `subject_type`, `subject_id` | `hovercard` |

Response body notes (raw passthrough, all `200 OK`):
- `get_user_by_username` / `get_authenticated_user` → `{ login, id, avatar_url, html_url, name, company, blog, location, email, public_repos, followers, following, created_at, ... }` (public-user shape). `get_authenticated_user` may include additional private fields (`private_gists`, `total_private_repos`, `plan`, etc.) when using a token with `user` scope.
- `list_user_followers` / `list_user_following` → `[{ login, id, avatar_url, html_url, ... }, ...]` (simple-user array).
- `get_user_hovercard` → `{ contexts: [{ message: string, octicon: string }, ...] }`.
- Non-2xx errors surface as `RequestError` and are handled by the same catch/`toToolError` path as every other tool.

**Deliberate scope decisions (see full section below for rationale):**

All read-only `octokit.rest.users.*` methods are accounted for: the 5 selected tools plus the explicitly-excluded methods listed in the "Deliberate scope decisions" section below.

---

## Task 1: Implement the `users` toolset (5 read-only tools) and its tests

**Files:**
- Create: `src/toolsets/users.ts`
- Test: `test/unit/toolsets/users.test.ts`

**Interfaces:**
- Consumes: `paginationSchema`, `toToolResult`, `toToolError` from `./common.js` (already exist — no modification needed).
- Produces (for Task 2 / `server.ts` to consume):
  - `registerUsersTools(server: McpServer, octokit: Octokit, permission: 'read-only' | 'read-write'): void` — same signature shape as `registerSearchTools`/`registerReposTools`/`registerIssuesTools`/`registerPullRequestsTools`. The `permission` parameter is accepted for signature uniformity but never inspected inside the function (all 5 tools are read-only); the parameter is renamed `_permission` inside the function body to satisfy the `@typescript-eslint/no-unused-vars` rule (`argsIgnorePattern: '^_'`).

- [x] **Step 1: Write the failing tests**

Create `test/unit/toolsets/users.test.ts`:

```typescript
import nock from 'nock';
import { afterEach, describe, expect, it } from 'vitest';
import { registerUsersTools } from '../../../src/toolsets/users.js';
import { connectedClient } from './test-helpers.js';

describe('registerUsersTools', () => {
  afterEach(() => {
    nock.cleanAll();
  });

  it('registers get_user_by_username and returns the raw GitHub user object as JSON', async () => {
    nock('https://api.github.com')
      .get('/users/octocat')
      .reply(200, {
        login: 'octocat',
        id: 1,
        avatar_url: 'https://github.com/images/error/octocat_happy.gif',
        html_url: 'https://github.com/octocat',
        name: 'The Octocat',
        public_repos: 8,
        followers: 20,
        following: 0,
      });

    const client = await connectedClient(registerUsersTools, 'read-write');
    const result = await client.callTool({
      name: 'get_user_by_username',
      arguments: { username: 'octocat' },
    });

    expect(result.isError).toBeFalsy();
    const text = (result.content as Array<{ type: string; text: string }>)[0]?.text ?? '';
    expect(JSON.parse(text)).toEqual({
      login: 'octocat',
      id: 1,
      avatar_url: 'https://github.com/images/error/octocat_happy.gif',
      html_url: 'https://github.com/octocat',
      name: 'The Octocat',
      public_repos: 8,
      followers: 20,
      following: 0,
    });
  });

  it('propagates a 404 from get_user_by_username as an MCP tool error', async () => {
    nock('https://api.github.com')
      .get('/users/nonexistent-user-xyz-abc-999')
      .reply(404, { message: 'Not Found', documentation_url: 'https://docs.github.com/rest' });

    const client = await connectedClient(registerUsersTools, 'read-write');
    const result = await client.callTool({
      name: 'get_user_by_username',
      arguments: { username: 'nonexistent-user-xyz-abc-999' },
    });

    expect(result.isError).toBe(true);
    const text = (result.content as Array<{ type: string; text: string }>)[0]?.text ?? '';
    expect(text).toContain('Not Found');
  });

  it('registers get_authenticated_user and returns the raw GitHub user object as JSON', async () => {
    nock('https://api.github.com')
      .get('/user')
      .reply(200, {
        login: 'monalisa',
        id: 2,
        avatar_url: 'https://github.com/images/error/monalisa.png',
        html_url: 'https://github.com/monalisa',
        name: 'monalisa octocat',
        private_gists: 3,
        total_private_repos: 1,
        followers: 100,
        following: 5,
      });

    const client = await connectedClient(registerUsersTools, 'read-write');
    const result = await client.callTool({
      name: 'get_authenticated_user',
      arguments: {},
    });

    expect(result.isError).toBeFalsy();
    const text = (result.content as Array<{ type: string; text: string }>)[0]?.text ?? '';
    expect(JSON.parse(text)).toMatchObject({
      login: 'monalisa',
      id: 2,
      private_gists: 3,
    });
  });

  it('propagates a 401 from get_authenticated_user as an MCP tool error', async () => {
    nock('https://api.github.com')
      .get('/user')
      .reply(401, {
        message: 'Requires authentication',
        documentation_url: 'https://docs.github.com/rest',
      });

    const client = await connectedClient(registerUsersTools, 'read-write');
    const result = await client.callTool({
      name: 'get_authenticated_user',
      arguments: {},
    });

    expect(result.isError).toBe(true);
    const text = (result.content as Array<{ type: string; text: string }>)[0]?.text ?? '';
    expect(text).toContain('Requires authentication');
  });

  it('registers list_user_followers and returns the raw simple-user array as JSON', async () => {
    nock('https://api.github.com')
      .get('/users/octocat/followers')
      .query({ page: '1', per_page: '30' })
      .reply(200, [
        { login: 'follower1', id: 10, avatar_url: 'https://github.com/images/a.png', html_url: 'https://github.com/follower1' },
        { login: 'follower2', id: 11, avatar_url: 'https://github.com/images/b.png', html_url: 'https://github.com/follower2' },
      ]);

    const client = await connectedClient(registerUsersTools, 'read-write');
    const result = await client.callTool({
      name: 'list_user_followers',
      arguments: { username: 'octocat' },
    });

    expect(result.isError).toBeFalsy();
    const text = (result.content as Array<{ type: string; text: string }>)[0]?.text ?? '';
    const parsed = JSON.parse(text) as Array<{ login: string }>;
    expect(parsed).toHaveLength(2);
    expect(parsed[0]).toMatchObject({ login: 'follower1' });
  });

  it('forwards pagination parameters on list_user_followers to the wire', async () => {
    const scope = nock('https://api.github.com')
      .get('/users/octocat/followers')
      .query({ page: '2', per_page: '50' })
      .reply(200, []);

    const client = await connectedClient(registerUsersTools, 'read-write');
    const result = await client.callTool({
      name: 'list_user_followers',
      arguments: { username: 'octocat', page: 2, per_page: 50 },
    });

    expect(result.isError).toBeFalsy();
    expect(scope.isDone()).toBe(true);
  });

  it('registers list_user_following and returns the raw simple-user array as JSON', async () => {
    nock('https://api.github.com')
      .get('/users/octocat/following')
      .query({ page: '1', per_page: '30' })
      .reply(200, [
        { login: 'followee1', id: 20, avatar_url: 'https://github.com/images/c.png', html_url: 'https://github.com/followee1' },
      ]);

    const client = await connectedClient(registerUsersTools, 'read-write');
    const result = await client.callTool({
      name: 'list_user_following',
      arguments: { username: 'octocat' },
    });

    expect(result.isError).toBeFalsy();
    const text = (result.content as Array<{ type: string; text: string }>)[0]?.text ?? '';
    expect(JSON.parse(text)).toMatchObject([{ login: 'followee1' }]);
  });

  it('registers get_user_hovercard and returns the raw hovercard object as JSON', async () => {
    nock('https://api.github.com')
      .get('/users/octocat/hovercard')
      .query({ subject_type: 'repository', subject_id: '1296269' })
      .reply(200, {
        contexts: [
          { message: 'Owns this repository', octicon: 'repo' },
        ],
      });

    const client = await connectedClient(registerUsersTools, 'read-write');
    const result = await client.callTool({
      name: 'get_user_hovercard',
      arguments: {
        username: 'octocat',
        subject_type: 'repository',
        subject_id: '1296269',
      },
    });

    expect(result.isError).toBeFalsy();
    const text = (result.content as Array<{ type: string; text: string }>)[0]?.text ?? '';
    expect(JSON.parse(text)).toEqual({
      contexts: [{ message: 'Owns this repository', octicon: 'repo' }],
    });
  });

  it('registers get_user_hovercard without subject context (bare hovercard)', async () => {
    nock('https://api.github.com')
      .get('/users/octocat/hovercard')
      .query({})
      .reply(200, {
        contexts: [],
      });

    const client = await connectedClient(registerUsersTools, 'read-write');
    const result = await client.callTool({
      name: 'get_user_hovercard',
      arguments: { username: 'octocat' },
    });

    expect(result.isError).toBeFalsy();
    const text = (result.content as Array<{ type: string; text: string }>)[0]?.text ?? '';
    expect(JSON.parse(text)).toMatchObject({ contexts: [] });
  });

  it('registers exactly the 5 users tools in read-only mode (and the same set in read-write)', async () => {
    const expected = [
      'get_authenticated_user',
      'get_user_by_username',
      'get_user_hovercard',
      'list_user_followers',
      'list_user_following',
    ];

    const readOnlyClient = await connectedClient(registerUsersTools, 'read-only');
    const readOnlyTools = await readOnlyClient.listTools();
    expect(readOnlyTools.tools.map((t) => t.name).sort()).toEqual(expected);

    const readWriteClient = await connectedClient(registerUsersTools, 'read-write');
    const readWriteTools = await readWriteClient.listTools();
    expect(readWriteTools.tools.map((t) => t.name).sort()).toEqual(expected);
  });
});
```

- [x] **Step 2: Run tests to verify they fail**

Run: `npm test -- users`
Expected: FAIL with a module-not-found error for `../../../src/toolsets/users.js` (the file doesn't exist yet).

- [x] **Step 3: Create `src/toolsets/users.ts`**

```typescript
import type { McpServer } from '@modelcontextprotocol/server';
import type { Octokit } from 'octokit';
import { z } from 'zod';
import { paginationSchema, toToolResult, toToolError } from './common.js';

export function registerUsersTools(
  server: McpServer,
  octokit: Octokit,
  _permission: 'read-only' | 'read-write',
): void {
  server.registerTool(
    'get_user_by_username',
    {
      description:
        'Get publicly available information about a GitHub user by their login (username). Returns profile data including name, bio, location, public repo count, follower count, and following count. Returns a 404 if the user does not exist or is an Enterprise Managed User not visible to the caller.',
      inputSchema: z.object({
        username: z.string().describe('The GitHub username (login) of the user to look up.'),
      }),
    },
    async ({ username }) => {
      try {
        const response = await octokit.rest.users.getByUsername({ username });
        return toToolResult(response.data);
      } catch (error) {
        return toToolError(error);
      }
    },
  );

  server.registerTool(
    'get_authenticated_user',
    {
      description:
        'Get the profile of the currently authenticated user (the owner of the GITHUB_TOKEN in use). Returns the same public fields as get_user_by_username plus private fields (private_gists, total_private_repos, plan, etc.) that are visible only to the token owner, subject to token scope.',
      inputSchema: z.object({}),
    },
    async () => {
      try {
        const response = await octokit.rest.users.getAuthenticated();
        return toToolResult(response.data);
      } catch (error) {
        return toToolError(error);
      }
    },
  );

  server.registerTool(
    'list_user_followers',
    {
      description:
        'List the users who follow a given GitHub user. Returns an array of simple-user objects, each with login, id, avatar_url, and html_url. Paginate with page and per_page.',
      inputSchema: z.object({
        username: z.string().describe('The GitHub username (login) whose followers to list.'),
        ...paginationSchema,
      }),
    },
    async ({ username, page, per_page }) => {
      try {
        const response = await octokit.rest.users.listFollowersForUser({
          username,
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
    'list_user_following',
    {
      description:
        'List the users that a given GitHub user follows. Returns an array of simple-user objects, each with login, id, avatar_url, and html_url. Paginate with page and per_page.',
      inputSchema: z.object({
        username: z.string().describe('The GitHub username (login) whose following list to retrieve.'),
        ...paginationSchema,
      }),
    },
    async ({ username, page, per_page }) => {
      try {
        const response = await octokit.rest.users.listFollowingForUser({
          username,
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
    'get_user_hovercard',
    {
      description:
        'Get contextual information about a GitHub user (their "hovercard") as it would appear in the GitHub web UI. Returns a list of context messages (e.g. "Owns this repository", "Contributor"). Optionally scope the context to a specific subject (a repository, issue, pull request, or organization) by providing subject_type and subject_id together — both are required when either is supplied.',
      inputSchema: z.object({
        username: z.string().describe('The GitHub username (login) to get hovercard context for.'),
        subject_type: z
          .enum(['organization', 'repository', 'issue', 'pull_request'])
          .optional()
          .describe(
            'The entity type that provides the context. Must be paired with subject_id. One of: organization, repository, issue, pull_request.',
          ),
        subject_id: z
          .string()
          .optional()
          .describe(
            'The numeric ID (as a string) of the subject_type entity. Required when subject_type is set.',
          ),
      }),
    },
    async ({ username, subject_type, subject_id }) => {
      try {
        const response = await octokit.rest.users.getContextForUser({
          username,
          subject_type,
          subject_id,
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

Run: `npm test -- users`
Expected: PASS (9 tests in `users.test.ts`).

- [x] **Step 5: Run the full test suite to confirm no regression in other toolsets**

Run: `npm test`
Expected: PASS. Total test count is the previous suite total (74 tests as of the search toolset commit) plus the 9 new tests in `users.test.ts` = 83 tests. No pre-existing test file is modified; `common.ts` is unchanged so `common.test.ts` still passes verbatim.

- [x] **Step 6: Commit**

```bash
git add src/toolsets/users.ts test/unit/toolsets/users.test.ts
git commit -m "feat: add users toolset (5 read-only tools)"
```

---

## Task 2: Wire `registerUsersTools` into `server.ts`

**Files:**
- Modify: `src/server.ts`
- Modify: `README.md` (Toolsets section — same section the prior plans updated)

**Interfaces:**
- Consumes: `registerUsersTools(server, octokit, permission)` from Task 1.
- Produces: nothing new — this is the final integration point.

- [x] **Step 1: Modify `src/server.ts`**

Current content:

```typescript
import { McpServer } from '@modelcontextprotocol/server';
import type { Octokit } from 'octokit';
import { registerIssuesTools } from './toolsets/issues.js';
import { registerPullRequestsTools } from './toolsets/pull_requests.js';
import { registerReposTools } from './toolsets/repos.js';
import { registerSearchTools } from './toolsets/search.js';

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

  return server;
}
```

Replace with (imports sorted alphabetically to match existing convention):

```typescript
import { McpServer } from '@modelcontextprotocol/server';
import type { Octokit } from 'octokit';
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

  return server;
}
```

- [x] **Step 2: Run the full test suite**

Run: `npm test`
Expected: PASS, same 83 tests as after Task 1 (no test exercises `server.ts` directly, following the same precedent as the prior four toolset plans — `buildServer` is a thin, non-branching composition function verified by the manual smoke test below).

- [x] **Step 3: Typecheck, lint, build**

Run: `npm run typecheck && npm run lint && npm run build`
Expected: all PASS. The build step confirms `dist/cli.js`'s bundled dependency graph now transitively includes `users.ts`.

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

Expected: the `initialize` response contains `"serverInfo":{"name":"github-mcp-server-js"...}`. The `tools/list` response includes `get_user_by_username`, `get_authenticated_user`, `list_user_followers`, `list_user_following`, and `get_user_hovercard` — plus all previously-shipped tools from `repos`, `issues`, `pull_requests`, and `search` — proving all five toolsets are live in the same server with no duplicate-registration crash.

- [x] **Step 5: Update the README's Toolsets section**

Modify `README.md`'s "Currently implemented" list (the same section the `search` plan updated) to add:

```markdown
- `users` — user profile lookup, authenticated user info, followers, following, hovercard context
```

Slot it after the existing `search` bullet, keeping the toolsets listed in the order they were shipped.

- [x] **Step 6: Commit**

```bash
git add src/server.ts README.md
git commit -m "feat: wire users toolset into buildServer"
```

---

## Deliberate scope decisions

The following `octokit.rest.users.*` methods were introspected (via `octokit.rest.users[name].endpoint.DEFAULTS`) and are **intentionally excluded** from this toolset. Each exclusion is justified below.

1. **`users.list` (GET `/users`) — out of scope.** Lists all GitHub users globally (cursor-based `since` pagination, returns `simple-user[]`). This is a directory traversal endpoint with no useful per-LLM-session meaning; user discovery is already served by `search_users` in the `search` toolset. Exposing a raw paginated dump of all GitHub accounts provides no practical value and would produce confusingly large responses without meaningful filtering.

2. **`users.getById` (GET `/user/{account_id}`) — out of scope.** Looks up a user by their internal numeric `account_id`. In practice, callers rarely have a numeric account ID without already having the username; `get_user_by_username` covers the common lookup path. `getById` is primarily useful as an internal stability endpoint (usernames can change; IDs cannot) and is a niche advanced use case not warranted in a ~5-tool scope.

3. **`users.block` / `users.unblock` / `users.checkBlocked` / `users.listBlockedByAuthenticatedUser` — write operations / account-management, excluded.** `block` (PUT `/user/blocks/{username}`) and `unblock` (DELETE) are write/mutating operations and belong in the `activity` toolset per the design's notes (which group user-interaction writes under `activity`). `checkBlocked` (GET, 204/404 response — no body) and `listBlockedByAuthenticated` (GET `/user/blocks`) are read-only but represent private account-management state not relevant to the "user info" scope of this toolset.

4. **`users.follow` / `users.unfollow` / `users.checkPersonIsFollowedByAuthenticated` / `users.checkFollowingForUser` / `users.listFollowedByAuthenticatedUser` / `users.listFollowersForAuthenticatedUser` — write operations or auth-user-centric variants, excluded.** `follow` (PUT) and `unfollow` (DELETE) are writes that belong in `activity`. `checkPersonIsFollowedByAuthenticated` / `checkFollowingForUser` return 204/404 with no body — they are boolean checks that communicate result via HTTP status code, which does not map cleanly to the raw-JSON `toToolResult` pattern. `listFollowersForAuthenticatedUser` (GET `/user/followers`) and `listFollowedByAuthenticatedUser` (GET `/user/following`) are redundant with `list_user_followers` / `list_user_following` when the caller passes their own username; exposing duplicates would bloat the tools list.

5. **Email-related methods (`listEmailsForAuthenticatedUser`, `listPublicEmailsForAuthenticatedUser`, `addEmailForAuthenticatedUser`, `deleteEmailForAuthenticatedUser`, `setPrimaryEmailVisibilityForAuthenticatedUser`) — account-management, excluded.** All are either write operations or return private email data scoped to the authenticated user's own account. They are account-management tools (not user-info tools) and add no value in the read-only user-info scope. Write variants doubly excluded.

6. **GPG key and SSH key methods (`getGpgKeyForAuthenticatedUser`, `listGpgKeysForAuthenticatedUser`, `listGpgKeysForUser`, `createGpgKeyForAuthenticatedUser`, `deleteGpgKeyForAuthenticatedUser`, `getPublicSshKeyForAuthenticatedUser`, `listPublicSshKeysForAuthenticatedUser`, `listPublicKeysForUser`, `createPublicSshKeyForAuthenticatedUser`, `deletePublicSshKeyForAuthenticatedUser`, `getSshSigningKeyForAuthenticatedUser`, `listSshSigningKeysForAuthenticatedUser`, `listSshSigningKeysForUser`, `createSshSigningKeyForAuthenticatedUser`, `deleteSshSigningKeyForAuthenticatedUser`) — account-management / niche read-only, excluded.** Write variants are excluded as mutations. Read-only variants (e.g., `listPublicKeysForUser`, `listGpgKeysForUser`, `listSshSigningKeysForUser`) expose cryptographic key metadata — niche information useful for security auditing but well outside the "user info" scope described in the design. Any of these can be added in a follow-up plan without disturbing the existing 5 tools.

7. **Social account methods (`listSocialAccountsForUser`, `listSocialAccountsForAuthenticatedUser`, `addSocialAccountForAuthenticatedUser`, `deleteSocialAccountForAuthenticatedUser`) — niche / write, excluded.** Write variants excluded. `listSocialAccountsForUser` is read-only but returns a niche list of external social accounts (Twitter, LinkedIn, etc.) that is rarely useful compared to the richer profile data already included in `get_user_by_username`'s response body.

8. **Attestation methods (`listAttestations`, `listAttestationsBulk`, `deleteAttestationsBulk`, `deleteAttestationsById`, `deleteAttestationsBySubjectDigest`) — security-auditing domain, excluded.** Attestation lookup is a specialized build-provenance / supply-chain security use case; it belongs with other security tooling (the `code_security` toolset is the natural home) rather than generic user-info. Write variants doubly excluded.

9. **`users.updateAuthenticated` (PATCH `/user`) — write, excluded.** Modifies the authenticated user's profile fields. Write operation; excluded from this read-only toolset.

---

## Self-Review Notes

- **Spec coverage:** `users` toolset (Toolset Inventory row: octokit `users` namespace, example tools `get_user, get_authenticated_user, list_followers`, est. count ~5) — all 3 named examples have clear equivalents in the chosen tool set (`get_user_by_username`, `get_authenticated_user`, `list_user_followers`), the count exactly matches the ~5 estimate, and the two additional tools (`list_user_following`, `get_user_hovercard`) are the natural complements that round out the "user info and social graph" scope. Pagination (`page`/`per_page` defaults, max 100) — Task 1. Raw JSON response/error passthrough — Task 1. Registration-time permission gating — Task 1 (a no-op here because every tool is read-only; the read-only test still asserts the exact 5-name set is registered, so a future accidental permission-gated tool inside this file would fail the test).

- **Lessons applied from the prior four toolset plans:**
  - **`issues` I1 (strict permission-gating equality):** Task 1's read-only test uses `expect(tools.map((t) => t.name).sort()).toEqual([...exact 5 names...])`, not `arrayContaining`. It also runs the same assertion against a `read-write` client, which proves this toolset has no hidden write branch.
  - **`issues` I3 (wire-level filter passthrough):** Task 1's pagination tests use `nock(...).query({page: '2', per_page: '50'})` plus `expect(scope.isDone()).toBe(true)`, proving every optional parameter is actually forwarded on the wire, catching any parameter-name typo that would have the octokit method silently drop the value.
  - **`search` M (tool-name collision check):** performed explicitly before finalizing names — see Global Constraints. All 5 names (`get_user_by_username`, `get_authenticated_user`, `list_user_followers`, `list_user_following`, `get_user_hovercard`) were checked against the 35 existing names across `repos`, `issues`, `pull_requests`, and `search`, and are all distinct.
  - **`search` M (all-read-only parameter naming):** `_permission` renaming inside the function body is applied here for the same reason — signature uniformity vs. ESLint `no-unused-vars`.

- **Hovercard subject_type/subject_id coupling:** The OpenAPI spec states both `subject_type` and `subject_id` are required together — neither is meaningful alone (the endpoint returns a 422 if one is present without the other). The Zod schema marks both as optional to avoid making callers supply them for a generic hovercard call, but the description explicitly warns that they must be paired. A stricter Zod `.refine()` could enforce this at schema validation time; it is deliberately omitted here to match the thin-schema philosophy applied across all other toolsets in this codebase (inputs are validated to the minimum needed for a clear error, not re-implemented as a full contract layer — GitHub's own 422 response surfaces the constraint clearly enough when violated). This matches the `search` plan's handling of `sort`/`order` coupling.

- **`get_authenticated_user` takes an empty input schema:** The underlying `GET /user` endpoint takes no parameters. `z.object({})` is the correct Zod expression for this; `server.registerTool` accepts it without issue (matches the MCP SDK's expectation that `inputSchema` is a Zod object schema). The test exercises `callTool` with `arguments: {}` to confirm the empty schema round-trips cleanly through the MCP SDK's argument validation.

- **Type consistency:** `registerUsersTools(server: McpServer, octokit: Octokit, permission: 'read-only' | 'read-write'): void` (Task 1) matches `registerReposTools`/`registerIssuesTools`/`registerPullRequestsTools`/`registerSearchTools`'s signature exactly and is called identically in `server.ts` (Task 2).

- **No placeholders:** every step includes complete, runnable code. All octokit method names (`getByUsername`, `getAuthenticated`, `listFollowersForUser`, `listFollowingForUser`, `getContextForUser`), HTTP verbs, path templates, and query/path parameter shapes were verified directly against the installed `@octokit/plugin-rest-endpoint-methods` endpoint table (via `octokit.rest.users[name].endpoint.DEFAULTS`) and the `@octokit/openapi-types` operation definitions in `types.d.ts` — not memorized or guessed. Every intentionally excluded method from `octokit.rest.users.*` is called out explicitly in the Deliberate scope decisions section, not left as an implicit gap.

- **Task right-sizing note:** Task 1 bundles all 5 tools + their tests into a single reviewer gate, identical to the `search` plan's rationale. The tools are similarly near-identical shells over near-identical GitHub endpoints; splitting them into multiple tasks would produce copy-paste reviews with no meaningful decision between them. Task 2 remains a separate gate because wiring is where duplicate-registration crashes and stale-README rot surface — same pattern all four prior toolset plans use.
