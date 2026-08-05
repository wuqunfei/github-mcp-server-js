# github-mcp-server-js — `gists` Toolset Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Add the `gists` toolset (5 tools covering gist CRUD plus list) to `github-mcp-server-js`, following the exact structural, permission-gating, and response/error pattern established by the `repos`, `issues`, `pull_requests`, `search`, and `users` toolsets.

**Architecture:** Same pattern as prior toolsets: one `registerGistsTools(server, octokit, permission)` function registers each tool with `server.registerTool(name, {description, inputSchema}, handler)`; every handler wraps its octokit call in try/catch, returning raw JSON via `toToolResult`/`toToolError`; write tools are registered only when `permission === 'read-write'`; `server.ts` gains one more registration call. All octokit calls use the `gists` namespace (`octokit.rest.gists.*`).

**Tech Stack:** Same as prior plans — TypeScript, `@modelcontextprotocol/server@^2.0.0`, `octokit@^5.0.5`, `zod@^4.2.0`, `vitest`, `nock`. No new dependencies.

## Global Constraints

- Tool responses return the raw octokit response body as JSON, unmodified. No field trimming, no text summarization.
- Errors propagate unmodified: catch the octokit `RequestError`, surface `error.message` in an MCP tool error result. No normalization layer.
- List tools take explicit `page` (default `1`) and `per_page` (default `30`, max `100`) parameters. No auto-pagination.
- `GITHUB_PERMISSION=read-only` must prevent write-tool handlers from ever being registered with `McpServer` — write tools must be inside `if (permission === 'read-write') { ... }`, not gated at call time.
- `delete_gist` returns `204 No Content` (confirmed: `responses: { 204: { content: never } }` in `@octokit/openapi-types`). The handler returns a synthetic `{ deleted: true }` result — the same deliberate exception used by `lock_issue`/`unlock_issue` — because there is no response body to pass through. This is the only case in this toolset where the "raw response body" rule cannot apply.
- No modification to `common.ts` — `gist_id` is gist-specific and no other toolset shares it; inline it in `gists.ts` directly.
- TypeScript only, no new runtime dependencies.

---

## Tool Selection and Collision Check

**Tools chosen (5 total):**

| Tool | Read/Write | octokit method | HTTP |
|---|---|---|---|
| `list_gists` | read | `gists.list` | GET `/gists` |
| `get_gist` | read | `gists.get` | GET `/gists/{gist_id}` |
| `create_gist` | write | `gists.create` | POST `/gists` |
| `update_gist` | write | `gists.patch` (i.e., `octokit.rest.gists.update`) | PATCH `/gists/{gist_id}` |
| `delete_gist` | write | `gists.delete` | DELETE `/gists/{gist_id}` |

**Read/write split:** 2 read tools + 3 write tools.

**Collision check against all 40 existing tool names** (8 `repos` + 12 `issues` + 10 `pull_requests` + 5 `search` + 5 `users`):

Existing names: `add_comment`, `add_labels`, `create_issue`, `create_or_update_file`, `create_pull_request`, `create_pull_request_review`, `get_authenticated_user`, `get_branch`, `get_commit`, `get_file_contents`, `get_issue`, `get_pull_request`, `get_repository`, `get_user_by_username`, `get_user_hovercard`, `list_branches`, `list_comments`, `list_commits`, `list_issues`, `list_labels`, `list_labels_on_issue`, `list_pull_request_commits`, `list_pull_request_files`, `list_pull_request_reviews`, `list_pull_requests`, `list_tags`, `list_user_followers`, `list_user_following`, `lock_issue`, `merge_pull_request`, `remove_label`, `request_reviewers`, `search_code`, `search_commits`, `search_issues`, `search_repos`, `search_users`, `unlock_issue`, `update_issue`, `update_pull_request`.

**Result: zero collisions.** `list_gists`, `get_gist`, `create_gist`, `update_gist`, and `delete_gist` are all distinct from every existing name.

---

## Verified octokit `gists` namespace shapes

Confirmed directly against the installed `@octokit/plugin-rest-endpoint-methods` endpoint table and `@octokit/openapi-types/types.d.ts`.

| Tool | octokit call | Key parameters | Response shape |
|---|---|---|---|
| `list_gists` | `octokit.rest.gists.list({ since?, per_page?, page? })` | `since` (ISO 8601), `page`, `per_page` | `base-gist[]` (200) |
| `get_gist` | `octokit.rest.gists.get({ gist_id })` | `gist_id` (string) | `gist-simple` (200) |
| `create_gist` | `octokit.rest.gists.create({ files, description?, public? })` | `files`: `{ [filename]: { content: string } }`, `description`, `public` | `gist-simple` (201) |
| `update_gist` | `octokit.rest.gists.update({ gist_id, description?, files? })` | `gist_id`, `description`, `files`: `{ [filename]: { content?, filename? } \| null }` | `gist-simple` (200) |
| `delete_gist` | `octokit.rest.gists.delete({ gist_id })` | `gist_id` | 204 No Content |

**Octokit method naming note:** In `octokit.rest.gists`, the PATCH method is accessed as `gists.update` (not `gists.patch`) — confirmed via `octokit.rest.gists.update.endpoint.DEFAULTS` which shows `{ method: 'PATCH', url: '/gists/{gist_id}' }`.

**`files` parameter shape for `create_gist`:**
```
files: { [key: string]: { content: string } }
```
This is a record where each key is the filename and each value is `{ content: string }`. In the Zod schema this is expressed as `z.record(z.string(), z.object({ content: z.string() }))`.

**`files` parameter shape for `update_gist`:**
```
files?: { [key: string]: { content?: string; filename?: string | null } | null }
```
To delete a file, set its value to `null`. To rename a file, set `filename` to the new name. In Zod: `z.record(z.string(), z.union([z.object({ content: z.string().optional(), filename: z.string().nullable().optional() }), z.null()]).optional())` — see Step 3 of Task 2 for the exact declaration used in the implementation.

---

## File Structure

```
github-mcp-server-js/
  src/
    toolsets/
      gists.ts               # NEW: registerGistsTools(server, octokit, permission)
    server.ts                 # MODIFIED: calls registerGistsTools
  test/
    unit/
      toolsets/
        gists.test.ts          # NEW: mirrors users.test.ts's structure
```

`common.ts` is NOT modified — `gist_id` is gist-specific and inlined in `gists.ts`. `README.md`'s Toolsets section is updated in Task 3 (Step 4), following the same precedent as every prior toolset plan.

---

## Task 1: Implement the `gists` toolset — read tools (`list_gists`, `get_gist`) and their tests

**Files:**
- Create: `src/toolsets/gists.ts` (read tools only; write tools stubbed as empty `if` block)
- Create: `test/unit/toolsets/gists.test.ts` (read-tool tests only)

**Interfaces:**
- Consumes: `paginationSchema`, `toToolResult`, `toToolError` from `./common.js` (already exist, no modification needed).
- Produces (for Tasks 2 and 3 to extend): `registerGistsTools(server: McpServer, octokit: Octokit, permission: 'read-only' | 'read-write'): void`

- [x] **Step 1: Write the failing tests for the read tools**

Create `test/unit/toolsets/gists.test.ts`:

```typescript
import nock from 'nock';
import { afterEach, describe, expect, it } from 'vitest';
import { registerGistsTools } from '../../../src/toolsets/gists.js';
import { connectedClient } from './test-helpers.js';

describe('registerGistsTools', () => {
  afterEach(() => {
    nock.cleanAll();
  });

  it('registers list_gists and returns the raw GitHub response as JSON', async () => {
    nock('https://api.github.com')
      .get('/gists')
      .query({ page: '1', per_page: '30' })
      .reply(200, [
        {
          id: 'aa5a315d61ae9438b18d',
          description: 'Hello World',
          public: true,
          url: 'https://api.github.com/gists/aa5a315d61ae9438b18d',
        },
      ]);

    const client = await connectedClient(registerGistsTools, 'read-write');
    const result = await client.callTool({
      name: 'list_gists',
      arguments: {},
    });

    expect(result.isError).toBeFalsy();
    const text = (result.content as Array<{ type: string; text: string }>)[0]?.text ?? '';
    expect(JSON.parse(text)).toEqual([
      {
        id: 'aa5a315d61ae9438b18d',
        description: 'Hello World',
        public: true,
        url: 'https://api.github.com/gists/aa5a315d61ae9438b18d',
      },
    ]);
  });

  it('forwards explicit page and per_page to list_gists on the wire', async () => {
    const scope = nock('https://api.github.com')
      .get('/gists')
      .query({ page: '2', per_page: '10' })
      .reply(200, []);

    const client = await connectedClient(registerGistsTools, 'read-write');
    const result = await client.callTool({
      name: 'list_gists',
      arguments: { page: 2, per_page: 10 },
    });

    expect(result.isError).toBeFalsy();
    expect(scope.isDone()).toBe(true);
  });

  it('registers get_gist and returns the raw GitHub response as JSON', async () => {
    nock('https://api.github.com')
      .get('/gists/aa5a315d61ae9438b18d')
      .reply(200, {
        id: 'aa5a315d61ae9438b18d',
        description: 'Hello World',
        public: true,
        files: {
          'hello.rb': {
            filename: 'hello.rb',
            type: 'application/x-ruby',
            language: 'Ruby',
            raw_url: 'https://gist.githubusercontent.com/raw/hello.rb',
            size: 167,
            content: 'puts "Hello, World!"',
          },
        },
      });

    const client = await connectedClient(registerGistsTools, 'read-write');
    const result = await client.callTool({
      name: 'get_gist',
      arguments: { gist_id: 'aa5a315d61ae9438b18d' },
    });

    expect(result.isError).toBeFalsy();
    const text = (result.content as Array<{ type: string; text: string }>)[0]?.text ?? '';
    expect(JSON.parse(text)).toMatchObject({
      id: 'aa5a315d61ae9438b18d',
      description: 'Hello World',
    });
  });

  it('propagates a 404 from get_gist as an MCP tool error', async () => {
    nock('https://api.github.com')
      .get('/gists/nonexistent-gist-id-xyz')
      .reply(404, { message: 'Not Found', documentation_url: 'https://docs.github.com/rest' });

    const client = await connectedClient(registerGistsTools, 'read-write');
    const result = await client.callTool({
      name: 'get_gist',
      arguments: { gist_id: 'nonexistent-gist-id-xyz' },
    });

    expect(result.isError).toBe(true);
    const text = (result.content as Array<{ type: string; text: string }>)[0]?.text ?? '';
    expect(text).toContain('Not Found');
  });

  it('registers exactly 2 read tools in read-only mode', async () => {
    const client = await connectedClient(registerGistsTools, 'read-only');
    const { tools } = await client.listTools();
    expect(tools.map((t) => t.name).sort()).toEqual(['get_gist', 'list_gists']);
  });
});
```

- [x] **Step 2: Run tests to verify they fail**

Run: `npm test -- gists`
Expected: FAIL with a module-not-found error for `../../../src/toolsets/gists.js`.

- [x] **Step 3: Create `src/toolsets/gists.ts` with the 2 read tools**

```typescript
import type { McpServer } from '@modelcontextprotocol/server';
import type { Octokit } from 'octokit';
import { z } from 'zod';
import { paginationSchema, toToolError, toToolResult } from './common.js';

export function registerGistsTools(
  server: McpServer,
  octokit: Octokit,
  permission: 'read-only' | 'read-write',
): void {
  server.registerTool(
    'list_gists',
    {
      description:
        'List gists for the authenticated user. Returns an array of base-gist objects including id, description, public flag, file list (names and metadata, but not full content), and owner. Paginate with page and per_page. To get full file content for a specific gist, call get_gist with its id.',
      inputSchema: z.object({
        since: z
          .string()
          .optional()
          .describe(
            'ISO 8601 timestamp (YYYY-MM-DDTHH:MM:SSZ). Only return gists updated at or after this time.',
          ),
        ...paginationSchema,
      }),
    },
    async ({ since, page, per_page }) => {
      try {
        const response = await octokit.rest.gists.list({ since, page, per_page });
        return toToolResult(response.data);
      } catch (error) {
        return toToolError(error);
      }
    },
  );

  server.registerTool(
    'get_gist',
    {
      description:
        'Get a single gist by its id. Returns a gist-simple object with full file content, description, public flag, owner, forks_url, commits_url, and history. File content is included inline (up to the truncation threshold — very large files include a raw_url instead).',
      inputSchema: z.object({
        gist_id: z.string().describe('The unique identifier of the gist.'),
      }),
    },
    async ({ gist_id }) => {
      try {
        const response = await octokit.rest.gists.get({ gist_id });
        return toToolResult(response.data);
      } catch (error) {
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

- [x] **Step 4: Run tests to verify they pass**

Run: `npm test -- gists`
Expected: PASS (5 tests).

- [x] **Step 5: Typecheck and lint**

Run: `npm run typecheck && npm run lint`
Expected: both PASS with zero errors.

- [x] **Step 6: Stage `cspell.json` if any test fixture strings trigger cspell errors**

cspell runs on staged files during pre-commit. The test file above uses `'aa5a315d61ae9438b18d'` (a real GitHub gist ID used in GitHub's own API docs — not a dictionary word, but cspell ignores hex-like strings by default) and `'hello.rb'`, `'nonexistent-gist-id-xyz'`. These should be fine without additions. If cspell fails during commit on any fixture string (e.g., `'Gistfile'`, `'gist-simple'`, or similar), add the offending word to the `words` array in `cspell.json` and stage it alongside the source files in the same commit.

- [x] **Step 7: Commit**

```bash
git add src/toolsets/gists.ts test/unit/toolsets/gists.test.ts
git commit -m "feat: add gists toolset read tools (list_gists, get_gist)"
```

---

## Task 2: Implement the `gists` toolset — write tools (`create_gist`, `update_gist`, `delete_gist`) and their tests

**Files:**
- Modify: `src/toolsets/gists.ts` (replace the `if (permission === 'read-write') { }` placeholder with real write-tool bodies)
- Modify: `test/unit/toolsets/gists.test.ts` (append write-tool and permission-gate tests inside the existing `describe` block)

**Interfaces:**
- Consumes: same `registerGistsTools` function from Task 1 — this task adds write tools to it, not replaces it.
- Produces: `create_gist`, `update_gist`, `delete_gist` are registered only when `permission === 'read-write'`.

- [x] **Step 1: Write the failing tests for the write tools**

Append the following tests inside the existing `describe('registerGistsTools', ...)` block in `test/unit/toolsets/gists.test.ts`, right before the closing `});`:

```typescript
  it('registers create_gist and returns the raw GitHub response as JSON', async () => {
    nock('https://api.github.com')
      .post('/gists', {
        files: { 'hello.rb': { content: 'puts "Hello, World!"' } },
        description: 'A hello-world gist',
        public: false,
      })
      .reply(201, {
        id: 'aa5a315d61ae9438b18d',
        description: 'A hello-world gist',
        public: false,
        files: {
          'hello.rb': {
            filename: 'hello.rb',
            content: 'puts "Hello, World!"',
          },
        },
      });

    const client = await connectedClient(registerGistsTools, 'read-write');
    const result = await client.callTool({
      name: 'create_gist',
      arguments: {
        files: { 'hello.rb': { content: 'puts "Hello, World!"' } },
        description: 'A hello-world gist',
        public: false,
      },
    });

    expect(result.isError).toBeFalsy();
    const text = (result.content as Array<{ type: string; text: string }>)[0]?.text ?? '';
    expect(JSON.parse(text)).toMatchObject({
      id: 'aa5a315d61ae9438b18d',
      description: 'A hello-world gist',
    });
  });

  it('registers update_gist and returns the raw GitHub response as JSON', async () => {
    nock('https://api.github.com')
      .patch('/gists/aa5a315d61ae9438b18d', {
        description: 'Updated description',
        files: { 'hello.rb': { content: 'puts "Updated!"' } },
      })
      .reply(200, {
        id: 'aa5a315d61ae9438b18d',
        description: 'Updated description',
        files: {
          'hello.rb': {
            filename: 'hello.rb',
            content: 'puts "Updated!"',
          },
        },
      });

    const client = await connectedClient(registerGistsTools, 'read-write');
    const result = await client.callTool({
      name: 'update_gist',
      arguments: {
        gist_id: 'aa5a315d61ae9438b18d',
        description: 'Updated description',
        files: { 'hello.rb': { content: 'puts "Updated!"' } },
      },
    });

    expect(result.isError).toBeFalsy();
    const text = (result.content as Array<{ type: string; text: string }>)[0]?.text ?? '';
    expect(JSON.parse(text)).toMatchObject({ description: 'Updated description' });
  });

  it('registers delete_gist and returns a synthetic deleted:true result', async () => {
    nock('https://api.github.com')
      .delete('/gists/aa5a315d61ae9438b18d')
      .reply(204);

    const client = await connectedClient(registerGistsTools, 'read-write');
    const result = await client.callTool({
      name: 'delete_gist',
      arguments: { gist_id: 'aa5a315d61ae9438b18d' },
    });

    expect(result.isError).toBeFalsy();
    const text = (result.content as Array<{ type: string; text: string }>)[0]?.text ?? '';
    expect(JSON.parse(text)).toEqual({ deleted: true });
  });

  it('propagates a 403 from delete_gist as an MCP tool error', async () => {
    nock('https://api.github.com')
      .delete('/gists/aa5a315d61ae9438b18d')
      .reply(403, { message: 'Forbidden', documentation_url: 'https://docs.github.com/rest' });

    const client = await connectedClient(registerGistsTools, 'read-write');
    const result = await client.callTool({
      name: 'delete_gist',
      arguments: { gist_id: 'aa5a315d61ae9438b18d' },
    });

    expect(result.isError).toBe(true);
    const text = (result.content as Array<{ type: string; text: string }>)[0]?.text ?? '';
    expect(text).toContain('Forbidden');
  });

  it('does not register any write tool in read-only mode', async () => {
    const client = await connectedClient(registerGistsTools, 'read-only');
    const { tools } = await client.listTools();
    const names = tools.map((t) => t.name);
    expect(names).not.toContain('create_gist');
    expect(names).not.toContain('update_gist');
    expect(names).not.toContain('delete_gist');
  });

  it('registers all 5 gist tools in read-write mode', async () => {
    const client = await connectedClient(registerGistsTools, 'read-write');
    const { tools } = await client.listTools();
    expect(tools.map((t) => t.name).sort()).toEqual([
      'create_gist',
      'delete_gist',
      'get_gist',
      'list_gists',
      'update_gist',
    ]);
  });
```

- [x] **Step 2: Run tests to verify they fail**

Run: `npm test -- gists`
Expected: FAIL — the 4 write-tool tests fail with "Tool not found" (`ProtocolError`); the permission/count tests may fail depending on assertion direction. Re-run after Step 3.

- [x] **Step 3: Add the write tools to `src/toolsets/gists.ts`**

Replace the `if (permission === 'read-write') { // Write tools added in Task 2. }` placeholder (or add the block at the end of `registerGistsTools` if Task 1's lint step removed it) with:

```typescript
  if (permission === 'read-write') {
    server.registerTool(
      'create_gist',
      {
        description:
          'Create a new gist. A gist is a shareable snippet or small file. Supply one or more files with their content; each file key is the filename (including extension). Set public to true to make the gist visible to all GitHub users, or false (default) for a secret gist (unlisted but accessible by direct URL).',
        inputSchema: z.object({
          files: z
            .record(
              z.string(),
              z.object({
                content: z.string().describe('File content.'),
              }),
            )
            .describe(
              'Files that make up the gist. Each key is the filename (e.g. "hello.rb") and each value is an object with a content field.',
            ),
          description: z.string().optional().describe('Description of the gist.'),
          public: z
            .boolean()
            .optional()
            .describe('Whether the gist is public (true) or secret (false, default).'),
        }),
      },
      async ({ files, description, public: isPublic }) => {
        try {
          const response = await octokit.rest.gists.create({
            files,
            description,
            public: isPublic,
          });
          return toToolResult(response.data);
        } catch (error) {
          return toToolError(error);
        }
      },
    );

    server.registerTool(
      'update_gist',
      {
        description:
          'Update an existing gist. You can change the description and/or update, rename, or delete individual files. To update a file, supply its current filename as the key with new content or a new filename. To delete a file, supply its current filename as the key with a null value. Files not mentioned in the request are left unchanged.',
        inputSchema: z.object({
          gist_id: z.string().describe('The unique identifier of the gist to update.'),
          description: z.string().optional().describe('New description for the gist.'),
          files: z
            .record(
              z.string(),
              z
                .union([
                  z.object({
                    content: z.string().optional().describe('New file content.'),
                    filename: z
                      .string()
                      .nullable()
                      .optional()
                      .describe('New filename. Set to null to delete the file.'),
                  }),
                  z.null(),
                ])
                .optional(),
            )
            .optional()
            .describe(
              'Files to update. Each key is the current filename. Set a value to null to delete that file. Omit a file to leave it unchanged.',
            ),
        }),
      },
      async ({ gist_id, description, files }) => {
        try {
          const response = await octokit.rest.gists.update({
            gist_id,
            description,
            files: files as Parameters<typeof octokit.rest.gists.update>[0]['files'],
          });
          return toToolResult(response.data);
        } catch (error) {
          return toToolError(error);
        }
      },
    );

    server.registerTool(
      'delete_gist',
      {
        description: 'Delete a gist. This action is permanent and cannot be undone. Only the gist owner can delete it.',
        inputSchema: z.object({
          gist_id: z.string().describe('The unique identifier of the gist to delete.'),
        }),
      },
      async ({ gist_id }) => {
        try {
          await octokit.rest.gists.delete({ gist_id });
          return toToolResult({ deleted: true });
        } catch (error) {
          return toToolError(error);
        }
      },
    );
  }
```

**Note on `update_gist`'s `files` cast:** The `files` parameter in `gists.update` has a complex nullable-record type in `@octokit/openapi-types` (`{ [key: string]: { content?: string; filename?: string | null } | null } | null`). Zod's `z.record` + `z.union([..., z.null()])` models the per-entry nullability correctly, but TypeScript will raise a type mismatch on the optional-chain structure vs. the generated type. The `as Parameters<typeof octokit.rest.gists.update>[0]['files']` cast resolves this without weakening the runtime schema — the values accepted at call time are structurally compatible with what octokit expects. If this cast triggers a lint error, use `as never` as a last resort (consistent with how the codebase handles other `never`-typed response bodies). Do NOT widen the Zod schema to bypass this — the schema is correct and the cast is only for TypeScript's benefit.

**Alternative (simpler) implementation for `update_gist` files if the cast causes issues:**

If the union-with-null record type causes persistent type errors that the cast cannot resolve, simplify the `files` schema to `z.record(z.string(), z.unknown()).optional()` and remove the cast. This is slightly less descriptive for the LLM but avoids the TypeScript complexity entirely, consistent with the "thin schema" philosophy. Mention this substitution in the commit message if applied.

- [x] **Step 4: Run tests to verify they pass**

Run: `npm test -- gists`
Expected: PASS (11 tests: 5 from Task 1 + 6 new).

- [x] **Step 5: Typecheck, lint, and full suite**

Run: `npm run typecheck && npm run lint && npm test`
Expected: all PASS. The full suite total is 83 (prior total after `users`) + 11 = 94 tests.

- [x] **Step 6: Stage `cspell.json` if needed**

If any string in the test file triggers a cspell failure at commit time (e.g., `'Gistfile'` or fixture-specific tokens), add the word to `cspell.json`'s `words` array and stage it alongside the source files:

```bash
git add cspell.json  # only if cspell.json was modified
git add src/toolsets/gists.ts test/unit/toolsets/gists.test.ts
git commit -m "feat: add gists toolset write tools (create_gist, update_gist, delete_gist)"
```

If `cspell.json` was not modified, omit it from the staging command.

---

## Task 3: Wire `registerGistsTools` into `server.ts` and update README

**Files:**
- Modify: `src/server.ts`
- Modify: `README.md`

**Interfaces:**
- Consumes: `registerGistsTools(server, octokit, permission)` from Task 2.
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

Replace with (new import sorted alphabetically alongside existing imports):

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

- [x] **Step 2: Run the full test suite**

Run: `npm test`
Expected: PASS, same 94 tests as after Task 2.

- [x] **Step 3: Typecheck, lint, and build**

Run: `npm run typecheck && npm run lint && npm run build`
Expected: all PASS. The build step confirms `dist/cli.js`'s bundled dependency graph transitively includes `gists.ts`.

- [x] **Step 4: Update `README.md`'s Toolsets section**

Append to the "Currently implemented" list (after the existing `users` bullet):

```markdown
- `gists` — list, get, create, update, and delete gists
```

- [x] **Step 5: Manual end-to-end smoke test**

Run:
```bash
GITHUB_TOKEN=fake-token node dist/cli.js --transport=http --port=3995 &
sleep 1
curl -s -D /tmp/mcp-gists-init-headers.txt -X POST http://localhost:3995/mcp \
  -H 'Content-Type: application/json' \
  -H 'Accept: application/json, text/event-stream' \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"smoke-test","version":"0.0.0"}}}'
SESSION=$(grep -i mcp-session-id /tmp/mcp-gists-init-headers.txt | awk '{print $2}' | tr -d '\r')
curl -s -X POST http://localhost:3995/mcp \
  -H 'Content-Type: application/json' \
  -H 'Accept: application/json, text/event-stream' \
  -H "Mcp-Session-Id: $SESSION" \
  -d '{"jsonrpc":"2.0","id":2,"method":"tools/list","params":{}}'
kill %1
```

Expected: the `tools/list` response includes `list_gists`, `get_gist`, `create_gist`, `update_gist`, and `delete_gist` — plus all 40 previously-shipped tools — proving all six toolsets are live in the same server with no duplicate-registration crash.

- [x] **Step 6: Commit**

```bash
git add src/server.ts README.md
git commit -m "feat: wire gists toolset into buildServer"
```

---

## Deliberate Scope Decisions

The following `octokit.rest.gists.*` methods are **intentionally excluded** from this toolset. Each exclusion is justified below.

1. **`gists.listForUser` (GET `/users/{username}/gists`) — out of scope.** Lists the public gists for a specific user by username. The primary use case (`list_gists`) lists the authenticated user's own gists. Listing another user's gists is a niche cross-user operation that blurs the "gists as your own snippets" surface this toolset covers. An LLM searching for a user's gists can use `search_code` or construct a direct API call. Can be added in a follow-up without disturbing the 5-tool surface.

2. **`gists.listPublic` (GET `/gists/public`) — out of scope.** Lists all public gists globally, sorted by most recently updated. This is a firehose endpoint with no useful per-session signal; `list_gists` already covers the authenticated user's public and secret gists. A global public gist directory adds no LLM-agentic value and would produce confusingly large responses without meaningful filtering.

3. **`gists.listStarred` (GET `/gists/starred`) — out of scope.** Lists the authenticated user's starred gists. Starred-gist management is secondary functionality compared to the core CRUD surface. Can be added alongside star/unstar (below) in a follow-up that covers gist social features holistically.

4. **`gists.star` / `gists.unstar` / `gists.checkIsStarred` (PUT/DELETE/GET `/gists/{gist_id}/star`) — out of scope.** Star and unstar are mutating social actions. `checkIsStarred` returns a 204/404 with no body — it communicates its answer via HTTP status code only, which does not map cleanly to the `toToolResult` raw-JSON pattern (the same reason `users.checkFollowingForUser` was excluded from the `users` toolset). All three belong together in a future social-features addition.

5. **`gists.listComments` / `gists.getComment` / `gists.createComment` / `gists.updateComment` / `gists.deleteComment` (GET/POST/PATCH/DELETE on `/gists/{gist_id}/comments`) — out of scope.** Comment management is secondary functionality relative to gist CRUD. The full comment CRUD surface (5 additional tools) would roughly double the toolset's tool count. Comments on gists are rarely the primary use case in agentic sessions; callers who need gist comments can access them via the `html_url` field of `get_gist`. A follow-up plan can add `list_gist_comments`, `create_gist_comment`, etc. using the `_gist_comment` suffix to avoid collision with `list_comments` (issues toolset) and `add_comment` (issues toolset).

6. **`gists.listCommits` (GET `/gists/{gist_id}/commits`) — out of scope.** Returns the revision history of a gist. Useful for diffing gist versions, but niche compared to the core CRUD operations. `getRevision` (see below) is the more targeted complement when a specific historical version is needed.

7. **`gists.getRevision` (GET `/gists/{gist_id}/{sha}`) — out of scope.** Returns a specific historical revision of a gist by commit SHA. Requires knowing a SHA (obtained from `listCommits`), making it only useful in combination with the also-excluded `listCommits`. Both belong together in a follow-up revision-history plan.

8. **`gists.listForks` / `gists.fork` (GET/POST `/gists/{gist_id}/forks`) — out of scope.** Fork management is a social/collaboration operation secondary to core CRUD. `fork` is a write operation; `listForks` is a read operation but only meaningful alongside forking. Both are low-priority for agentic use cases.

---

## Self-Review Notes

**Verification checklist (all items confirmed):**

1. **Every tool name is collision-free.** `list_gists`, `get_gist`, `create_gist`, `update_gist`, `delete_gist` — none overlap with the 40 existing tool names verified via `python3 -c "import re, glob; ..."` above.

2. **Every octokit method exists.** Confirmed via:
   ```
   node --input-type=module -e "import { Octokit } from 'octokit'; const o = new Octokit({ auth: 'x' }); const m = o.rest.gists; for (const k of Object.keys(m).sort()) { const d = m[k].endpoint.DEFAULTS; console.log(k, '->', d.method, d.url); }"
   ```
   Output confirmed: `list -> GET /gists`, `get -> GET /gists/{gist_id}`, `create -> POST /gists`, `update -> PATCH /gists/{gist_id}`, `delete -> DELETE /gists/{gist_id}`.

3. **Read-only mode test uses `.toEqual([...exact 2 names sorted...])`.** Task 1, Step 1's last test: `expect(tools.map((t) => t.name).sort()).toEqual(['get_gist', 'list_gists'])` — strict equality, not `arrayContaining`.

4. **Read-write mode test verifies all 5 tools present.** Task 2, Step 1's last test: `expect(tools.map((t) => t.name).sort()).toEqual(['create_gist', 'delete_gist', 'get_gist', 'list_gists', 'update_gist'])` — strict equality with all 5 names sorted.

5. **Wire-level filter test on a list tool with query params.** Task 1, Step 1's second test: `scope = nock(...).query({ page: '2', per_page: '10' })` + `expect(scope.isDone()).toBe(true)` on `list_gists`. Confirms `page` and `per_page` are forwarded on the wire, not silently dropped.

6. **Signature matches required form.** `registerGistsTools(server: McpServer, octokit: Octokit, permission: 'read-only' | 'read-write'): void` — identical shape to every other `register*Tools` function. The `permission` parameter is used (not `_permission`) because this toolset has real write tools gated by it.

7. **Write tools inside `if (permission === 'read-write') { ... }`.** Task 2, Step 3 shows all three write tools (`create_gist`, `update_gist`, `delete_gist`) inside the `if` block. Matches `issues.ts` and `pull_requests.ts`.

8. **`delete_gist`'s 204 No Content handled with synthetic result.** Same rationale as `lock_issue`/`unlock_issue` — GitHub returns 204 with no body; `toToolResult({ deleted: true })` preserves the "always returns a JSON text block" contract.

9. **`cspell.json` staging instruction present.** Both Task 1 Step 6 and Task 2 Step 6 explicitly instruct the implementer to check for cspell failures at commit time and stage `cspell.json` if any fixture words trigger errors.

10. **No modification to `common.ts`.** `gist_id` is inlined as `z.string().describe(...)` directly in `gists.ts`. No other toolset needs `gist_id`, so extraction to `common.ts` would violate the "only extract if 2+ toolsets share it" rule.
