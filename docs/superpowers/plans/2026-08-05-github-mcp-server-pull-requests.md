# github-mcp-server-js — `pull_requests` Toolset Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Add the `pull_requests` toolset (10 tools covering PR listing/inspection, creation/update, merging, reviews, and reviewer requests) to `github-mcp-server-js`, following the exact structural, permission-gating, and response/error pattern established by the `repos` and `issues` toolsets.

**Architecture:** Same pattern as `issues`: one `registerPullRequestsTools(server, octokit, permission)` function registers each tool with `server.registerTool(name, {description, inputSchema}, handler)`; every handler wraps its octokit call in try/catch, returning raw JSON via `toToolResult`/`toToolError`; write tools are registered only when `permission === 'read-write'`; `server.ts` gains one more registration call. All octokit calls use the `pulls` namespace (`octokit.rest.pulls.*`).

**Tech Stack:** Same as prior plans — TypeScript, `@modelcontextprotocol/server@^2.0.0`, `octokit@^5.0.5`, `zod@^4.2.0`, `vitest`, `nock`. No new dependencies.

## Global Constraints

- Tool responses return the raw octokit response body as JSON, unmodified. No field trimming, no text summarization.
- Errors propagate unmodified: catch the octokit `RequestError`, surface `error.message` (which already includes the GitHub `message` field) in an MCP tool error result. No normalization layer.
- List tools take explicit `page` (default `1`) and `per_page` (default `30`, max `100`) parameters. No auto-pagination.
- `GITHUB_PERMISSION=read-only` must prevent write-tool handlers from ever being registered with `McpServer` — not just block them at call time.
- Every tool's `owner`/`repo`/`pull_number` parameters use the shared schema fragments from `src/toolsets/common.ts` (`ownerRepoSchema`, `paginationSchema`, and a new `pullNumberSchema` added in Task 1) — do not restate different wording per tool.
- TypeScript only, no new runtime dependencies.
- Verified tool-name collision check against the 20 existing tool names on `main` (8 from `repos.ts`, 12 from `issues.ts`): **zero collisions** with the 10 tool names chosen below. `McpServer.registerTool` throws at registration time on duplicate names, so this was confirmed before finalizing names, not left to be caught by a failing test.

---

## File Structure

```
github-mcp-server-js/
  src/
    toolsets/
      common.ts             # MODIFIED: add pullNumberSchema
      pull_requests.ts       # NEW: registerPullRequestsTools(server, octokit, permission)
    server.ts                # MODIFIED: calls registerPullRequestsTools
  test/
    unit/
      toolsets/
        common.test.ts        # unchanged (still passes)
        pull_requests.test.ts # NEW: mirrors issues.test.ts's structure
```

---

## Reference: verified octokit `pulls` namespace shapes

Confirmed directly against the installed `@octokit/plugin-rest-endpoint-methods` generated endpoint table and `@octokit/openapi-types` operation definitions (not memorized):

| Tool | octokit method | HTTP | Path params | Query/body params (all optional unless noted) |
|---|---|---|---|---|
| `list_pull_requests` | `pulls.list` | GET | owner, repo | `state` (open\|closed\|all), `head`, `base`, `sort` (created\|updated\|popularity\|long-running), `direction` (asc\|desc), `page`, `per_page` |
| `get_pull_request` | `pulls.get` | GET | owner, repo, pull_number | — |
| `list_pull_request_files` | `pulls.listFiles` | GET | owner, repo, pull_number | `page`, `per_page` |
| `list_pull_request_commits` | `pulls.listCommits` | GET | owner, repo, pull_number | `page`, `per_page` |
| `list_pull_request_reviews` | `pulls.listReviews` | GET | owner, repo, pull_number | `page`, `per_page` |
| `create_pull_request` | `pulls.create` | POST | owner, repo | body: `head` (required), `base` (required), `title`, `body`, `draft`, `maintainer_can_modify`, `issue` (number) |
| `update_pull_request` | `pulls.update` | PATCH | owner, repo, pull_number | body: `title`, `body`, `state` (open\|closed), `base`, `maintainer_can_modify` |
| `merge_pull_request` | `pulls.merge` | PUT | owner, repo, pull_number | body: `commit_title`, `commit_message`, `sha`, `merge_method` (merge\|squash\|rebase) |
| `create_pull_request_review` | `pulls.createReview` | POST | owner, repo, pull_number | body: `commit_id`, `body`, `event` (APPROVE\|REQUEST_CHANGES\|COMMENT) |
| `request_reviewers` | `pulls.requestReviewers` | POST | owner, repo, pull_number | body: `reviewers` (string[]), `team_reviewers` (string[]) |

Response bodies (raw passthrough, no exceptions needed — unlike `issues.lock`/`unlock`, none of these endpoints return `204 No Content`):
- `list_pull_requests` → `pull-request-simple[]`
- `get_pull_request` → `pull-request` (404 on missing PR, confirmed in `pulls/get` operation's `responses`)
- `list_pull_request_files` → `diff-entry[]`
- `list_pull_request_commits` → `commit[]`
- `list_pull_request_reviews` / `create_pull_request_review` → `pull-request-review[]` / `pull-request-review`
- `create_pull_request` / `update_pull_request` → `pull-request`
- `merge_pull_request` → `pull-request-merge-result` (`{ sha, merged, message }`); non-2xx merge failures (403/404/405/409/422) are thrown by octokit as `RequestError` and handled by the same catch/`toToolError` path as every other tool — no special-casing needed
- `request_reviewers` → `pull-request-simple`

**Deliberate scope decision:** `create_pull_request_review`'s underlying `pulls.createReview` endpoint also accepts an optional `comments` array for inline per-line review comments (path/position/body/line/side fields). This plan omits that field — the tool supports top-level review submission (`event` + `body`) only, matching the design spec's `create_review` entry and keeping the toolset at its estimated ~10-tool scope. Line-level review comments can be added as a follow-up tool in a later plan if needed; this is not a placeholder, it is a scoped-out feature.

---

## Task 1: Add `pullNumberSchema` to `common.ts` and implement the `pull_requests` read tools

**Files:**
- Modify: `src/toolsets/common.ts`
- Create: `src/toolsets/pull_requests.ts`
- Test: `test/unit/toolsets/common.test.ts` (add coverage is not needed — `pullNumberSchema` is a plain Zod field like `issueNumberSchema`, exercised indirectly through the tool tests, consistent with how `issueNumberSchema` was never unit-tested standalone)
- Test: `test/unit/toolsets/pull_requests.test.ts`

**Interfaces:**
- Consumes: `ownerRepoSchema`, `paginationSchema`, `toToolResult`, `toToolError` from `./common.js` (already exist).
- Produces (for Task 2 to extend in the same file/function, and Task 3/`server.ts` to consume):
  - `pullNumberSchema: { pull_number: ZodNumber }` in `common.ts`, same shape/pattern as `issueNumberSchema`.
  - `registerPullRequestsTools(server: McpServer, octokit: Octokit, permission: 'read-only' | 'read-write'): void` — same signature shape as `registerIssuesTools`.

This task implements the 5 read-only tools. Task 2 adds the 5 write tools to the same file and function.

- [x] **Step 1: Add `pullNumberSchema` to `src/toolsets/common.ts`**

Add this export alongside the existing `issueNumberSchema`:

```typescript
export const pullNumberSchema = {
  pull_number: z.number().int().describe('Pull request number'),
};
```

The full file becomes:

```typescript
import { z } from 'zod';

export const paginationSchema = {
  page: z.number().int().min(1).default(1),
  per_page: z.number().int().min(1).max(100).default(30),
};

export const ownerRepoSchema = {
  owner: z.string().describe('Repository owner (user or organization login)'),
  repo: z.string().describe('Repository name'),
};

export const issueNumberSchema = {
  issue_number: z.number().int().describe('Issue number'),
};

export const pullNumberSchema = {
  pull_number: z.number().int().describe('Pull request number'),
};

export function toToolResult(data: unknown) {
  return {
    content: [{ type: 'text' as const, text: JSON.stringify(data) }],
  };
}

export function toToolError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return {
    isError: true,
    content: [{ type: 'text' as const, text: message }],
  };
}
```

- [x] **Step 2: Write the failing tests for the read tools**

Create `test/unit/toolsets/pull_requests.test.ts`:

```typescript
import { McpServer } from '@modelcontextprotocol/server';
import { Client } from '@modelcontextprotocol/client';
import { InMemoryTransport } from '@modelcontextprotocol/server';
import { Octokit } from 'octokit';
import nock from 'nock';
import { afterEach, describe, expect, it } from 'vitest';
import { registerPullRequestsTools } from '../../../src/toolsets/pull_requests.js';

async function connectedClient(permission: 'read-only' | 'read-write') {
  const octokit = new Octokit({ auth: 'test-token', baseUrl: 'https://api.github.com' });
  const server = new McpServer({ name: 'test-server', version: '0.0.0' });
  registerPullRequestsTools(server, octokit, permission);

  const client = new Client({ name: 'test-client', version: '0.0.0' });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await Promise.all([client.connect(clientTransport), server.connect(serverTransport)]);
  return client;
}

describe('registerPullRequestsTools', () => {
  afterEach(() => {
    nock.cleanAll();
  });

  it('registers list_pull_requests and returns the raw GitHub response as JSON', async () => {
    nock('https://api.github.com')
      .get('/repos/octocat/hello-world/pulls')
      .query({ page: '1', per_page: '30' })
      .reply(200, [{ number: 1, title: 'first pr' }]);

    const client = await connectedClient('read-write');
    const result = await client.callTool({
      name: 'list_pull_requests',
      arguments: { owner: 'octocat', repo: 'hello-world' },
    });

    expect(result.isError).toBeFalsy();
    const text = (result.content as Array<{ type: string; text: string }>)[0]?.text ?? '';
    expect(JSON.parse(text)).toEqual([{ number: 1, title: 'first pr' }]);
  });

  it('passes explicit page and per_page through to list_pull_requests', async () => {
    nock('https://api.github.com')
      .get('/repos/octocat/hello-world/pulls')
      .query({ page: '2', per_page: '10' })
      .reply(200, [{ number: 8, title: 'second page pr' }]);

    const client = await connectedClient('read-write');
    const result = await client.callTool({
      name: 'list_pull_requests',
      arguments: { owner: 'octocat', repo: 'hello-world', page: 2, per_page: 10 },
    });

    expect(result.isError).toBeFalsy();
    const text = (result.content as Array<{ type: string; text: string }>)[0]?.text ?? '';
    expect(JSON.parse(text)).toEqual([{ number: 8, title: 'second page pr' }]);
  });

  it('passes pull request filter params through to list_pull_requests', async () => {
    const scope = nock('https://api.github.com')
      .get('/repos/octocat/hello-world/pulls')
      .query({
        state: 'closed',
        head: 'octocat:feature-branch',
        base: 'main',
        sort: 'updated',
        direction: 'desc',
        page: '1',
        per_page: '30',
      })
      .reply(200, [{ number: 9, title: 'filtered pr' }]);

    const client = await connectedClient('read-write');
    const result = await client.callTool({
      name: 'list_pull_requests',
      arguments: {
        owner: 'octocat',
        repo: 'hello-world',
        state: 'closed',
        head: 'octocat:feature-branch',
        base: 'main',
        sort: 'updated',
        direction: 'desc',
      },
    });

    expect(result.isError).toBeFalsy();
    expect(scope.isDone()).toBe(true);
  });

  it('registers get_pull_request and returns the raw GitHub response as JSON', async () => {
    nock('https://api.github.com')
      .get('/repos/octocat/hello-world/pulls/1')
      .reply(200, { number: 1, title: 'first pr', state: 'open' });

    const client = await connectedClient('read-write');
    const result = await client.callTool({
      name: 'get_pull_request',
      arguments: { owner: 'octocat', repo: 'hello-world', pull_number: 1 },
    });

    expect(result.isError).toBeFalsy();
    const text = (result.content as Array<{ type: string; text: string }>)[0]?.text ?? '';
    expect(JSON.parse(text)).toMatchObject({ number: 1, state: 'open' });
  });

  it('propagates a 404 as an MCP tool error with the raw GitHub message', async () => {
    nock('https://api.github.com')
      .get('/repos/octocat/hello-world/pulls/999')
      .reply(404, { message: 'Not Found', documentation_url: 'https://docs.github.com/rest' });

    const client = await connectedClient('read-write');
    const result = await client.callTool({
      name: 'get_pull_request',
      arguments: { owner: 'octocat', repo: 'hello-world', pull_number: 999 },
    });

    expect(result.isError).toBe(true);
    const text = (result.content as Array<{ type: string; text: string }>)[0]?.text ?? '';
    expect(text).toContain('Not Found');
  });

  it('registers list_pull_request_files and returns the raw GitHub response as JSON', async () => {
    nock('https://api.github.com')
      .get('/repos/octocat/hello-world/pulls/1/files')
      .query({ page: '1', per_page: '30' })
      .reply(200, [{ filename: 'src/index.ts', status: 'modified' }]);

    const client = await connectedClient('read-write');
    const result = await client.callTool({
      name: 'list_pull_request_files',
      arguments: { owner: 'octocat', repo: 'hello-world', pull_number: 1 },
    });

    expect(result.isError).toBeFalsy();
    const text = (result.content as Array<{ type: string; text: string }>)[0]?.text ?? '';
    expect(JSON.parse(text)).toEqual([{ filename: 'src/index.ts', status: 'modified' }]);
  });

  it('registers list_pull_request_commits and returns the raw GitHub response as JSON', async () => {
    nock('https://api.github.com')
      .get('/repos/octocat/hello-world/pulls/1/commits')
      .query({ page: '1', per_page: '30' })
      .reply(200, [{ sha: 'abc123', commit: { message: 'a commit' } }]);

    const client = await connectedClient('read-write');
    const result = await client.callTool({
      name: 'list_pull_request_commits',
      arguments: { owner: 'octocat', repo: 'hello-world', pull_number: 1 },
    });

    expect(result.isError).toBeFalsy();
    const text = (result.content as Array<{ type: string; text: string }>)[0]?.text ?? '';
    expect(JSON.parse(text)).toEqual([{ sha: 'abc123', commit: { message: 'a commit' } }]);
  });

  it('registers list_pull_request_reviews and returns the raw GitHub response as JSON', async () => {
    nock('https://api.github.com')
      .get('/repos/octocat/hello-world/pulls/1/reviews')
      .query({ page: '1', per_page: '30' })
      .reply(200, [{ id: 55, state: 'APPROVED' }]);

    const client = await connectedClient('read-write');
    const result = await client.callTool({
      name: 'list_pull_request_reviews',
      arguments: { owner: 'octocat', repo: 'hello-world', pull_number: 1 },
    });

    expect(result.isError).toBeFalsy();
    const text = (result.content as Array<{ type: string; text: string }>)[0]?.text ?? '';
    expect(JSON.parse(text)).toEqual([{ id: 55, state: 'APPROVED' }]);
  });
});
```

- [x] **Step 3: Run test to verify it fails**

Run: `npm test -- pull_requests`
Expected: FAIL with a module-not-found error for `../../../src/toolsets/pull_requests.js` (the file doesn't exist yet).

- [x] **Step 4: Create `src/toolsets/pull_requests.ts` with the 5 read tools**

```typescript
import type { McpServer } from '@modelcontextprotocol/server';
import type { Octokit } from 'octokit';
import { z } from 'zod';
import { ownerRepoSchema, paginationSchema, pullNumberSchema, toToolResult, toToolError } from './common.js';

export function registerPullRequestsTools(
  server: McpServer,
  octokit: Octokit,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  permission: 'read-only' | 'read-write',
): void {
  server.registerTool(
    'list_pull_requests',
    {
      description: 'List pull requests in a GitHub repository.',
      inputSchema: z.object({
        ...ownerRepoSchema,
        state: z.enum(['open', 'closed', 'all']).optional().describe('Filter by pull request state (defaults to open)'),
        head: z.string().optional().describe('Filter by head user/org and branch, e.g. "octocat:feature-branch"'),
        base: z.string().optional().describe('Filter by base branch name'),
        sort: z
          .enum(['created', 'updated', 'popularity', 'long-running'])
          .optional()
          .describe('Field to sort results by'),
        direction: z.enum(['asc', 'desc']).optional().describe('Sort direction'),
        ...paginationSchema,
      }),
    },
    async ({ owner, repo, state, head, base, sort, direction, page, per_page }) => {
      try {
        const response = await octokit.rest.pulls.list({
          owner,
          repo,
          state,
          head,
          base,
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
    'get_pull_request',
    {
      description: 'Get a single pull request in a GitHub repository.',
      inputSchema: z.object({
        ...ownerRepoSchema,
        ...pullNumberSchema,
      }),
    },
    async ({ owner, repo, pull_number }) => {
      try {
        const response = await octokit.rest.pulls.get({ owner, repo, pull_number });
        return toToolResult(response.data);
      } catch (error) {
        return toToolError(error);
      }
    },
  );

  server.registerTool(
    'list_pull_request_files',
    {
      description: 'List the files changed in a GitHub pull request.',
      inputSchema: z.object({
        ...ownerRepoSchema,
        ...pullNumberSchema,
        ...paginationSchema,
      }),
    },
    async ({ owner, repo, pull_number, page, per_page }) => {
      try {
        const response = await octokit.rest.pulls.listFiles({ owner, repo, pull_number, page, per_page });
        return toToolResult(response.data);
      } catch (error) {
        return toToolError(error);
      }
    },
  );

  server.registerTool(
    'list_pull_request_commits',
    {
      description: 'List the commits on a GitHub pull request.',
      inputSchema: z.object({
        ...ownerRepoSchema,
        ...pullNumberSchema,
        ...paginationSchema,
      }),
    },
    async ({ owner, repo, pull_number, page, per_page }) => {
      try {
        const response = await octokit.rest.pulls.listCommits({ owner, repo, pull_number, page, per_page });
        return toToolResult(response.data);
      } catch (error) {
        return toToolError(error);
      }
    },
  );

  server.registerTool(
    'list_pull_request_reviews',
    {
      description: 'List the reviews on a GitHub pull request.',
      inputSchema: z.object({
        ...ownerRepoSchema,
        ...pullNumberSchema,
        ...paginationSchema,
      }),
    },
    async ({ owner, repo, pull_number, page, per_page }) => {
      try {
        const response = await octokit.rest.pulls.listReviews({ owner, repo, pull_number, page, per_page });
        return toToolResult(response.data);
      } catch (error) {
        return toToolError(error);
      }
    },
  );

}
```

Note on the `eslint-disable-next-line` comment above the `permission` parameter: at this point in the plan `permission` is not yet referenced (no write tools exist yet in this file), which would otherwise fail ESLint's `no-unused-vars` rule. Task 2 makes `permission` genuinely used by wrapping the 5 write tools in `if (permission === 'read-write') { ... }` — at that point, remove this disable comment entirely (mirroring exactly what happened with `issues.ts`'s `permission` parameter in the `issues` toolset plan's Task 2→Task 3 transition, confirmed by re-reading the committed `src/toolsets/issues.ts`, which carries no such comment).

- [x] **Step 5: Run test to verify it passes**

Run: `npm test -- pull_requests`
Expected: PASS (8 tests).

- [x] **Step 6: Typecheck and lint**

Run: `npm run typecheck && npm run lint`
Expected: both PASS with zero errors.

- [x] **Step 7: Commit**

```bash
git add src/toolsets/common.ts src/toolsets/pull_requests.ts test/unit/toolsets/pull_requests.test.ts
git commit -m "feat: add pull_requests toolset read tools"
```

---

## Task 2: Implement the `pull_requests` toolset — write tools (create, update, merge, review, request reviewers)

**Files:**
- Modify: `src/toolsets/pull_requests.ts`
- Modify: `test/unit/toolsets/pull_requests.test.ts`

**Interfaces:**
- Consumes: `ownerRepoSchema`, `paginationSchema`, `pullNumberSchema`, `toToolResult`, `toToolError` from `./common.js` (Task 1); the same `registerPullRequestsTools` function body from Task 1, extended in place.
- Produces: the complete `registerPullRequestsTools` (10 tools total), ready for Task 3 to wire into `server.ts`.

- [x] **Step 1: Write the failing tests for the write tools and the permission-gating test**

Add these tests inside the existing `describe('registerPullRequestsTools', ...)` block in `test/unit/toolsets/pull_requests.test.ts`, after the `list_pull_request_reviews` test and before the closing `});`:

```typescript
  it('registers create_pull_request and returns the raw GitHub response as JSON', async () => {
    nock('https://api.github.com')
      .post('/repos/octocat/hello-world/pulls', { head: 'octocat:feature-branch', base: 'main', title: 'a new pr' })
      .reply(201, { number: 42, title: 'a new pr' });

    const client = await connectedClient('read-write');
    const result = await client.callTool({
      name: 'create_pull_request',
      arguments: { owner: 'octocat', repo: 'hello-world', head: 'octocat:feature-branch', base: 'main', title: 'a new pr' },
    });

    expect(result.isError).toBeFalsy();
    const text = (result.content as Array<{ type: string; text: string }>)[0]?.text ?? '';
    expect(JSON.parse(text)).toEqual({ number: 42, title: 'a new pr' });
  });

  it('registers update_pull_request and returns the raw GitHub response as JSON', async () => {
    nock('https://api.github.com')
      .patch('/repos/octocat/hello-world/pulls/1', { state: 'closed' })
      .reply(200, { number: 1, state: 'closed' });

    const client = await connectedClient('read-write');
    const result = await client.callTool({
      name: 'update_pull_request',
      arguments: { owner: 'octocat', repo: 'hello-world', pull_number: 1, state: 'closed' },
    });

    expect(result.isError).toBeFalsy();
    const text = (result.content as Array<{ type: string; text: string }>)[0]?.text ?? '';
    expect(JSON.parse(text)).toEqual({ number: 1, state: 'closed' });
  });

  it('registers merge_pull_request and returns the raw GitHub response as JSON', async () => {
    nock('https://api.github.com')
      .put('/repos/octocat/hello-world/pulls/1/merge', { merge_method: 'squash' })
      .reply(200, { sha: 'abc123', merged: true, message: 'Pull Request successfully merged' });

    const client = await connectedClient('read-write');
    const result = await client.callTool({
      name: 'merge_pull_request',
      arguments: { owner: 'octocat', repo: 'hello-world', pull_number: 1, merge_method: 'squash' },
    });

    expect(result.isError).toBeFalsy();
    const text = (result.content as Array<{ type: string; text: string }>)[0]?.text ?? '';
    expect(JSON.parse(text)).toEqual({ sha: 'abc123', merged: true, message: 'Pull Request successfully merged' });
  });

  it('propagates a merge conflict (409) as an MCP tool error with the raw GitHub message', async () => {
    nock('https://api.github.com')
      .put('/repos/octocat/hello-world/pulls/1/merge')
      .reply(409, { message: 'Head branch was modified. Review and try the merge again.' });

    const client = await connectedClient('read-write');
    const result = await client.callTool({
      name: 'merge_pull_request',
      arguments: { owner: 'octocat', repo: 'hello-world', pull_number: 1 },
    });

    expect(result.isError).toBe(true);
    const text = (result.content as Array<{ type: string; text: string }>)[0]?.text ?? '';
    expect(text).toContain('Head branch was modified');
  });

  it('registers create_pull_request_review and returns the raw GitHub response as JSON', async () => {
    nock('https://api.github.com')
      .post('/repos/octocat/hello-world/pulls/1/reviews', { event: 'APPROVE', body: 'Looks good' })
      .reply(200, { id: 77, state: 'APPROVED' });

    const client = await connectedClient('read-write');
    const result = await client.callTool({
      name: 'create_pull_request_review',
      arguments: { owner: 'octocat', repo: 'hello-world', pull_number: 1, event: 'APPROVE', body: 'Looks good' },
    });

    expect(result.isError).toBeFalsy();
    const text = (result.content as Array<{ type: string; text: string }>)[0]?.text ?? '';
    expect(JSON.parse(text)).toEqual({ id: 77, state: 'APPROVED' });
  });

  it('registers request_reviewers and returns the raw GitHub response as JSON', async () => {
    nock('https://api.github.com')
      .post('/repos/octocat/hello-world/pulls/1/requested_reviewers', { reviewers: ['octocat'] })
      .reply(201, { number: 1, requested_reviewers: [{ login: 'octocat' }] });

    const client = await connectedClient('read-write');
    const result = await client.callTool({
      name: 'request_reviewers',
      arguments: { owner: 'octocat', repo: 'hello-world', pull_number: 1, reviewers: ['octocat'] },
    });

    expect(result.isError).toBeFalsy();
    const text = (result.content as Array<{ type: string; text: string }>)[0]?.text ?? '';
    expect(JSON.parse(text)).toEqual({ number: 1, requested_reviewers: [{ login: 'octocat' }] });
  });

  it('registers exactly the 5 read tools and no write tools in read-only mode', async () => {
    const client = await connectedClient('read-only');
    const { tools } = await client.listTools();
    expect(tools.map((t) => t.name).sort()).toEqual([
      'get_pull_request',
      'list_pull_request_commits',
      'list_pull_request_files',
      'list_pull_request_reviews',
      'list_pull_requests',
    ]);
  });
```

- [x] **Step 2: Run test to verify it fails**

Run: `npm test -- pull_requests`
Expected: FAIL — the write-tool tests fail because `create_pull_request` etc. aren't registered yet, and the permission-gating test fails because Task 1's placeholder registers only the 5 read tools with no gating logic at all (so it currently passes trivially; re-verify it still asserts the correct 5-tool list after this task's changes, since a passing-for-the-wrong-reason test is not a green light).

- [x] **Step 3: Remove the `eslint-disable` comment and add the 5 write tools to `src/toolsets/pull_requests.ts`**

Remove the `// eslint-disable-next-line @typescript-eslint/no-unused-vars` line directly above the `permission` parameter in the function signature — `permission` becomes genuinely used by the `if` block added below, so the disable comment is no longer needed:

```typescript
export function registerPullRequestsTools(
  server: McpServer,
  octokit: Octokit,
  permission: 'read-only' | 'read-write',
): void {
```

Then, immediately before the function's closing `}`, insert the 5 write tools:

```typescript
  if (permission === 'read-write') {
    server.registerTool(
      'create_pull_request',
      {
        description: 'Create a new pull request in a GitHub repository.',
        inputSchema: z.object({
          ...ownerRepoSchema,
          title: z.string().optional().describe('Pull request title (required unless issue is specified)'),
          head: z.string().describe('Branch containing the changes, e.g. "octocat:feature-branch"'),
          base: z.string().describe('Branch you want the changes pulled into'),
          body: z.string().optional().describe('Pull request body/description'),
          draft: z.boolean().optional().describe('Whether to create the pull request as a draft'),
          maintainer_can_modify: z.boolean().optional().describe('Whether maintainers can modify the pull request'),
          issue: z.number().int().optional().describe('Issue number to convert into a pull request'),
        }),
      },
      async ({ owner, repo, title, head, base, body, draft, maintainer_can_modify, issue }) => {
        try {
          const response = await octokit.rest.pulls.create({
            owner,
            repo,
            title,
            head,
            base,
            body,
            draft,
            maintainer_can_modify,
            issue,
          });
          return toToolResult(response.data);
        } catch (error) {
          return toToolError(error);
        }
      },
    );

    server.registerTool(
      'update_pull_request',
      {
        description: 'Update an existing pull request in a GitHub repository.',
        inputSchema: z.object({
          ...ownerRepoSchema,
          ...pullNumberSchema,
          title: z.string().optional().describe('New pull request title'),
          body: z.string().optional().describe('New pull request body/description'),
          state: z.enum(['open', 'closed']).optional().describe('New pull request state'),
          base: z.string().optional().describe('New base branch name'),
          maintainer_can_modify: z.boolean().optional().describe('Whether maintainers can modify the pull request'),
        }),
      },
      async ({ owner, repo, pull_number, title, body, state, base, maintainer_can_modify }) => {
        try {
          const response = await octokit.rest.pulls.update({
            owner,
            repo,
            pull_number,
            title,
            body,
            state,
            base,
            maintainer_can_modify,
          });
          return toToolResult(response.data);
        } catch (error) {
          return toToolError(error);
        }
      },
    );

    server.registerTool(
      'merge_pull_request',
      {
        description: 'Merge a pull request in a GitHub repository.',
        inputSchema: z.object({
          ...ownerRepoSchema,
          ...pullNumberSchema,
          commit_title: z.string().optional().describe('Title for the automatic merge commit message'),
          commit_message: z.string().optional().describe('Extra detail to append to the automatic merge commit message'),
          sha: z.string().optional().describe('SHA the pull request head must match to allow the merge'),
          merge_method: z.enum(['merge', 'squash', 'rebase']).optional().describe('Merge method to use'),
        }),
      },
      async ({ owner, repo, pull_number, commit_title, commit_message, sha, merge_method }) => {
        try {
          const response = await octokit.rest.pulls.merge({
            owner,
            repo,
            pull_number,
            commit_title,
            commit_message,
            sha,
            merge_method,
          });
          return toToolResult(response.data);
        } catch (error) {
          return toToolError(error);
        }
      },
    );

    server.registerTool(
      'create_pull_request_review',
      {
        description: 'Create a review on a GitHub pull request.',
        inputSchema: z.object({
          ...ownerRepoSchema,
          ...pullNumberSchema,
          commit_id: z.string().optional().describe('SHA of the commit to review (defaults to the most recent commit)'),
          body: z.string().optional().describe('Review body text, required when event is REQUEST_CHANGES or COMMENT'),
          event: z
            .enum(['APPROVE', 'REQUEST_CHANGES', 'COMMENT'])
            .optional()
            .describe('Review action; omit to leave the review PENDING'),
        }),
      },
      async ({ owner, repo, pull_number, commit_id, body, event }) => {
        try {
          const response = await octokit.rest.pulls.createReview({
            owner,
            repo,
            pull_number,
            commit_id,
            body,
            event,
          });
          return toToolResult(response.data);
        } catch (error) {
          return toToolError(error);
        }
      },
    );

    server.registerTool(
      'request_reviewers',
      {
        description: 'Request reviewers for a GitHub pull request.',
        inputSchema: z.object({
          ...ownerRepoSchema,
          ...pullNumberSchema,
          reviewers: z.array(z.string()).optional().describe('User logins to request review from'),
          team_reviewers: z.array(z.string()).optional().describe('Team slugs to request review from'),
        }),
      },
      async ({ owner, repo, pull_number, reviewers, team_reviewers }) => {
        try {
          const response = await octokit.rest.pulls.requestReviewers({
            owner,
            repo,
            pull_number,
            reviewers,
            team_reviewers,
          });
          return toToolResult(response.data);
        } catch (error) {
          return toToolError(error);
        }
      },
    );
  }
}
```

- [x] **Step 4: Run test to verify it passes**

Run: `npm test -- pull_requests`
Expected: PASS (15 tests: 8 from Task 1 + 7 new).

- [x] **Step 5: Typecheck, lint, and full suite**

Run: `npm run typecheck && npm run lint && npm test`
Expected: all PASS. Full suite total: 49 (after the `issues` plan) + 15 = 64 tests.

- [x] **Step 6: Commit**

```bash
git add src/toolsets/pull_requests.ts test/unit/toolsets/pull_requests.test.ts
git commit -m "feat: add pull_requests toolset write tools (create, update, merge, review, request reviewers)"
```

---

## Task 3: Wire `registerPullRequestsTools` into `server.ts`

**Files:**
- Modify: `src/server.ts`

**Interfaces:**
- Consumes: `registerPullRequestsTools(server, octokit, permission)` from Task 2.
- Produces: nothing new — this is the final integration point.

- [x] **Step 1: Modify `src/server.ts`**

Current content:

```typescript
import { McpServer } from '@modelcontextprotocol/server';
import type { Octokit } from 'octokit';
import { registerIssuesTools } from './toolsets/issues.js';
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

  return server;
}
```

Replace with:

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

- [x] **Step 2: Run the full test suite**

Run: `npm test`
Expected: PASS, same 64 tests as after Task 2 (no test exercises `server.ts` directly, following the same precedent as the `issues` plan's Task 4 — `buildServer` is a thin, non-branching composition function verified by the CLI smoke test below plus the pre-existing CLI smoke test from the core plan).

- [x] **Step 3: Typecheck, lint, build**

Run: `npm run typecheck && npm run lint && npm run build`
Expected: all PASS. The build step confirms `dist/cli.js`'s bundled dependency graph now transitively includes `pull_requests.ts`.

- [x] **Step 4: Manual end-to-end smoke test**

Run:
```bash
GITHUB_TOKEN=fake-token node dist/cli.js --transport=http --port=3992 &
sleep 1
curl -s -X POST http://localhost:3992/mcp \
  -H 'Content-Type: application/json' \
  -H 'Accept: application/json, text/event-stream' \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"smoke-test","version":"0.0.0"}}}'
```

Expected: a `200` response containing `"serverInfo":{"name":"github-mcp-server-js"...}`. Then send a `tools/list` request (reusing the `mcp-session-id` response header from the `initialize` call) and confirm the tool list includes `get_repository` (from `repos`), `list_issues` (from `issues`), and `list_pull_requests` (from this plan's `pull_requests` toolset) — proving all three toolsets are live in the same server with no duplicate-registration crash. Kill the background process afterward (`kill %1`).

- [x] **Step 5: Update the README's Toolsets section**

Modify `README.md`'s "Currently implemented" list (the same section the `issues` plan's final review flagged as going stale) to add:

```markdown
- `pull_requests` — pull request listing, creation, merging, reviews, and reviewer requests
```

and remove `pull requests` from the trailing "Additional toolsets ... are tracked in" sentence's implicit backlog, since it's now implemented.

- [x] **Step 6: Commit**

```bash
git add src/server.ts README.md
git commit -m "feat: wire pull_requests toolset into buildServer"
```

---

## Self-Review Notes

- **Spec coverage:** `pull_requests` toolset (Toolset Inventory row: octokit `pulls` namespace, example tools `list_prs, get_pr, create_pr, merge_pr, list_pr_files, create_review, list_reviews`, est. count ~10) — all 7 named examples are covered (`list_pull_requests`, `get_pull_request`, `create_pull_request`, `merge_pull_request`, `list_pull_request_files`, `create_pull_request_review`, `list_pull_request_reviews`), plus 3 more to round out common PR workflows (`list_pull_request_commits`, `update_pull_request`, `request_reviewers`) for exactly 10 tools, matching the estimate. Pagination (`page`/`per_page` defaults, max 100) — Task 1. Raw JSON response/error passthrough — Tasks 1-2. Registration-time permission gating — Task 2. `reactions` (also namespaced under the design doc's `issues` row in some readings) is explicitly out of scope for this toolset, consistent with how the `issues` plan treated it.
- **Lessons applied from the `issues` toolset's final review:**
  - **I1 (strict permission-gating equality):** Task 2's read-only test uses `expect(tools.map((t) => t.name).sort()).toEqual([...exact 5 names...])`, not `arrayContaining`.
  - **I3 (wire-level filter passthrough):** Task 1's `list_pull_requests` filter test uses `nock(...).query({...six params...})` plus `expect(scope.isDone()).toBe(true)`, proving every optional filter param is actually forwarded on the wire, not just accepted without erroring.
  - **M8 (tool-name collision check):** performed explicitly before finalizing names — see Global Constraints. All 10 names (`list_pull_requests`, `get_pull_request`, `list_pull_request_files`, `list_pull_request_commits`, `list_pull_request_reviews`, `create_pull_request`, `update_pull_request`, `merge_pull_request`, `create_pull_request_review`, `request_reviewers`) were checked against the 20 existing names from `repos.ts`/`issues.ts` and are all distinct — notably `create_pull_request_review` avoids colliding with `issues.ts`'s `add_comment`/`list_comments` by using the fully-qualified `pull_request_review` noun instead of a generic `comment`/`review` name.
- **Type consistency:** `registerPullRequestsTools(server: McpServer, octokit: Octokit, permission: 'read-only' | 'read-write'): void` (Task 1) matches `registerIssuesTools`/`registerReposTools`'s signature exactly and is called identically in `server.ts` (Task 3). `pullNumberSchema` (Task 1, added to `common.ts`) follows `issueNumberSchema`'s exact shape and naming convention. No schema fragment is redeclared locally in `pull_requests.ts`.
- **No placeholders:** every step includes complete, runnable code. All octokit method names, HTTP verbs, path templates, and query/body parameter shapes were verified directly against the installed `@octokit/plugin-rest-endpoint-methods` generated endpoint table and `@octokit/openapi-types` operation definitions (see the Reference table above) — not memorized or guessed. The one intentionally omitted field (`create_pull_request_review`'s inline `comments` array) is called out explicitly as a scope decision, not left as an implicit gap.
- **Task right-sizing note:** Task 1 bundles the trivial `common.ts` addition (one schema fragment, no test of its own) together with the 5 read tools it enables, rather than spinning up a standalone one-line task — mirroring the "fold setup into the task that needs it" guidance, since `pullNumberSchema` has no independent behavior to review in isolation.
