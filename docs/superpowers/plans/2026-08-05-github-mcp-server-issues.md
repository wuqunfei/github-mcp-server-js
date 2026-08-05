# github-mcp-server-js — `issues` Toolset Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the `issues` toolset (10 tools covering issue CRUD, comments, labels, and locking) to `github-mcp-server-js`, and extract the shared toolset helpers (`paginationSchema`, `toToolResult`, `toToolError`, the repeated `owner`/`repo` schema fields) out of `src/toolsets/repos.ts` into a new `src/toolsets/common.ts` module so every toolset — this one and the 14 still to come — imports them instead of re-declaring them.

**Architecture:** Same pattern as the `repos` toolset from the core plan: one `registerIssuesTools(server, octokit, permission)` function registers each tool with `server.registerTool(name, {description, inputSchema}, handler)`; every handler wraps its octokit call in try/catch, returning raw JSON via `toToolResult`/`toToolError`; write tools are registered only when `permission === 'read-write'`; `server.ts` gains one more registration call. The `common.ts` extraction happens first so this toolset (and the extraction itself) can be validated together before any other toolset copies the pattern.

**Tech Stack:** Same as the core plan — TypeScript, `@modelcontextprotocol/server@^2.0.0`, `octokit@^5.0.5`, `zod@^4.2.0`, `vitest`, `nock`. No new dependencies.

## Global Constraints

- Tool responses return the raw octokit response body as JSON, unmodified. No field trimming, no text summarization.
- Errors propagate unmodified: catch the octokit `RequestError`, surface `error.message` (which already includes the GitHub `message` field) in an MCP tool error result. No normalization layer.
- List tools take explicit `page` (default `1`) and `per_page` (default `30`, max `100`) parameters. No auto-pagination.
- `GITHUB_PERMISSION=read-only` must prevent write-tool handlers from ever being registered with `McpServer` — not just block them at call time.
- Every tool's `owner`/`repo`/`issue_number` parameters use the exact `.describe()` text established in this plan (Task 1), since `common.ts` centralizes it — do not restate different wording per tool.
- TypeScript only, no new runtime dependencies.

---

## File Structure

```
github-mcp-server-js/
  src/
    toolsets/
      common.ts             # NEW: paginationSchema, toToolResult, toToolError, ownerRepoSchema
      repos.ts               # MODIFIED: imports from common.ts instead of declaring its own copies
      issues.ts              # NEW: registerIssuesTools(server, octokit, permission)
    server.ts                # MODIFIED: calls registerIssuesTools
  test/
    unit/
      toolsets/
        common.test.ts        # NEW: unit tests for toToolResult/toToolError (pure functions)
        repos.test.ts          # unchanged (still passes, now exercises the shared common.ts)
        issues.test.ts         # NEW: mirrors repos.test.ts's structure
```

`common.ts` holds only pure, dependency-free helpers and one shared Zod schema fragment — no octokit calls, no `McpServer` references. This keeps it trivially testable and prevents it from growing into a dumping ground: if a future toolset needs something that isn't a generic response/pagination/identity concern, it gets its own file, not an addition to `common.ts`.

---

## Task 1: Extract shared toolset helpers into `common.ts`

**Files:**
- Create: `src/toolsets/common.ts`
- Modify: `src/toolsets/repos.ts:1-22` (remove local declarations, import from `common.ts`)
- Test: `test/unit/toolsets/common.test.ts`

**Interfaces:**
- Consumes: nothing (pure module, no octokit/McpServer dependency).
- Produces (for Task 2 and all future toolsets to consume):
  - `paginationSchema: { page: ZodDefault<...>, per_page: ZodDefault<...> }` — same shape as the current `repos.ts` local declaration.
  - `ownerRepoSchema: { owner: ZodString, repo: ZodString }` — the repeated pair with its `.describe()` text, extracted so every toolset spreads the same two fields instead of retyping the description strings.
  - `toToolResult(data: unknown): { content: [{ type: 'text', text: string }] }`
  - `toToolError(error: unknown): { isError: true, content: [{ type: 'text', text: string }] }`

- [ ] **Step 1: Write the failing test for the pure helpers**

Create `test/unit/toolsets/common.test.ts`:

```typescript
import { describe, expect, it } from 'vitest';
import { toToolError, toToolResult } from '../../../src/toolsets/common.js';

describe('toToolResult', () => {
  it('wraps data as a JSON text content block', () => {
    const result = toToolResult({ id: 1, name: 'octocat' });
    expect(result).toEqual({
      content: [{ type: 'text', text: '{"id":1,"name":"octocat"}' }],
    });
  });
});

describe('toToolError', () => {
  it('extracts the message from an Error instance', () => {
    const result = toToolError(new Error('Not Found'));
    expect(result).toEqual({
      isError: true,
      content: [{ type: 'text', text: 'Not Found' }],
    });
  });

  it('stringifies a non-Error value', () => {
    const result = toToolError('boom');
    expect(result).toEqual({
      isError: true,
      content: [{ type: 'text', text: 'boom' }],
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- common`
Expected: FAIL with a module-not-found error for `../../../src/toolsets/common.js` (the file doesn't exist yet).

- [ ] **Step 3: Create `src/toolsets/common.ts`**

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

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- common`
Expected: PASS (3 tests).

- [ ] **Step 5: Update `src/toolsets/repos.ts` to import from `common.ts` instead of declaring its own copies**

Replace the top of `src/toolsets/repos.ts` (currently lines 1-22, the imports plus the local `paginationSchema`/`toToolResult`/`toToolError` declarations) with:

```typescript
import type { McpServer } from '@modelcontextprotocol/server';
import type { Octokit } from 'octokit';
import { z } from 'zod';
import { ownerRepoSchema, paginationSchema, toToolResult, toToolError } from './common.js';
```

Then, in every `inputSchema: z.object({ owner: z.string().describe(...), repo: z.string().describe(...), ... })` block in the rest of the file, replace the two literal `owner`/`repo` field declarations with `...ownerRepoSchema`. For example, `get_repository`'s schema:

```typescript
      inputSchema: z.object({
        ...ownerRepoSchema,
      }),
```

and `list_branches`'s schema:

```typescript
      inputSchema: z.object({
        ...ownerRepoSchema,
        ...paginationSchema,
      }),
```

Apply the same `...ownerRepoSchema` substitution to `get_branch`, `get_file_contents`, `list_commits`, `get_commit`, `list_tags`, and `create_or_update_file` — every tool in the file currently repeats the literal `owner: z.string().describe(...)` / `repo: z.string().describe(...)` pair. Do not change any handler logic, tool names, descriptions, or the octokit calls themselves — this step only removes duplication in the schema declarations and the three helper functions.

- [ ] **Step 6: Run the full test suite to verify nothing broke**

Run: `npm test`
Expected: PASS — all pre-existing `repos.test.ts` tests (6 tests) still pass unchanged, since the wire-level behavior (parameter names, descriptions, JSON shape) is identical; only where the schema/helpers are declared changed. Plus the 3 new `common.test.ts` tests. Total: 30 + 3 = 33 tests passing (the core plan left 30 passing after its final fix round).

- [ ] **Step 7: Typecheck and lint**

Run: `npm run typecheck && npm run lint`
Expected: both PASS with zero errors.

- [ ] **Step 8: Commit**

```bash
git add src/toolsets/common.ts src/toolsets/repos.ts test/unit/toolsets/common.test.ts
git commit -m "refactor: extract shared toolset helpers into common.ts"
```

---

## Task 2: Implement the `issues` toolset — read tools (list, get, list comments, list labels, list labels on issue)

**Files:**
- Create: `src/toolsets/issues.ts`
- Test: `test/unit/toolsets/issues.test.ts`

**Interfaces:**
- Consumes: `ownerRepoSchema`, `paginationSchema`, `toToolResult`, `toToolError` from `./common.js` (Task 1).
- Produces (for Task 3 to extend in the same file, and for Task 4/`server.ts` to consume): `registerIssuesTools(server: McpServer, octokit: Octokit, permission: 'read-only' | 'read-write'): void` — same signature shape as `registerReposTools`.

This task implements the 5 read-only tools. Task 3 adds the 5 write tools to the same file and function.

- [ ] **Step 1: Write the failing tests for the read tools**

Create `test/unit/toolsets/issues.test.ts`:

```typescript
import { McpServer } from '@modelcontextprotocol/server';
import { Client } from '@modelcontextprotocol/client';
import { InMemoryTransport } from '@modelcontextprotocol/server';
import { Octokit } from 'octokit';
import nock from 'nock';
import { afterEach, describe, expect, it } from 'vitest';
import { registerIssuesTools } from '../../../src/toolsets/issues.js';

async function connectedClient(permission: 'read-only' | 'read-write') {
  const octokit = new Octokit({ auth: 'test-token', baseUrl: 'https://api.github.com' });
  const server = new McpServer({ name: 'test-server', version: '0.0.0' });
  registerIssuesTools(server, octokit, permission);

  const client = new Client({ name: 'test-client', version: '0.0.0' });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await Promise.all([client.connect(clientTransport), server.connect(serverTransport)]);
  return client;
}

describe('registerIssuesTools', () => {
  afterEach(() => {
    nock.cleanAll();
  });

  it('registers list_issues and returns the raw GitHub response as JSON', async () => {
    nock('https://api.github.com')
      .get('/repos/octocat/hello-world/issues')
      .query({ page: '1', per_page: '30' })
      .reply(200, [{ number: 1, title: 'first issue' }]);

    const client = await connectedClient('read-write');
    const result = await client.callTool({
      name: 'list_issues',
      arguments: { owner: 'octocat', repo: 'hello-world' },
    });

    expect(result.isError).toBeFalsy();
    const text = (result.content as Array<{ type: string; text: string }>)[0]?.text ?? '';
    expect(JSON.parse(text)).toEqual([{ number: 1, title: 'first issue' }]);
  });

  it('passes explicit page and per_page through to list_issues', async () => {
    nock('https://api.github.com')
      .get('/repos/octocat/hello-world/issues')
      .query({ page: '2', per_page: '10' })
      .reply(200, [{ number: 5, title: 'second page issue' }]);

    const client = await connectedClient('read-write');
    const result = await client.callTool({
      name: 'list_issues',
      arguments: { owner: 'octocat', repo: 'hello-world', page: 2, per_page: 10 },
    });

    expect(result.isError).toBeFalsy();
    const text = (result.content as Array<{ type: string; text: string }>)[0]?.text ?? '';
    expect(JSON.parse(text)).toEqual([{ number: 5, title: 'second page issue' }]);
  });

  it('registers get_issue and returns the raw GitHub response as JSON', async () => {
    nock('https://api.github.com')
      .get('/repos/octocat/hello-world/issues/1')
      .reply(200, { number: 1, title: 'first issue', state: 'open' });

    const client = await connectedClient('read-write');
    const result = await client.callTool({
      name: 'get_issue',
      arguments: { owner: 'octocat', repo: 'hello-world', issue_number: 1 },
    });

    expect(result.isError).toBeFalsy();
    const text = (result.content as Array<{ type: string; text: string }>)[0]?.text ?? '';
    expect(JSON.parse(text)).toMatchObject({ number: 1, state: 'open' });
  });

  it('propagates a 404 as an MCP tool error with the raw GitHub message', async () => {
    nock('https://api.github.com')
      .get('/repos/octocat/hello-world/issues/999')
      .reply(404, { message: 'Not Found', documentation_url: 'https://docs.github.com/rest' });

    const client = await connectedClient('read-write');
    const result = await client.callTool({
      name: 'get_issue',
      arguments: { owner: 'octocat', repo: 'hello-world', issue_number: 999 },
    });

    expect(result.isError).toBe(true);
    const text = (result.content as Array<{ type: string; text: string }>)[0]?.text ?? '';
    expect(text).toContain('Not Found');
  });

  it('registers list_comments and returns the raw GitHub response as JSON', async () => {
    nock('https://api.github.com')
      .get('/repos/octocat/hello-world/issues/1/comments')
      .query({ page: '1', per_page: '30' })
      .reply(200, [{ id: 10, body: 'a comment' }]);

    const client = await connectedClient('read-write');
    const result = await client.callTool({
      name: 'list_comments',
      arguments: { owner: 'octocat', repo: 'hello-world', issue_number: 1 },
    });

    expect(result.isError).toBeFalsy();
    const text = (result.content as Array<{ type: string; text: string }>)[0]?.text ?? '';
    expect(JSON.parse(text)).toEqual([{ id: 10, body: 'a comment' }]);
  });

  it('registers list_labels and returns the raw GitHub response as JSON', async () => {
    nock('https://api.github.com')
      .get('/repos/octocat/hello-world/labels')
      .query({ page: '1', per_page: '30' })
      .reply(200, [{ name: 'bug', color: 'ff0000' }]);

    const client = await connectedClient('read-write');
    const result = await client.callTool({
      name: 'list_labels',
      arguments: { owner: 'octocat', repo: 'hello-world' },
    });

    expect(result.isError).toBeFalsy();
    const text = (result.content as Array<{ type: string; text: string }>)[0]?.text ?? '';
    expect(JSON.parse(text)).toEqual([{ name: 'bug', color: 'ff0000' }]);
  });

  it('registers list_labels_on_issue and returns the raw GitHub response as JSON', async () => {
    nock('https://api.github.com')
      .get('/repos/octocat/hello-world/issues/1/labels')
      .query({ page: '1', per_page: '30' })
      .reply(200, [{ name: 'help wanted' }]);

    const client = await connectedClient('read-write');
    const result = await client.callTool({
      name: 'list_labels_on_issue',
      arguments: { owner: 'octocat', repo: 'hello-world', issue_number: 1 },
    });

    expect(result.isError).toBeFalsy();
    const text = (result.content as Array<{ type: string; text: string }>)[0]?.text ?? '';
    expect(JSON.parse(text)).toEqual([{ name: 'help wanted' }]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- issues`
Expected: FAIL with a module-not-found error for `../../../src/toolsets/issues.js`.

- [ ] **Step 3: Create `src/toolsets/issues.ts` with the 5 read tools**

```typescript
import type { McpServer } from '@modelcontextprotocol/server';
import type { Octokit } from 'octokit';
import { z } from 'zod';
import { ownerRepoSchema, paginationSchema, toToolResult, toToolError } from './common.js';

export function registerIssuesTools(
  server: McpServer,
  octokit: Octokit,
  permission: 'read-only' | 'read-write',
): void {
  server.registerTool(
    'list_issues',
    {
      description: 'List issues in a GitHub repository.',
      inputSchema: z.object({
        ...ownerRepoSchema,
        state: z.enum(['open', 'closed', 'all']).optional().describe('Filter by issue state (defaults to open)'),
        labels: z.string().optional().describe('Comma-separated list of label names to filter by'),
        assignee: z.string().optional().describe('Filter by assignee login, "none", or "*" for any'),
        sort: z.enum(['created', 'updated', 'comments']).optional().describe('Field to sort results by'),
        direction: z.enum(['asc', 'desc']).optional().describe('Sort direction'),
        ...paginationSchema,
      }),
    },
    async ({ owner, repo, state, labels, assignee, sort, direction, page, per_page }) => {
      try {
        const response = await octokit.rest.issues.listForRepo({
          owner,
          repo,
          state,
          labels,
          assignee,
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
    'get_issue',
    {
      description: 'Get a single issue in a GitHub repository.',
      inputSchema: z.object({
        ...ownerRepoSchema,
        issue_number: z.number().int().describe('Issue number'),
      }),
    },
    async ({ owner, repo, issue_number }) => {
      try {
        const response = await octokit.rest.issues.get({ owner, repo, issue_number });
        return toToolResult(response.data);
      } catch (error) {
        return toToolError(error);
      }
    },
  );

  server.registerTool(
    'list_comments',
    {
      description: 'List comments on a GitHub issue.',
      inputSchema: z.object({
        ...ownerRepoSchema,
        issue_number: z.number().int().describe('Issue number'),
        ...paginationSchema,
      }),
    },
    async ({ owner, repo, issue_number, page, per_page }) => {
      try {
        const response = await octokit.rest.issues.listComments({
          owner,
          repo,
          issue_number,
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
    'list_labels',
    {
      description: 'List all labels defined in a GitHub repository.',
      inputSchema: z.object({
        ...ownerRepoSchema,
        ...paginationSchema,
      }),
    },
    async ({ owner, repo, page, per_page }) => {
      try {
        const response = await octokit.rest.issues.listLabelsForRepo({ owner, repo, page, per_page });
        return toToolResult(response.data);
      } catch (error) {
        return toToolError(error);
      }
    },
  );

  server.registerTool(
    'list_labels_on_issue',
    {
      description: 'List the labels currently applied to a GitHub issue.',
      inputSchema: z.object({
        ...ownerRepoSchema,
        issue_number: z.number().int().describe('Issue number'),
        ...paginationSchema,
      }),
    },
    async ({ owner, repo, issue_number, page, per_page }) => {
      try {
        const response = await octokit.rest.issues.listLabelsOnIssue({
          owner,
          repo,
          issue_number,
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
    // Write tools added in Task 3.
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- issues`
Expected: PASS (7 tests).

- [ ] **Step 5: Typecheck and lint**

Run: `npm run typecheck && npm run lint`
Expected: both PASS with zero errors. Note: an empty `if (permission === 'read-write') { }` block with only a comment may trigger an ESLint "no-empty" warning — if it does, remove the `if` block entirely for now and re-add it in Task 3 rather than suppressing the lint rule.

- [ ] **Step 6: Commit**

```bash
git add src/toolsets/issues.ts test/unit/toolsets/issues.test.ts
git commit -m "feat: add issues toolset read tools (list_issues, get_issue, list_comments, list_labels, list_labels_on_issue)"
```

---

## Task 3: Implement the `issues` toolset — write tools (create, update, add comment, add labels, remove label, lock, unlock)

**Files:**
- Modify: `src/toolsets/issues.ts` (add write tools inside the `if (permission === 'read-write')` block from Task 2)
- Test: `test/unit/toolsets/issues.test.ts` (append write-tool tests)

**Interfaces:**
- Consumes: same `registerIssuesTools` function body from Task 2 — this task adds to it, not replaces it.
- Produces: the following tool names become registered under `read-write` only: `create_issue`, `update_issue`, `add_comment`, `add_labels`, `remove_label`, `lock_issue`, `unlock_issue`.

That's 5 read tools (Task 2) + 7 write tools (this task) = 12 tools, slightly above the spec's ~10 estimate — the spec explicitly calls tool counts "estimates... refined during implementation," and `lock`/`unlock` are cheap, single-purpose, high-value tools worth keeping separate rather than folding into `update_issue`.

- [ ] **Step 1: Write the failing tests for the write tools**

Append to `test/unit/toolsets/issues.test.ts`, inside the existing `describe('registerIssuesTools', ...)` block, right before the closing `});`:

```typescript
  it('registers create_issue and returns the raw GitHub response as JSON', async () => {
    nock('https://api.github.com')
      .post('/repos/octocat/hello-world/issues', { title: 'a new bug' })
      .reply(201, { number: 42, title: 'a new bug' });

    const client = await connectedClient('read-write');
    const result = await client.callTool({
      name: 'create_issue',
      arguments: { owner: 'octocat', repo: 'hello-world', title: 'a new bug' },
    });

    expect(result.isError).toBeFalsy();
    const text = (result.content as Array<{ type: string; text: string }>)[0]?.text ?? '';
    expect(JSON.parse(text)).toEqual({ number: 42, title: 'a new bug' });
  });

  it('registers update_issue and returns the raw GitHub response as JSON', async () => {
    nock('https://api.github.com')
      .patch('/repos/octocat/hello-world/issues/1', { state: 'closed' })
      .reply(200, { number: 1, state: 'closed' });

    const client = await connectedClient('read-write');
    const result = await client.callTool({
      name: 'update_issue',
      arguments: { owner: 'octocat', repo: 'hello-world', issue_number: 1, state: 'closed' },
    });

    expect(result.isError).toBeFalsy();
    const text = (result.content as Array<{ type: string; text: string }>)[0]?.text ?? '';
    expect(JSON.parse(text)).toEqual({ number: 1, state: 'closed' });
  });

  it('registers add_comment and returns the raw GitHub response as JSON', async () => {
    nock('https://api.github.com')
      .post('/repos/octocat/hello-world/issues/1/comments', { body: 'a comment' })
      .reply(201, { id: 99, body: 'a comment' });

    const client = await connectedClient('read-write');
    const result = await client.callTool({
      name: 'add_comment',
      arguments: { owner: 'octocat', repo: 'hello-world', issue_number: 1, body: 'a comment' },
    });

    expect(result.isError).toBeFalsy();
    const text = (result.content as Array<{ type: string; text: string }>)[0]?.text ?? '';
    expect(JSON.parse(text)).toEqual({ id: 99, body: 'a comment' });
  });

  it('registers add_labels and returns the raw GitHub response as JSON', async () => {
    nock('https://api.github.com')
      .post('/repos/octocat/hello-world/issues/1/labels', { labels: ['bug'] })
      .reply(200, [{ name: 'bug' }]);

    const client = await connectedClient('read-write');
    const result = await client.callTool({
      name: 'add_labels',
      arguments: { owner: 'octocat', repo: 'hello-world', issue_number: 1, labels: ['bug'] },
    });

    expect(result.isError).toBeFalsy();
    const text = (result.content as Array<{ type: string; text: string }>)[0]?.text ?? '';
    expect(JSON.parse(text)).toEqual([{ name: 'bug' }]);
  });

  it('registers remove_label and returns the raw GitHub response as JSON', async () => {
    nock('https://api.github.com')
      .delete('/repos/octocat/hello-world/issues/1/labels/bug')
      .reply(200, [{ name: 'enhancement' }]);

    const client = await connectedClient('read-write');
    const result = await client.callTool({
      name: 'remove_label',
      arguments: { owner: 'octocat', repo: 'hello-world', issue_number: 1, name: 'bug' },
    });

    expect(result.isError).toBeFalsy();
    const text = (result.content as Array<{ type: string; text: string }>)[0]?.text ?? '';
    expect(JSON.parse(text)).toEqual([{ name: 'enhancement' }]);
  });

  it('registers lock_issue and returns success with no content', async () => {
    nock('https://api.github.com')
      .put('/repos/octocat/hello-world/issues/1/lock', { lock_reason: 'resolved' })
      .reply(204);

    const client = await connectedClient('read-write');
    const result = await client.callTool({
      name: 'lock_issue',
      arguments: { owner: 'octocat', repo: 'hello-world', issue_number: 1, lock_reason: 'resolved' },
    });

    expect(result.isError).toBeFalsy();
  });

  it('registers unlock_issue and returns success with no content', async () => {
    nock('https://api.github.com')
      .delete('/repos/octocat/hello-world/issues/1/lock')
      .reply(204);

    const client = await connectedClient('read-write');
    const result = await client.callTool({
      name: 'unlock_issue',
      arguments: { owner: 'octocat', repo: 'hello-world', issue_number: 1 },
    });

    expect(result.isError).toBeFalsy();
  });

  it('does not register any write tool in read-only mode', async () => {
    const client = await connectedClient('read-only');
    const { tools } = await client.listTools();
    const names = tools.map((tool) => tool.name);
    expect(names).not.toEqual(
      expect.arrayContaining([
        'create_issue',
        'update_issue',
        'add_comment',
        'add_labels',
        'remove_label',
        'lock_issue',
        'unlock_issue',
      ]),
    );
  });

  it('registers all 5 read-only tools regardless of permission', async () => {
    const client = await connectedClient('read-only');
    const { tools } = await client.listTools();
    const names = tools.map((tool) => tool.name);
    expect(names).toEqual(
      expect.arrayContaining([
        'list_issues',
        'get_issue',
        'list_comments',
        'list_labels',
        'list_labels_on_issue',
      ]),
    );
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- issues`
Expected: FAIL — the 7 new write-tool tests fail with "Tool <name> not found" (`ProtocolError`) since the tools don't exist yet; the 2 permission-check tests may pass vacuously (nothing to find is nothing registered) or fail depending on assertion direction — re-run after Step 3 regardless.

- [ ] **Step 3: Add the write tools to `src/toolsets/issues.ts`**

Replace the `if (permission === 'read-write') { // Write tools added in Task 3. }` placeholder (or, if Task 2's lint step removed the empty block entirely, add this block at the end of `registerIssuesTools`, right before its closing `}`) with:

```typescript
  if (permission === 'read-write') {
    server.registerTool(
      'create_issue',
      {
        description: 'Create a new issue in a GitHub repository.',
        inputSchema: z.object({
          ...ownerRepoSchema,
          title: z.string().describe('Issue title'),
          body: z.string().optional().describe('Issue body/description'),
          assignees: z.array(z.string()).optional().describe('Logins to assign to the issue'),
          labels: z.array(z.string()).optional().describe('Label names to apply to the issue'),
        }),
      },
      async ({ owner, repo, title, body, assignees, labels }) => {
        try {
          const response = await octokit.rest.issues.create({
            owner,
            repo,
            title,
            body,
            assignees,
            labels,
          });
          return toToolResult(response.data);
        } catch (error) {
          return toToolError(error);
        }
      },
    );

    server.registerTool(
      'update_issue',
      {
        description: 'Update an existing issue in a GitHub repository.',
        inputSchema: z.object({
          ...ownerRepoSchema,
          issue_number: z.number().int().describe('Issue number'),
          title: z.string().optional().describe('New issue title'),
          body: z.string().optional().describe('New issue body/description'),
          state: z.enum(['open', 'closed']).optional().describe('New issue state'),
          state_reason: z
            .enum(['completed', 'not_planned', 'duplicate', 'reopened'])
            .optional()
            .describe('Reason for the state change, only applied when state is changed'),
          assignees: z.array(z.string()).optional().describe('Logins to assign to the issue'),
          labels: z.array(z.string()).optional().describe('Label names to replace the issue\'s current labels'),
        }),
      },
      async ({ owner, repo, issue_number, title, body, state, state_reason, assignees, labels }) => {
        try {
          const response = await octokit.rest.issues.update({
            owner,
            repo,
            issue_number,
            title,
            body,
            state,
            state_reason,
            assignees,
            labels,
          });
          return toToolResult(response.data);
        } catch (error) {
          return toToolError(error);
        }
      },
    );

    server.registerTool(
      'add_comment',
      {
        description: 'Add a comment to a GitHub issue.',
        inputSchema: z.object({
          ...ownerRepoSchema,
          issue_number: z.number().int().describe('Issue number'),
          body: z.string().describe('Comment body'),
        }),
      },
      async ({ owner, repo, issue_number, body }) => {
        try {
          const response = await octokit.rest.issues.createComment({ owner, repo, issue_number, body });
          return toToolResult(response.data);
        } catch (error) {
          return toToolError(error);
        }
      },
    );

    server.registerTool(
      'add_labels',
      {
        description: "Add labels to a GitHub issue, keeping the issue's existing labels.",
        inputSchema: z.object({
          ...ownerRepoSchema,
          issue_number: z.number().int().describe('Issue number'),
          labels: z.array(z.string()).describe('Label names to add'),
        }),
      },
      async ({ owner, repo, issue_number, labels }) => {
        try {
          const response = await octokit.rest.issues.addLabels({ owner, repo, issue_number, labels });
          return toToolResult(response.data);
        } catch (error) {
          return toToolError(error);
        }
      },
    );

    server.registerTool(
      'remove_label',
      {
        description: 'Remove a single label from a GitHub issue.',
        inputSchema: z.object({
          ...ownerRepoSchema,
          issue_number: z.number().int().describe('Issue number'),
          name: z.string().describe('Name of the label to remove'),
        }),
      },
      async ({ owner, repo, issue_number, name }) => {
        try {
          const response = await octokit.rest.issues.removeLabel({ owner, repo, issue_number, name });
          return toToolResult(response.data);
        } catch (error) {
          return toToolError(error);
        }
      },
    );

    server.registerTool(
      'lock_issue',
      {
        description: 'Lock a GitHub issue conversation to collaborators only.',
        inputSchema: z.object({
          ...ownerRepoSchema,
          issue_number: z.number().int().describe('Issue number'),
          lock_reason: z
            .enum(['off-topic', 'too heated', 'resolved', 'spam'])
            .optional()
            .describe('Reason for locking the conversation'),
        }),
      },
      async ({ owner, repo, issue_number, lock_reason }) => {
        try {
          await octokit.rest.issues.lock({ owner, repo, issue_number, lock_reason });
          return toToolResult({ locked: true });
        } catch (error) {
          return toToolError(error);
        }
      },
    );

    server.registerTool(
      'unlock_issue',
      {
        description: 'Unlock a previously locked GitHub issue conversation.',
        inputSchema: z.object({
          ...ownerRepoSchema,
          issue_number: z.number().int().describe('Issue number'),
        }),
      },
      async ({ owner, repo, issue_number }) => {
        try {
          await octokit.rest.issues.unlock({ owner, repo, issue_number });
          return toToolResult({ locked: false });
        } catch (error) {
          return toToolError(error);
        }
      },
    );
  }
```

Note on `lock_issue`/`unlock_issue`: GitHub's API returns `204 No Content` for both endpoints (confirmed against `@octokit/openapi-types`'s `issues/lock` and `issues/unlock` operation definitions — both have `responses: { 204: { content: never } }`), so there is no response body to pass through. Returning a small synthetic `{ locked: true }` / `{ locked: false }` object (rather than `response.data`, which octokit types as `never`/`undefined` here) keeps `toToolResult`'s contract of "always returns a JSON text block" consistent across every tool in the codebase — this is a deliberate, minimal exception to the "raw response body, unmodified" rule, justified by there being no body to return, not a design choice to summarize data.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- issues`
Expected: PASS (16 tests: 7 from Task 2 + 9 new).

- [ ] **Step 5: Typecheck, lint, and full suite**

Run: `npm run typecheck && npm run lint && npm test`
Expected: all PASS. Full suite total: 33 (after Task 1) + 16 = 49 tests.

- [ ] **Step 6: Commit**

```bash
git add src/toolsets/issues.ts test/unit/toolsets/issues.test.ts
git commit -m "feat: add issues toolset write tools (create, update, comment, labels, lock)"
```

---

## Task 4: Wire `registerIssuesTools` into `server.ts`

**Files:**
- Modify: `src/server.ts`

**Interfaces:**
- Consumes: `registerIssuesTools(server, octokit, permission)` from Task 3.
- Produces: nothing new — this is the final integration point; no later task depends on `server.ts`'s internals beyond what Task 6 (core plan) already established.

- [ ] **Step 1: Modify `src/server.ts`**

Current content:

```typescript
import { McpServer } from '@modelcontextprotocol/server';
import type { Octokit } from 'octokit';
import { registerReposTools } from './toolsets/repos.js';

const SERVER_NAME = 'github-mcp-server-js';
const SERVER_VERSION = '0.1.0';

export function buildServer(
  octokit: Octokit,
  permission: 'read-only' | 'read-write',
): McpServer {
  const server = new McpServer({ name: SERVER_NAME, version: SERVER_VERSION });

  registerReposTools(server, octokit, permission);

  return server;
}
```

Replace with:

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

- [ ] **Step 2: Run the full test suite**

Run: `npm test`
Expected: PASS, same 49 tests as after Task 3 (no test exercises `server.ts` directly today — the core plan's Task 6 relied on controller-level verification plus the CLI smoke test in Task 8, and this task follows the same precedent since `buildServer` is a thin, non-branching composition function).

- [ ] **Step 3: Typecheck, lint, build**

Run: `npm run typecheck && npm run lint && npm run build`
Expected: all PASS. The build step matters here specifically — it confirms the bundled CLI output actually includes the new toolset (tsup performs a full re-bundle from `src/cli.ts`'s dependency graph, which now transitively includes `issues.ts`).

- [ ] **Step 4: Manual end-to-end smoke test**

Run:
```bash
GITHUB_TOKEN=fake-token node dist/cli.js --transport=http --port=3991 &
sleep 1
curl -s -X POST http://localhost:3991/mcp \
  -H 'Content-Type: application/json' \
  -H 'Accept: application/json, text/event-stream' \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"smoke-test","version":"0.0.0"}}}'
```

Expected: a `200` response containing `"serverInfo":{"name":"github-mcp-server-js"...}`. Then send a `tools/list` request (reusing the `mcp-session-id` response header from the `initialize` call) and confirm the tool list includes both `get_repository` (from the `repos` toolset) and `list_issues` (from this plan's `issues` toolset) — proving both toolsets are live in the same server. Kill the background process afterward (`kill %1`).

- [ ] **Step 5: Commit**

```bash
git add src/server.ts
git commit -m "feat: wire issues toolset into buildServer"
```

---

## Self-Review Notes

- **Spec coverage:** `issues` toolset (Task Inventory row `issues`: octokit `issues`/`interactions` namespaces — this plan covers `issues`; `reactions` is out of scope for this toolset per GitHub's own REST API grouping, where reactions apply to issues/comments/PRs generically and are commonly split into their own toolset in later plans, consistent with the spec's per-toolset table treating `reactions` as a secondary namespace rather than issues' primary surface). Pagination (`page`/`per_page` defaults, max 100) — Task 2. Raw JSON response/error passthrough — Tasks 2-3. Registration-time permission gating — Task 3. The two Plan-1-deferred Minor findings folded in as instructed: shared-helper extraction (`common.ts`) — Task 1; pagination-defaults test — Task 2's `list_issues` test with no page args asserting `?page=1&per_page=30` on the wire.
- **Type consistency:** `registerIssuesTools(server: McpServer, octokit: Octokit, permission: 'read-only' | 'read-write'): void` (Task 2) matches `registerReposTools`'s signature exactly and is called identically in `server.ts` (Task 4). `ownerRepoSchema`/`paginationSchema`/`toToolResult`/`toToolError` (Task 1) are typed once in `common.ts` and consumed with identical import syntax in both `repos.ts` (Task 1) and `issues.ts` (Tasks 2-3) — no redeclaration anywhere.
- **No placeholders:** every step includes complete, runnable code. Parameter names and endpoint paths (`issues.listForRepo`, `issues.get`, `issues.create`, `issues.update`, `issues.createComment`, `issues.listComments`, `issues.listLabelsForRepo`, `issues.listLabelsOnIssue`, `issues.addLabels`, `issues.removeLabel`, `issues.lock`, `issues.unlock`) and their exact path/query/body parameter shapes were verified directly against the installed `@octokit/openapi-types` and `@octokit/plugin-rest-endpoint-methods` package type declarations and generated endpoint tables (not guessed from documentation or general GitHub API familiarity) — e.g. confirming `issues/lock` and `issues/unlock` return `204 No Content` with no response body, which is why `lock_issue`/`unlock_issue`'s handlers return a synthetic result instead of `response.data`.
