# github-mcp-server-js — `projects` Toolset Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans. Steps use checkbox (`- [x]`) syntax.

**Goal:** Add the `projects` toolset (5 read-only tools for GitHub Projects V2 org-scoped introspection) to `github-mcp-server-js`, following the established pattern.

**Architecture:** Same pattern as `search`/`users`/`packages`: one `registerProjectsTools(server, octokit, permission)` function; all tools read-only, so `_permission` underscore prefix and no write branch. `server.ts` gains one more registration call.

**Tech Stack:** Same as prior plans. No new dependencies.

## Global Constraints

- All 5 tools are read-only. `_permission` underscore prefix.
- Raw JSON passthrough; error passthrough via `toToolError`.
- List tools use `paginationSchema`.
- Zero collision with 77 existing tool names.
- All tools scoped to org projects (`projectsV2` API); user-scoped project tools omitted for consistency (see scope decisions).
- TypeScript only, no new dependencies.

---

## File Structure

```
src/toolsets/projects.ts, test/unit/toolsets/projects.test.ts, src/server.ts, README.md
```

---

## Reference: verified octokit shapes

The `octokit.rest.projects.*` methods target the ProjectsV2 API (superseded the legacy Projects Classic).

| Tool | octokit method | HTTP |
|---|---|---|
| `list_org_projects` | `projects.listForOrg` | GET `/orgs/{org}/projectsV2` |
| `get_org_project` | `projects.getForOrg` | GET `/orgs/{org}/projectsV2/{project_number}` |
| `list_org_project_items` | `projects.listItemsForOrg` | GET `/orgs/{org}/projectsV2/{project_number}/items` |
| `list_org_project_fields` | `projects.listFieldsForOrg` | GET `/orgs/{org}/projectsV2/{project_number}/fields` |
| `get_org_project_item` | `projects.getOrgItem` | GET `/orgs/{org}/projectsV2/{project_number}/items/{item_id}` |

**Deliberate scope decisions:**

1. **User-scoped projects omitted:** `listForUser`, `getForUser`, `listItemsForUser`, etc. Reason: keep the toolset surface consistent (all org-scoped); user projects can be inferred by mapping the authenticated user to their org projects when needed. Adding user-scoped variants would double the tool count without proportional utility gain.

2. **Write operations omitted:** `addItemForOrg`/`addItemForUser`, `deleteItemForOrg`/`deleteItemForUser`, `updateItemForOrg`/`updateItemForUser`. Reason: Projects V2 item mutation has complex semantics (field-specific value shapes) that warrant a dedicated follow-up plan for safety; keeping v1 read-only.

3. **Project Classic excluded entirely:** GitHub deprecated the classic Projects API in favor of ProjectsV2 (see the `deprecated` tags on `teams/list-projects-in-org` etc.). No classic project tools are exposed.

---

## Task 1: Implement projects toolset

**Files:** Create `src/toolsets/projects.ts` and `test/unit/toolsets/projects.test.ts`.

- [x] **Step 1: Write failing tests**

```typescript
// test/unit/toolsets/projects.test.ts
import nock from 'nock';
import { afterEach, describe, expect, it } from 'vitest';
import { registerProjectsTools } from '../../../src/toolsets/projects.js';
import { connectedClient } from './test-helpers.js';

describe('registerProjectsTools', () => {
  afterEach(() => {
    nock.cleanAll();
  });

  it('registers list_org_projects and returns the raw response as JSON', async () => {
    nock('https://api.github.com')
      .get('/orgs/acme/projectsV2')
      .query({ page: '1', per_page: '30' })
      .reply(200, [{ id: 1, number: 1, title: 'Roadmap' }]);

    const client = await connectedClient(registerProjectsTools, 'read-write');
    const result = await client.callTool({
      name: 'list_org_projects',
      arguments: { org: 'acme' },
    });

    expect(result.isError).toBeFalsy();
    const text = (result.content as Array<{ type: string; text: string }>)[0]?.text ?? '';
    expect(JSON.parse(text)).toEqual([{ id: 1, number: 1, title: 'Roadmap' }]);
  });

  it('forwards pagination on list_org_projects to the wire', async () => {
    const scope = nock('https://api.github.com')
      .get('/orgs/acme/projectsV2')
      .query({ page: '2', per_page: '50' })
      .reply(200, []);

    const client = await connectedClient(registerProjectsTools, 'read-write');
    const result = await client.callTool({
      name: 'list_org_projects',
      arguments: { org: 'acme', page: 2, per_page: 50 },
    });

    expect(result.isError).toBeFalsy();
    expect(scope.isDone()).toBe(true);
  });

  it('registers get_org_project and returns the raw response as JSON', async () => {
    nock('https://api.github.com')
      .get('/orgs/acme/projectsV2/1')
      .reply(200, { id: 1, number: 1, title: 'Roadmap' });

    const client = await connectedClient(registerProjectsTools, 'read-write');
    const result = await client.callTool({
      name: 'get_org_project',
      arguments: { org: 'acme', project_number: 1 },
    });

    expect(result.isError).toBeFalsy();
    const text = (result.content as Array<{ type: string; text: string }>)[0]?.text ?? '';
    expect(JSON.parse(text)).toMatchObject({ number: 1, title: 'Roadmap' });
  });

  it('propagates a 404 from get_org_project as an MCP tool error', async () => {
    nock('https://api.github.com')
      .get('/orgs/acme/projectsV2/999')
      .reply(404, { message: 'Not Found' });

    const client = await connectedClient(registerProjectsTools, 'read-write');
    const result = await client.callTool({
      name: 'get_org_project',
      arguments: { org: 'acme', project_number: 999 },
    });

    expect(result.isError).toBe(true);
    const text = (result.content as Array<{ type: string; text: string }>)[0]?.text ?? '';
    expect(text).toContain('Not Found');
  });

  it('registers list_org_project_items and returns the raw response as JSON', async () => {
    nock('https://api.github.com')
      .get('/orgs/acme/projectsV2/1/items')
      .query({ page: '1', per_page: '30' })
      .reply(200, [{ id: 100, content_type: 'Issue' }]);

    const client = await connectedClient(registerProjectsTools, 'read-write');
    const result = await client.callTool({
      name: 'list_org_project_items',
      arguments: { org: 'acme', project_number: 1 },
    });

    expect(result.isError).toBeFalsy();
    const text = (result.content as Array<{ type: string; text: string }>)[0]?.text ?? '';
    expect(JSON.parse(text)).toEqual([{ id: 100, content_type: 'Issue' }]);
  });

  it('registers list_org_project_fields and returns the raw response as JSON', async () => {
    nock('https://api.github.com')
      .get('/orgs/acme/projectsV2/1/fields')
      .query({ page: '1', per_page: '30' })
      .reply(200, [{ id: 10, name: 'Status', data_type: 'SINGLE_SELECT' }]);

    const client = await connectedClient(registerProjectsTools, 'read-write');
    const result = await client.callTool({
      name: 'list_org_project_fields',
      arguments: { org: 'acme', project_number: 1 },
    });

    expect(result.isError).toBeFalsy();
    const text = (result.content as Array<{ type: string; text: string }>)[0]?.text ?? '';
    expect(JSON.parse(text)).toEqual([{ id: 10, name: 'Status', data_type: 'SINGLE_SELECT' }]);
  });

  it('registers get_org_project_item and returns the raw response as JSON', async () => {
    nock('https://api.github.com')
      .get('/orgs/acme/projectsV2/1/items/100')
      .reply(200, { id: 100, content_type: 'Issue', title: 'Bug' });

    const client = await connectedClient(registerProjectsTools, 'read-write');
    const result = await client.callTool({
      name: 'get_org_project_item',
      arguments: { org: 'acme', project_number: 1, item_id: 100 },
    });

    expect(result.isError).toBeFalsy();
    const text = (result.content as Array<{ type: string; text: string }>)[0]?.text ?? '';
    expect(JSON.parse(text)).toMatchObject({ id: 100 });
  });

  it('registers exactly the 5 tools in both permission modes', async () => {
    const expected = [
      'get_org_project',
      'get_org_project_item',
      'list_org_project_fields',
      'list_org_project_items',
      'list_org_projects',
    ];

    const roClient = await connectedClient(registerProjectsTools, 'read-only');
    expect((await roClient.listTools()).tools.map((t) => t.name).sort()).toEqual(expected);

    const rwClient = await connectedClient(registerProjectsTools, 'read-write');
    expect((await rwClient.listTools()).tools.map((t) => t.name).sort()).toEqual(expected);
  });
});
```

- [x] **Step 2: Run failing tests**

Run: `npm test -- projects` → FAIL (module not found).

- [x] **Step 3: Create `src/toolsets/projects.ts`**

```typescript
import type { McpServer } from '@modelcontextprotocol/server';
import type { Octokit } from 'octokit';
import { z } from 'zod';
import { paginationSchema, toToolResult, toToolError } from './common.js';

const orgSchema = {
  org: z.string().describe('Organization login.'),
};

const projectNumberSchema = {
  project_number: z.number().int().describe('The ProjectsV2 project number (visible in the project URL).'),
};

export function registerProjectsTools(
  server: McpServer,
  octokit: Octokit,
  _permission: 'read-only' | 'read-write',
): void {
  server.registerTool(
    'list_org_projects',
    {
      description: 'List GitHub ProjectsV2 projects in an organization.',
      inputSchema: z.object({ ...orgSchema, ...paginationSchema }),
    },
    async ({ org, page, per_page }) => {
      try {
        const response = await octokit.rest.projects.listForOrg({ org, page, per_page });
        return toToolResult(response.data);
      } catch (error) {
        return toToolError(error);
      }
    },
  );

  server.registerTool(
    'get_org_project',
    {
      description: 'Get a GitHub ProjectsV2 project by number in an organization.',
      inputSchema: z.object({ ...orgSchema, ...projectNumberSchema }),
    },
    async ({ org, project_number }) => {
      try {
        const response = await octokit.rest.projects.getForOrg({ org, project_number });
        return toToolResult(response.data);
      } catch (error) {
        return toToolError(error);
      }
    },
  );

  server.registerTool(
    'list_org_project_items',
    {
      description: 'List items in a GitHub ProjectsV2 project.',
      inputSchema: z.object({ ...orgSchema, ...projectNumberSchema, ...paginationSchema }),
    },
    async ({ org, project_number, page, per_page }) => {
      try {
        const response = await octokit.rest.projects.listItemsForOrg({ org, project_number, page, per_page });
        return toToolResult(response.data);
      } catch (error) {
        return toToolError(error);
      }
    },
  );

  server.registerTool(
    'list_org_project_fields',
    {
      description: 'List fields configured on a GitHub ProjectsV2 project.',
      inputSchema: z.object({ ...orgSchema, ...projectNumberSchema, ...paginationSchema }),
    },
    async ({ org, project_number, page, per_page }) => {
      try {
        const response = await octokit.rest.projects.listFieldsForOrg({ org, project_number, page, per_page });
        return toToolResult(response.data);
      } catch (error) {
        return toToolError(error);
      }
    },
  );

  server.registerTool(
    'get_org_project_item',
    {
      description: 'Get a single item in a GitHub ProjectsV2 project.',
      inputSchema: z.object({
        ...orgSchema,
        ...projectNumberSchema,
        item_id: z.number().int().describe('The project item ID.'),
      }),
    },
    async ({ org, project_number, item_id }) => {
      try {
        const response = await octokit.rest.projects.getOrgItem({ org, project_number, item_id });
        return toToolResult(response.data);
      } catch (error) {
        return toToolError(error);
      }
    },
  );
}
```

- [x] **Step 4: Run tests + full suite**

Run: `npm test -- projects` → 8 tests PASS. Then `npm test` → 171 + 8 = 179 passing.

- [x] **Step 5: Commit**

```bash
git add src/toolsets/projects.ts test/unit/toolsets/projects.test.ts
git commit -m "feat: add projects toolset (5 read-only ProjectsV2 tools)"
```

---

## Task 2: Wire into `server.ts` + README

- [x] **Step 1: Add alphabetical import for `registerProjectsTools`. Add call after `registerCodespacesTools`.**
- [x] **Step 2: Add README bullet after `codespaces`**: `- \`projects\` — list and inspect GitHub ProjectsV2 org projects, items, and fields`
- [x] **Step 3: `npm test && npm run typecheck && npm run lint && npm run build` all PASS.**
- [x] **Step 4: Commit**: `git commit -m "feat: wire projects toolset into buildServer"`
