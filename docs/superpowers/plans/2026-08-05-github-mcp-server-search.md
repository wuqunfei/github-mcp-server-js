# github-mcp-server-js — `search` Toolset Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the `search` toolset (5 read-only tools wrapping GitHub's REST search endpoints — repositories, code, issues/PRs, users, commits) to `github-mcp-server-js`, following the exact structural, permission-gating, and response/error pattern established by the `repos`, `issues`, and `pull_requests` toolsets.

**Architecture:** Same pattern as prior toolsets: one `registerSearchTools(server, octokit, permission)` function registers each tool with `server.registerTool(name, {description, inputSchema}, handler)`; every handler wraps its octokit call in try/catch, returning raw JSON via `toToolResult`/`toToolError`; `server.ts` gains one more registration call. All octokit calls use the `search` namespace (`octokit.rest.search.*`). Because every search endpoint is read-only, the `permission === 'read-write'` branch is unused in this toolset — the `permission` parameter is accepted (to keep the signature uniform across every `register*Tools` function) but never inspected.

**Tech Stack:** Same as prior plans — TypeScript, `@modelcontextprotocol/server@^2.0.0`, `octokit@^5.0.5`, `zod@^4.2.0`, `vitest`, `nock`. No new dependencies.

## Global Constraints

- Tool responses return the raw octokit response body as JSON, unmodified. No field trimming, no text summarization. Every search endpoint returns `{ total_count, incomplete_results, items: [...] }` — this exact envelope is preserved, callers pull `.items` themselves.
- Errors propagate unmodified: catch the octokit `RequestError`, surface `error.message` (which already includes the GitHub `message` field) in an MCP tool error result. No normalization layer, no special-casing of the `422 Unprocessable Entity` that GitHub returns for a malformed `q`.
- List tools take explicit `page` (default `1`) and `per_page` (default `30`, max `100`) parameters. No auto-pagination. This matches every other toolset's pagination model — GitHub's search API caps `per_page` at `100` and total results at `1000` (~10 pages of 100), but that ceiling is enforced by GitHub itself and is not something the tool re-validates.
- `GITHUB_PERMISSION=read-only` gating is a no-op for this toolset because every search tool is read-only; the read-only test in Task 1 still verifies the exact set of 5 tools is registered (see the "Lessons applied" note in Self-Review Notes below for why this test uses `.toEqual([...exact set...])` rather than `arrayContaining`).
- Every tool's `owner`/`repo` schema fragments are not applicable — search tools do not take a repository; scoping to a repo is expressed inside the `q` query string via `repo:owner/name` qualifiers, per GitHub's search grammar.
- Every tool shares the shared `paginationSchema` from `src/toolsets/common.ts` (already exists) and re-uses the same inline pattern for `q` / `sort` / `order`. `q`, `sort`, and `order` are intentionally NOT extracted into `common.ts`: they are used only inside this one file, and moving them out would couple a general-purpose helper module to search-specific enums.
- TypeScript only, no new runtime dependencies.
- Verified tool-name collision check against the 30 existing tool names on `main` (8 from `repos.ts`, 12 from `issues.ts`, 10 from `pull_requests.ts`): **zero collisions** with the 5 tool names chosen below (`search_repos`, `search_code`, `search_commits`, `search_issues`, `search_users`). `McpServer.registerTool` throws at registration time on duplicate names, so this was confirmed before finalizing names, not left to be caught by a failing test.

---

## File Structure

```
github-mcp-server-js/
  src/
    toolsets/
      search.ts               # NEW: registerSearchTools(server, octokit, permission)
    server.ts                  # MODIFIED: calls registerSearchTools
  test/
    unit/
      toolsets/
        search.test.ts          # NEW: mirrors issues.test.ts's structure
```

`common.ts` is NOT modified — no new shared schema fragment is warranted (see Global Constraints above). `README.md`'s Toolsets section is updated in Task 2 (Step 5), same as the `issues`/`pull_requests` plans did.

---

## Reference: verified octokit `search` namespace shapes

Confirmed directly against the installed `@octokit/plugin-rest-endpoint-methods` generated endpoint table (`octokit.rest.search[name].endpoint.DEFAULTS`) and the `@octokit/openapi-types` operation definitions at `node_modules/@octokit/openapi-types/types.d.ts` lines 116675–116963. All 5 endpoints are `GET`, take only query-string parameters (no path params, no request body), and return the same `{ total_count, incomplete_results, items }` envelope.

| Tool | octokit method | HTTP path | `q` | `sort` (enum) | `order` | pagination |
|---|---|---|---|---|---|---|
| `search_repos` | `search.repos` | GET `/search/repositories` | required | `stars` \| `forks` \| `help-wanted-issues` \| `updated` | `asc` \| `desc` | `page`, `per_page` |
| `search_code` | `search.code` | GET `/search/code` | required | — (see scope decision) | — (see scope decision) | `page`, `per_page` |
| `search_commits` | `search.commits` | GET `/search/commits` | required | `author-date` \| `committer-date` | `asc` \| `desc` | `page`, `per_page` |
| `search_issues` | `search.issuesAndPullRequests` | GET `/search/issues` | required | `comments` \| `reactions` \| `reactions-+1` \| `reactions--1` \| `reactions-smile` \| `reactions-thinking_face` \| `reactions-heart` \| `reactions-tada` \| `interactions` \| `created` \| `updated` | `asc` \| `desc` | `page`, `per_page` |
| `search_users` | `search.users` | GET `/search/users` | required | `followers` \| `repositories` \| `joined` | `asc` \| `desc` | `page`, `per_page` |

Response bodies (raw passthrough, all `200 OK`):
- All 5 → `{ total_count: number, incomplete_results: boolean, items: Item[] }` where `Item` is endpoint-specific (`repo-search-result-item`, `code-search-result-item`, `commit-search-result-item`, `issue-search-result-item`, `user-search-result-item`).
- Non-2xx (typically `422` for a malformed `q`, `403` for secondary rate limiting, `503` for a slow query) surface as `RequestError` and are handled by the same catch/`toToolError` path as every other tool.

**Deliberate scope decisions:**

1. **`search_code` omits `sort` and `order`.** The generated OpenAPI types mark both as `@deprecated` — GitHub's own field description reads *"This field is closing down."* `sort` accepts only a single value (`indexed`) and `order` is ignored unless `sort` is set. Exposing a one-valued enum plus a deprecated companion field adds tool-schema clutter for near-zero LLM value; the default relevance ranking is what callers want in practice. If GitHub re-instates sortable code search, adding these two fields back is a 4-line diff.

2. **`search_issues` omits the `advanced_search` opt-in.** The underlying `search/issues-and-pull-requests` endpoint accepts an `advanced_search` toggle for opting into the new search infrastructure. This plan omits that field — the default behavior is what a typical caller wants, and exposing a low-level backend switch to the LLM is scope creep beyond the design's ~5-tool estimate.

3. **`search_labels` and `search_topics` are out of scope.** The design row for the `search` toolset lists 5 example tools (`search_code`, `search_repos`, `search_issues`, `search_users`, `search_commits`) at an estimated count of ~5. `search_labels` (needs a `repository_id`, niche use case) and `search_topics` (small utility for topic discovery) are the two remaining `octokit.rest.search.*` methods; both are intentionally not included, matching the design's scope. Either can be added in a follow-up plan without disturbing the existing 5.

4. **`search_issues` covers BOTH issues and pull requests.** GitHub folds issues and PRs into a single searchable resource; the octokit method is named `issuesAndPullRequests` and hits `/search/issues`. The tool name follows the design (`search_issues`), and its description explicitly notes that callers should use `is:issue` or `is:pull-request` qualifiers inside `q` to scope. This is why there is no separate `search_pull_requests` tool.

---

## Task 1: Implement the `search` toolset (5 read-only tools) and its tests

**Files:**
- Create: `src/toolsets/search.ts`
- Test: `test/unit/toolsets/search.test.ts`

**Interfaces:**
- Consumes: `paginationSchema`, `toToolResult`, `toToolError` from `./common.js` (already exist — no modification needed).
- Produces (for Task 2 / `server.ts` to consume):
  - `registerSearchTools(server: McpServer, octokit: Octokit, permission: 'read-only' | 'read-write'): void` — same signature shape as `registerReposTools`/`registerIssuesTools`/`registerPullRequestsTools`. The `permission` parameter is accepted for signature uniformity but never inspected inside the function (all 5 tools are read-only).

This task is intentionally larger than most Task 1s because the 5 tools are near-identical shell around 5 near-identical GitHub endpoints — splitting them across multiple tasks would produce a series of near-copies with no meaningful review gate between them. The right review gate for this toolset is "are all 5 tools registered correctly and the tests exercising them green?", which is one gate, not five.

- [x] **Step 1: Write the failing tests**

Create `test/unit/toolsets/search.test.ts`:

```typescript
import nock from 'nock';
import { afterEach, describe, expect, it } from 'vitest';
import { registerSearchTools } from '../../../src/toolsets/search.js';
import { connectedClient } from './test-helpers.js';

describe('registerSearchTools', () => {
  afterEach(() => {
    nock.cleanAll();
  });

  it('registers search_repos and returns the raw GitHub response envelope as JSON', async () => {
    nock('https://api.github.com')
      .get('/search/repositories')
      .query({ q: 'tetris language:assembly', page: '1', per_page: '30' })
      .reply(200, {
        total_count: 1,
        incomplete_results: false,
        items: [{ id: 1, full_name: 'octocat/tetris' }],
      });

    const client = await connectedClient(registerSearchTools, 'read-write');
    const result = await client.callTool({
      name: 'search_repos',
      arguments: { q: 'tetris language:assembly' },
    });

    expect(result.isError).toBeFalsy();
    const text = (result.content as Array<{ type: string; text: string }>)[0]?.text ?? '';
    expect(JSON.parse(text)).toEqual({
      total_count: 1,
      incomplete_results: false,
      items: [{ id: 1, full_name: 'octocat/tetris' }],
    });
  });

  it('forwards sort, order, and pagination on search_repos to the wire', async () => {
    const scope = nock('https://api.github.com')
      .get('/search/repositories')
      .query({
        q: 'tetris',
        sort: 'stars',
        order: 'desc',
        page: '2',
        per_page: '50',
      })
      .reply(200, { total_count: 0, incomplete_results: false, items: [] });

    const client = await connectedClient(registerSearchTools, 'read-write');
    const result = await client.callTool({
      name: 'search_repos',
      arguments: {
        q: 'tetris',
        sort: 'stars',
        order: 'desc',
        page: 2,
        per_page: 50,
      },
    });

    expect(result.isError).toBeFalsy();
    expect(scope.isDone()).toBe(true);
  });

  it('propagates a 422 (malformed query) as an MCP tool error with the raw GitHub message', async () => {
    nock('https://api.github.com')
      .get('/search/repositories')
      .query({ q: '', page: '1', per_page: '30' })
      .reply(422, {
        message: 'Validation Failed',
        documentation_url: 'https://docs.github.com/rest/search/search',
      });

    const client = await connectedClient(registerSearchTools, 'read-write');
    const result = await client.callTool({
      name: 'search_repos',
      arguments: { q: '' },
    });

    expect(result.isError).toBe(true);
    const text = (result.content as Array<{ type: string; text: string }>)[0]?.text ?? '';
    expect(text).toContain('Validation Failed');
  });

  it('registers search_code and returns the raw GitHub response envelope as JSON', async () => {
    nock('https://api.github.com')
      .get('/search/code')
      .query({ q: 'addClass repo:jquery/jquery', page: '1', per_page: '30' })
      .reply(200, {
        total_count: 2,
        incomplete_results: false,
        items: [{ path: 'src/attributes/classes.js' }, { path: 'test/unit/attributes.js' }],
      });

    const client = await connectedClient(registerSearchTools, 'read-write');
    const result = await client.callTool({
      name: 'search_code',
      arguments: { q: 'addClass repo:jquery/jquery' },
    });

    expect(result.isError).toBeFalsy();
    const text = (result.content as Array<{ type: string; text: string }>)[0]?.text ?? '';
    expect(JSON.parse(text)).toMatchObject({
      total_count: 2,
      items: expect.arrayContaining([
        expect.objectContaining({ path: 'src/attributes/classes.js' }),
      ]) as unknown,
    });
  });

  it('registers search_commits and forwards its endpoint-specific sort values', async () => {
    const scope = nock('https://api.github.com')
      .get('/search/commits')
      .query({
        q: 'repo:octocat/Spoon-Knife css',
        sort: 'committer-date',
        order: 'asc',
        page: '1',
        per_page: '30',
      })
      .reply(200, { total_count: 1, incomplete_results: false, items: [{ sha: 'abc123' }] });

    const client = await connectedClient(registerSearchTools, 'read-write');
    const result = await client.callTool({
      name: 'search_commits',
      arguments: {
        q: 'repo:octocat/Spoon-Knife css',
        sort: 'committer-date',
        order: 'asc',
      },
    });

    expect(result.isError).toBeFalsy();
    expect(scope.isDone()).toBe(true);
  });

  it('registers search_issues and forwards its issue-specific sort value', async () => {
    const scope = nock('https://api.github.com')
      .get('/search/issues')
      .query({
        q: 'windows label:bug language:python state:open',
        sort: 'created',
        order: 'asc',
        page: '1',
        per_page: '30',
      })
      .reply(200, {
        total_count: 3,
        incomplete_results: false,
        items: [{ number: 42, title: 'a bug' }],
      });

    const client = await connectedClient(registerSearchTools, 'read-write');
    const result = await client.callTool({
      name: 'search_issues',
      arguments: {
        q: 'windows label:bug language:python state:open',
        sort: 'created',
        order: 'asc',
      },
    });

    expect(result.isError).toBeFalsy();
    expect(scope.isDone()).toBe(true);
  });

  it('registers search_users and returns the raw GitHub response envelope as JSON', async () => {
    nock('https://api.github.com')
      .get('/search/users')
      .query({ q: 'tom repos:>42 followers:>1000', page: '1', per_page: '30' })
      .reply(200, {
        total_count: 1,
        incomplete_results: false,
        items: [{ login: 'tomasz', id: 7 }],
      });

    const client = await connectedClient(registerSearchTools, 'read-write');
    const result = await client.callTool({
      name: 'search_users',
      arguments: { q: 'tom repos:>42 followers:>1000' },
    });

    expect(result.isError).toBeFalsy();
    const text = (result.content as Array<{ type: string; text: string }>)[0]?.text ?? '';
    expect(JSON.parse(text)).toMatchObject({ items: [{ login: 'tomasz' }] });
  });

  it('registers exactly the 5 search tools in read-only mode (and the same set in read-write)', async () => {
    const expected = [
      'search_code',
      'search_commits',
      'search_issues',
      'search_repos',
      'search_users',
    ];

    const readOnlyClient = await connectedClient(registerSearchTools, 'read-only');
    const readOnlyTools = await readOnlyClient.listTools();
    expect(readOnlyTools.tools.map((t) => t.name).sort()).toEqual(expected);

    const readWriteClient = await connectedClient(registerSearchTools, 'read-write');
    const readWriteTools = await readWriteClient.listTools();
    expect(readWriteTools.tools.map((t) => t.name).sort()).toEqual(expected);
  });
});
```

- [x] **Step 2: Run tests to verify they fail**

Run: `npm test -- search`
Expected: FAIL with a module-not-found error for `../../../src/toolsets/search.js` (the file doesn't exist yet).

- [x] **Step 3: Create `src/toolsets/search.ts`**

```typescript
import type { McpServer } from '@modelcontextprotocol/server';
import type { Octokit } from 'octokit';
import { z } from 'zod';
import { paginationSchema, toToolResult, toToolError } from './common.js';

const orderSchema = z
  .enum(['asc', 'desc'])
  .optional()
  .describe('Sort direction. Ignored unless sort is set.');

export function registerSearchTools(
  server: McpServer,
  octokit: Octokit,
  _permission: 'read-only' | 'read-write',
): void {
  server.registerTool(
    'search_repos',
    {
      description:
        'Search GitHub repositories via various criteria. The q parameter accepts GitHub search qualifiers (e.g. "tetris language:assembly stars:>100"). Returns up to 100 results per page; GitHub caps total results at 1000.',
      inputSchema: z.object({
        q: z.string().describe('Search query. Accepts GitHub search qualifiers like language:, stars:, forks:, user:, org:, topic:.'),
        sort: z
          .enum(['stars', 'forks', 'help-wanted-issues', 'updated'])
          .optional()
          .describe('Field to sort results by. Defaults to relevance if omitted.'),
        order: orderSchema,
        ...paginationSchema,
      }),
    },
    async ({ q, sort, order, page, per_page }) => {
      try {
        const response = await octokit.rest.search.repos({ q, sort, order, page, per_page });
        return toToolResult(response.data);
      } catch (error) {
        return toToolError(error);
      }
    },
  );

  server.registerTool(
    'search_code',
    {
      description:
        'Search code across GitHub. The q parameter accepts GitHub code-search qualifiers (e.g. "addClass repo:jquery/jquery in:file language:js"). Sort and order are omitted because GitHub is closing down sortable code search; results are ranked by relevance.',
      inputSchema: z.object({
        q: z.string().describe('Search query. Accepts qualifiers like repo:, path:, language:, in:file, in:path.'),
        ...paginationSchema,
      }),
    },
    async ({ q, page, per_page }) => {
      try {
        const response = await octokit.rest.search.code({ q, page, per_page });
        return toToolResult(response.data);
      } catch (error) {
        return toToolError(error);
      }
    },
  );

  server.registerTool(
    'search_commits',
    {
      description:
        'Search commits on the default branch of repositories. The q parameter accepts GitHub commit-search qualifiers (e.g. "repo:octocat/Spoon-Knife css author:octocat").',
      inputSchema: z.object({
        q: z.string().describe('Search query. Accepts qualifiers like repo:, author:, committer:, hash:, merge:, is:merge.'),
        sort: z
          .enum(['author-date', 'committer-date'])
          .optional()
          .describe('Field to sort results by. Defaults to relevance if omitted.'),
        order: orderSchema,
        ...paginationSchema,
      }),
    },
    async ({ q, sort, order, page, per_page }) => {
      try {
        const response = await octokit.rest.search.commits({ q, sort, order, page, per_page });
        return toToolResult(response.data);
      } catch (error) {
        return toToolError(error);
      }
    },
  );

  server.registerTool(
    'search_issues',
    {
      description:
        'Search GitHub issues AND pull requests. GitHub treats issues and pull requests as a single searchable resource; scope with is:issue or is:pull-request qualifiers inside q. Example q: "windows label:bug language:python state:open is:issue".',
      inputSchema: z.object({
        q: z.string().describe('Search query. Use is:issue or is:pull-request to scope; accepts qualifiers like label:, language:, state:, author:, assignee:.'),
        sort: z
          .enum([
            'comments',
            'reactions',
            'reactions-+1',
            'reactions--1',
            'reactions-smile',
            'reactions-thinking_face',
            'reactions-heart',
            'reactions-tada',
            'interactions',
            'created',
            'updated',
          ])
          .optional()
          .describe('Field to sort results by. Defaults to relevance if omitted.'),
        order: orderSchema,
        ...paginationSchema,
      }),
    },
    async ({ q, sort, order, page, per_page }) => {
      try {
        const response = await octokit.rest.search.issuesAndPullRequests({
          q,
          sort,
          order,
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
    'search_users',
    {
      description:
        'Search GitHub users. Only returns publicly visible users. The q parameter accepts GitHub user-search qualifiers (e.g. "tom repos:>42 followers:>1000").',
      inputSchema: z.object({
        q: z.string().describe('Search query. Accepts qualifiers like type:user, type:org, repos:, followers:, location:, language:.'),
        sort: z
          .enum(['followers', 'repositories', 'joined'])
          .optional()
          .describe('Field to sort results by. Defaults to relevance if omitted.'),
        order: orderSchema,
        ...paginationSchema,
      }),
    },
    async ({ q, sort, order, page, per_page }) => {
      try {
        const response = await octokit.rest.search.users({ q, sort, order, page, per_page });
        return toToolResult(response.data);
      } catch (error) {
        return toToolError(error);
      }
    },
  );
}
```

- [x] **Step 4: Run tests to verify they pass**

Run: `npm test -- search`
Expected: PASS (8 tests in `search.test.ts`).

- [x] **Step 5: Run the full test suite to confirm no regression in other toolsets**

Run: `npm test`
Expected: PASS. Total test count is the previous suite total (66 tests as of commit `bdeab8c`) plus the 8 new tests in `search.test.ts` = 74 tests. No pre-existing test file is modified; `common.ts` is unchanged so `common.test.ts` still passes verbatim.

- [x] **Step 6: Commit**

```bash
git add src/toolsets/search.ts test/unit/toolsets/search.test.ts
git commit -m "feat: add search toolset (5 read-only tools)"
```

---

## Task 2: Wire `registerSearchTools` into `server.ts`

**Files:**
- Modify: `src/server.ts`
- Modify: `README.md` (Toolsets section — same section the prior two plans updated)

**Interfaces:**
- Consumes: `registerSearchTools(server, octokit, permission)` from Task 1.
- Produces: nothing new — this is the final integration point.

- [x] **Step 1: Modify `src/server.ts`**

Current content:

```typescript
import { McpServer } from '@modelcontextprotocol/server';
import type { Octokit } from 'octokit';
import { registerIssuesTools } from './toolsets/issues.js';
import { registerPullRequestsTools } from './toolsets/pull_requests.js';
import { registerReposTools } from './toolsets/repos.js';

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

- [x] **Step 2: Run the full test suite**

Run: `npm test`
Expected: PASS, same 74 tests as after Task 1 (no test exercises `server.ts` directly, following the same precedent as the prior three toolset plans — `buildServer` is a thin, non-branching composition function verified by the manual smoke test below plus the pre-existing CLI smoke test from the core plan).

- [x] **Step 3: Typecheck, lint, build**

Run: `npm run typecheck && npm run lint && npm run build`
Expected: all PASS. The build step confirms `dist/cli.js`'s bundled dependency graph now transitively includes `search.ts`.

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

Expected: the `initialize` response contains `"serverInfo":{"name":"github-mcp-server-js"...}`. The `tools/list` response includes `search_repos`, `search_code`, `search_commits`, `search_issues`, and `search_users` — plus all previously-shipped tools from `repos`, `issues`, and `pull_requests` — proving all four toolsets are live in the same server with no duplicate-registration crash.

- [x] **Step 5: Update the README's Toolsets section**

Modify `README.md`'s "Currently implemented" list (the same section the `pull_requests` plan updated) to add:

```markdown
- `search` — code, repo, commit, issue/PR, and user search
```

Slot it after the existing `pull_requests` bullet, keeping the toolsets listed in the order they were shipped.

- [x] **Step 6: Commit**

```bash
git add src/server.ts README.md
git commit -m "feat: wire search toolset into buildServer"
```

---

## Self-Review Notes

- **Spec coverage:** `search` toolset (Toolset Inventory row: octokit `search` namespace, example tools `search_code, search_repos, search_issues, search_users, search_commits`, est. count ~5) — all 5 named examples are covered, matching the estimated count exactly. Pagination (`page`/`per_page` defaults, max 100) — Task 1. Raw JSON response/error passthrough — Task 1. Registration-time permission gating — Task 1 (a no-op here because every tool is read-only; the read-only test still asserts the exact 5-name set is registered, so a future accidental permission-gated tool inside this file would fail the test). `search_labels` and `search_topics` are explicitly out of scope (see Deliberate scope decisions in the Reference section above).
- **Lessons applied from the prior three toolset plans:**
  - **`issues` I1 (strict permission-gating equality):** Task 1's read-only test uses `expect(tools.map((t) => t.name).sort()).toEqual([...exact 5 names...])`, not `arrayContaining`. It also runs the same assertion against a `read-write` client, which is what proves this toolset has no hidden write branch.
  - **`issues` I3 (wire-level filter passthrough):** Task 1's `search_repos` filter test uses `nock(...).query({q, sort, order, page, per_page})` plus `expect(scope.isDone()).toBe(true)`, proving every optional filter param is actually forwarded on the wire. `search_commits` and `search_issues` filter tests do the same for their endpoint-specific `sort` enums, catching any typo in the `sort:` field name that would have the octokit method silently drop the value.
  - **`pull_requests` M8 (tool-name collision check):** performed explicitly before finalizing names — see Global Constraints. All 5 names (`search_repos`, `search_code`, `search_commits`, `search_issues`, `search_users`) were checked against the 30 existing names and are all distinct. The `search_` prefix on every tool is deliberate: it groups them together in the LLM's tools/list output and eliminates any collision surface with the more generic verbs (`get_repository`, `list_commits`, etc.) already in use.
- **Type consistency:** `registerSearchTools(server: McpServer, octokit: Octokit, permission: 'read-only' | 'read-write'): void` (Task 1) matches `registerReposTools`/`registerIssuesTools`/`registerPullRequestsTools`'s signature exactly and is called identically in `server.ts` (Task 2). The `permission` parameter is renamed `_permission` inside the function body to satisfy the `@typescript-eslint/no-unused-vars` rule from `eslint.config.js` (`argsIgnorePattern: '^_'`) — this is the standard escape hatch used across the codebase for interface-uniform parameters that a particular implementation doesn't need.
- **No placeholders:** every step includes complete, runnable code. All octokit method names, HTTP verbs, path templates, and query parameter shapes were verified directly against the installed `@octokit/plugin-rest-endpoint-methods` generated endpoint table (via `octokit.rest.search[name].endpoint.DEFAULTS`) and the `@octokit/openapi-types` operation definitions (`types.d.ts` lines 116675–116963) — not memorized or guessed. Every intentionally omitted field (`search_code`'s deprecated `sort`/`order`, `search_issues`'s `advanced_search`, and the excluded `search_labels`/`search_topics` tools) is called out explicitly in the Deliberate scope decisions section, not left as an implicit gap.
- **Task right-sizing note:** Task 1 bundles all 5 tools + their tests into a single reviewer gate. The tools are near-identical shells over near-identical GitHub endpoints; splitting them into 5 tasks (or even a "one read tool" + "four more" pair) would produce a series of copy-paste reviews with no meaningful decision between them. Task 2 remains a separate gate because wiring is where duplicate-registration crashes and stale-README rot surface — same pattern the prior three toolset plans use.
