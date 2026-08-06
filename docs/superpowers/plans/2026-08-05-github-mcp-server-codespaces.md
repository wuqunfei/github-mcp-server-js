# github-mcp-server-js — `codespaces` Toolset Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Add the `codespaces` toolset (5 tools: 2 read for listing/inspecting the authenticated user's codespaces + 3 write for creating/starting/stopping them) to `github-mcp-server-js`, following the established pattern.

**Architecture:** Same pattern as `issues`/`gists`/`activity`/`orgs_teams`: one `registerCodespacesTools(server, octokit, permission)` function; every handler wraps its octokit call in try/catch, returning raw JSON via `toToolResult`/`toToolError`; write tools are registered only when `permission === 'read-write'`; `server.ts` gains one more registration call. All octokit calls target authenticated-user endpoints (`codespaces.*ForAuthenticatedUser`) — org-scoped codespace endpoints are excluded (see scope decisions).

**Tech Stack:** Same as prior plans. No new dependencies.

## Global Constraints

- Raw JSON passthrough; raw error passthrough via `toToolError`.
- List tool uses `paginationSchema`.
- Write tools registered inside `if (permission === 'read-write')`.
- Zero collision with 72 existing tool names (verified: codespace tool names all have `codespace` in them, no conflict with existing names).
- TypeScript only, no new runtime dependencies.

---

## File Structure

```
src/toolsets/codespaces.ts        # NEW
test/unit/toolsets/codespaces.test.ts  # NEW
src/server.ts                     # MODIFIED
README.md                          # MODIFIED
```

---

## Reference: verified octokit shapes

| Tool | octokit method | HTTP | Params |
|---|---|---|---|
| `list_codespaces` | `codespaces.listForAuthenticatedUser` | GET `/user/codespaces` | query: `repository_id`, `page`, `per_page` |
| `get_codespace` | `codespaces.getForAuthenticatedUser` | GET `/user/codespaces/{codespace_name}` | path: `codespace_name` |
| `create_codespace_in_repo` | `codespaces.createWithRepoForAuthenticatedUser` | POST `/repos/{owner}/{repo}/codespaces` | path: `owner`, `repo`; body: `ref` (optional), `location` (optional), `machine` (optional), `devcontainer_path` (optional), `working_directory` (optional), `display_name` (optional) |
| `start_codespace` | `codespaces.startForAuthenticatedUser` | POST `/user/codespaces/{codespace_name}/start` | path: `codespace_name` |
| `stop_codespace` | `codespaces.stopForAuthenticatedUser` | POST `/user/codespaces/{codespace_name}/stop` | path: `codespace_name` |

Response bodies:
- `list_codespaces` → `{ total_count, codespaces: codespace[] }`
- `get_codespace`, `create_codespace_in_repo`, `start_codespace`, `stop_codespace` → `codespace`

**Deliberate scope decisions:**

1. **Excluded org-scoped codespace management:** `listInOrganization`, `getCodespacesForUserInOrg`, `deleteFromOrganization`, `stopInOrganization`. Reason: org codespace admin is a niche org-admin surface not aligned with the design's user-focused scope.
2. **Excluded codespace secrets management:** every `*Secret*`, `*PublicKey*` method. Reason: secret handling is high-risk and warrants a dedicated plan if needed.
3. **Excluded delete/publish/export:** `deleteForAuthenticatedUser`, `publishForAuthenticatedUser`, `exportForAuthenticatedUser`. Reason: destructive/rare-workflow operations preferred to be human-driven.
4. **Excluded devcontainer discovery:** `listDevcontainersInRepositoryForAuthenticatedUser`, `checkPermissionsForDevcontainer`, `preFlightWithRepoForAuthenticatedUser`, `repoMachinesForAuthenticatedUser`. Reason: LLM callers typically know which devcontainer/machine they want; these introspection tools add surface without high LLM-utility value at v1 scope.

---

## Task 1: Implement the `codespaces` toolset

**Files:**
- Create: `src/toolsets/codespaces.ts`
- Test: `test/unit/toolsets/codespaces.test.ts`

- [x] **Step 1: Write the failing tests**

```typescript
// test/unit/toolsets/codespaces.test.ts
import nock from 'nock';
import { afterEach, describe, expect, it } from 'vitest';
import { registerCodespacesTools } from '../../../src/toolsets/codespaces.js';
import { connectedClient } from './test-helpers.js';

describe('registerCodespacesTools', () => {
  afterEach(() => {
    nock.cleanAll();
  });

  it('registers list_codespaces and returns the raw envelope as JSON', async () => {
    nock('https://api.github.com')
      .get('/user/codespaces')
      .query({ page: '1', per_page: '30' })
      .reply(200, { total_count: 1, codespaces: [{ name: 'cs-1', state: 'Available' }] });

    const client = await connectedClient(registerCodespacesTools, 'read-write');
    const result = await client.callTool({
      name: 'list_codespaces',
      arguments: {},
    });

    expect(result.isError).toBeFalsy();
    const text = (result.content as Array<{ type: string; text: string }>)[0]?.text ?? '';
    expect(JSON.parse(text)).toEqual({ total_count: 1, codespaces: [{ name: 'cs-1', state: 'Available' }] });
  });

  it('forwards repository_id filter on list_codespaces to the wire', async () => {
    const scope = nock('https://api.github.com')
      .get('/user/codespaces')
      .query({ repository_id: '42', page: '2', per_page: '10' })
      .reply(200, { total_count: 0, codespaces: [] });

    const client = await connectedClient(registerCodespacesTools, 'read-write');
    const result = await client.callTool({
      name: 'list_codespaces',
      arguments: { repository_id: 42, page: 2, per_page: 10 },
    });

    expect(result.isError).toBeFalsy();
    expect(scope.isDone()).toBe(true);
  });

  it('registers get_codespace and returns the raw response as JSON', async () => {
    nock('https://api.github.com')
      .get('/user/codespaces/cs-1')
      .reply(200, { name: 'cs-1', state: 'Available' });

    const client = await connectedClient(registerCodespacesTools, 'read-write');
    const result = await client.callTool({
      name: 'get_codespace',
      arguments: { codespace_name: 'cs-1' },
    });

    expect(result.isError).toBeFalsy();
    const text = (result.content as Array<{ type: string; text: string }>)[0]?.text ?? '';
    expect(JSON.parse(text)).toMatchObject({ name: 'cs-1' });
  });

  it('propagates a 404 from get_codespace as an MCP tool error', async () => {
    nock('https://api.github.com')
      .get('/user/codespaces/missing')
      .reply(404, { message: 'Not Found' });

    const client = await connectedClient(registerCodespacesTools, 'read-write');
    const result = await client.callTool({
      name: 'get_codespace',
      arguments: { codespace_name: 'missing' },
    });

    expect(result.isError).toBe(true);
    const text = (result.content as Array<{ type: string; text: string }>)[0]?.text ?? '';
    expect(text).toContain('Not Found');
  });

  it('registers create_codespace_in_repo and forwards optional body fields', async () => {
    nock('https://api.github.com')
      .post('/repos/acme/foo/codespaces', { ref: 'main', machine: 'basicLinux32gb' })
      .reply(201, { name: 'cs-new', state: 'Provisioning' });

    const client = await connectedClient(registerCodespacesTools, 'read-write');
    const result = await client.callTool({
      name: 'create_codespace_in_repo',
      arguments: { owner: 'acme', repo: 'foo', ref: 'main', machine: 'basicLinux32gb' },
    });

    expect(result.isError).toBeFalsy();
    const text = (result.content as Array<{ type: string; text: string }>)[0]?.text ?? '';
    expect(JSON.parse(text)).toMatchObject({ name: 'cs-new', state: 'Provisioning' });
  });

  it('registers start_codespace and returns the raw codespace response', async () => {
    nock('https://api.github.com')
      .post('/user/codespaces/cs-1/start')
      .reply(200, { name: 'cs-1', state: 'Starting' });

    const client = await connectedClient(registerCodespacesTools, 'read-write');
    const result = await client.callTool({
      name: 'start_codespace',
      arguments: { codespace_name: 'cs-1' },
    });

    expect(result.isError).toBeFalsy();
  });

  it('registers stop_codespace and returns the raw codespace response', async () => {
    nock('https://api.github.com')
      .post('/user/codespaces/cs-1/stop')
      .reply(200, { name: 'cs-1', state: 'Stopping' });

    const client = await connectedClient(registerCodespacesTools, 'read-write');
    const result = await client.callTool({
      name: 'stop_codespace',
      arguments: { codespace_name: 'cs-1' },
    });

    expect(result.isError).toBeFalsy();
  });

  it('registers exactly the 2 read tools in read-only mode', async () => {
    const client = await connectedClient(registerCodespacesTools, 'read-only');
    const { tools } = await client.listTools();
    expect(tools.map((t) => t.name).sort()).toEqual([
      'get_codespace',
      'list_codespaces',
    ]);
  });

  it('registers all 5 tools in read-write mode', async () => {
    const client = await connectedClient(registerCodespacesTools, 'read-write');
    const { tools } = await client.listTools();
    expect(tools.map((t) => t.name).sort()).toEqual([
      'create_codespace_in_repo',
      'get_codespace',
      'list_codespaces',
      'start_codespace',
      'stop_codespace',
    ]);
  });
});
```

- [x] **Step 2: Run tests to verify they fail**

Run: `npm test -- codespaces`
Expected: FAIL (module not found).

- [x] **Step 3: Create `src/toolsets/codespaces.ts`**

```typescript
import type { McpServer } from '@modelcontextprotocol/server';
import type { Octokit } from 'octokit';
import { z } from 'zod';
import { ownerRepoSchema, paginationSchema, toToolResult, toToolError } from './common.js';

const codespaceNameSchema = {
  codespace_name: z.string().describe('The name of the codespace (e.g. "octocat-happy-space-1234").'),
};

export function registerCodespacesTools(
  server: McpServer,
  octokit: Octokit,
  permission: 'read-only' | 'read-write',
): void {
  server.registerTool(
    'list_codespaces',
    {
      description: 'List codespaces for the authenticated user.',
      inputSchema: z.object({
        repository_id: z.number().int().optional().describe('Filter by repository ID.'),
        ...paginationSchema,
      }),
    },
    async ({ repository_id, page, per_page }) => {
      try {
        const response = await octokit.rest.codespaces.listForAuthenticatedUser({
          repository_id,
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
    'get_codespace',
    {
      description: 'Get a codespace by name for the authenticated user.',
      inputSchema: z.object({ ...codespaceNameSchema }),
    },
    async ({ codespace_name }) => {
      try {
        const response = await octokit.rest.codespaces.getForAuthenticatedUser({ codespace_name });
        return toToolResult(response.data);
      } catch (error) {
        return toToolError(error);
      }
    },
  );

  if (permission === 'read-write') {
    server.registerTool(
      'create_codespace_in_repo',
      {
        description: 'Create a codespace in a repository for the authenticated user.',
        inputSchema: z.object({
          ...ownerRepoSchema,
          ref: z.string().optional().describe('Git ref (branch/tag/SHA) to base the codespace on.'),
          location: z.string().optional().describe('Preferred Azure region (e.g. "WestUs2").'),
          machine: z.string().optional().describe('Machine type (e.g. "basicLinux32gb").'),
          devcontainer_path: z.string().optional().describe('Path to devcontainer.json inside the repo.'),
          working_directory: z.string().optional().describe('Working directory inside the codespace.'),
          display_name: z.string().optional().describe('Human-readable name for the codespace.'),
        }),
      },
      async ({ owner, repo, ref, location, machine, devcontainer_path, working_directory, display_name }) => {
        try {
          const response = await octokit.rest.codespaces.createWithRepoForAuthenticatedUser({
            owner,
            repo,
            ref,
            location,
            machine,
            devcontainer_path,
            working_directory,
            display_name,
          });
          return toToolResult(response.data);
        } catch (error) {
          return toToolError(error);
        }
      },
    );

    server.registerTool(
      'start_codespace',
      {
        description: 'Start a stopped codespace for the authenticated user.',
        inputSchema: z.object({ ...codespaceNameSchema }),
      },
      async ({ codespace_name }) => {
        try {
          const response = await octokit.rest.codespaces.startForAuthenticatedUser({ codespace_name });
          return toToolResult(response.data);
        } catch (error) {
          return toToolError(error);
        }
      },
    );

    server.registerTool(
      'stop_codespace',
      {
        description: 'Stop a running codespace for the authenticated user.',
        inputSchema: z.object({ ...codespaceNameSchema }),
      },
      async ({ codespace_name }) => {
        try {
          const response = await octokit.rest.codespaces.stopForAuthenticatedUser({ codespace_name });
          return toToolResult(response.data);
        } catch (error) {
          return toToolError(error);
        }
      },
    );
  }
}
```

- [x] **Step 4: Run tests, then full suite**

Run: `npm test -- codespaces` → PASS (9 tests). Then `npm test` → 162 (prior) + 9 = 171 passing.

- [x] **Step 5: Commit**

```bash
git add src/toolsets/codespaces.ts test/unit/toolsets/codespaces.test.ts
git commit -m "feat: add codespaces toolset (2 read + 3 write tools)"
```

---

## Task 2: Wire into `server.ts`

- [x] **Step 1: Modify `src/server.ts`**

Add alphabetically-sorted import for `registerCodespacesTools`. Add call after `registerOrgsTeamsTools` (ship-order).

- [x] **Step 2: Add README bullet after `orgs_teams`**

```markdown
- `codespaces` — list, inspect, create, start, and stop codespaces for the authenticated user
```

- [x] **Step 3: Run full CI checks**

`npm test && npm run typecheck && npm run lint && npm run build` — all must PASS.

- [x] **Step 4: Commit**

```bash
git add src/server.ts README.md
git commit -m "feat: wire codespaces toolset into buildServer"
```
