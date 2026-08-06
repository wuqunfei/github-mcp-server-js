# github-mcp-server-js — `code_security` Toolset Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development or superpowers:executing-plans. Checkboxes tracked with `- [x]` / `- [x]`.

**Goal:** Add the `code_security` toolset (10 read-only tools spanning code-scanning, secret-scanning, dependabot alerts, and security advisories) to `github-mcp-server-js`.

**Architecture:** Same pattern as `search`/`projects`: all-read-only, single `registerCodeSecurityTools(server, octokit, permission): void` function, `_permission` underscore prefix. No write branch. `server.ts` gains one registration call. Cross-namespace: uses `codeScanning`, `secretScanning`, `dependabot`, and `securityAdvisories` — all under a single `code_security` conceptual grouping per the design row.

**Tech Stack:** No new dependencies.

## Global Constraints

- All 10 tools read-only. `_permission` prefix.
- Raw JSON passthrough; errors via `toToolError`.
- List tools use `paginationSchema`.
- Zero collision with 82 existing tool names (verified: security-domain names have `alert` or `advisor` in them).
- All alert tools require `security_events` PAT scope for private repos, `public_repo` for public — document in tool descriptions.
- TypeScript only.

---

## File Structure

```
src/toolsets/code_security.ts, test/unit/toolsets/code_security.test.ts, src/server.ts, README.md
```

---

## Reference: verified octokit shapes

Confirmed against `@octokit/openapi-types/types.d.ts` lines 85228, 104975, 107431, 115372, and equivalent alert-fetch/advisory-fetch operations.

| Tool | octokit method | HTTP |
|---|---|---|
| `list_code_scanning_alerts` | `codeScanning.listAlertsForRepo` | GET `/repos/{owner}/{repo}/code-scanning/alerts` |
| `get_code_scanning_alert` | `codeScanning.getAlert` | GET `/repos/{owner}/{repo}/code-scanning/alerts/{alert_number}` |
| `list_secret_scanning_alerts` | `secretScanning.listAlertsForRepo` | GET `/repos/{owner}/{repo}/secret-scanning/alerts` |
| `get_secret_scanning_alert` | `secretScanning.getAlert` | GET `/repos/{owner}/{repo}/secret-scanning/alerts/{alert_number}` |
| `list_dependabot_alerts` | `dependabot.listAlertsForRepo` | GET `/repos/{owner}/{repo}/dependabot/alerts` |
| `get_dependabot_alert` | `dependabot.getAlert` | GET `/repos/{owner}/{repo}/dependabot/alerts/{alert_number}` |
| `list_global_advisories` | `securityAdvisories.listGlobalAdvisories` | GET `/advisories` |
| `get_global_advisory` | `securityAdvisories.getGlobalAdvisory` | GET `/advisories/{ghsa_id}` |
| `list_repository_advisories` | `securityAdvisories.listRepositoryAdvisories` | GET `/repos/{owner}/{repo}/security-advisories` |
| `get_repository_advisory` | `securityAdvisories.getRepositoryAdvisory` | GET `/repos/{owner}/{repo}/security-advisories/{ghsa_id}` |

**Deliberate scope decisions:**

1. **Alert update / dismissal excluded:** `codeScanning.updateAlert`, `secretScanning.updateAlert`, `dependabot.updateAlert`. Reason: dismissing/reopening security alerts is a security-critical action that warrants human review; LLM-driven state changes here are risky.
2. **Enterprise-scoped variants excluded:** `dependabot.listAlertsForEnterprise`. Reason: enterprise API requires Enterprise Server or GHEC-with-enterprise-token, out of scope for the general PAT-driven server.
3. **Org-scoped alert lists excluded:** `codeScanning.listAlertsForOrg`, `secretScanning.listAlertsForOrg`, `dependabot.listAlertsForOrg`. Reason: keep the toolset repo-scoped for consistency; the per-repo tools cover typical LLM workflows. Org-scoped can be added in a follow-up if needed.
4. **All secret-management surface excluded:** every `*Secret*`, `*PublicKey*` method under `dependabot`. Reason: not related to alert introspection; secret handling deserves a dedicated plan.
5. **All write / autofix / SARIF operations excluded:** `codeScanning.createAutofix`, `codeScanning.uploadSarif`, `codeScanning.deleteAnalysis`, `codeScanning.commitAutofix`, `secretScanning.createPushProtectionBypass`, `securityAdvisories.create*`/`update*`/`createFork`. Reason: these mutate security state or trigger workflow effects.
6. **Dependency Graph excluded (this plan):** `dependencyGraph.diffRange`, `dependencyGraph.exportSbom`. Reason: SBOM export and dependency-diff are distinct enough workflows to warrant their own follow-up plan if needed; keeping this toolset laser-focused on the "alerts + advisories" surface named in the design row (~10 tools).

---

## Task 1: Implement code_security toolset

- [x] **Step 1: Write the failing tests**

```typescript
// test/unit/toolsets/code_security.test.ts
import nock from 'nock';
import { afterEach, describe, expect, it } from 'vitest';
import { registerCodeSecurityTools } from '../../../src/toolsets/code_security.js';
import { connectedClient } from './test-helpers.js';

describe('registerCodeSecurityTools', () => {
  afterEach(() => nock.cleanAll());

  it('list_code_scanning_alerts returns raw JSON', async () => {
    nock('https://api.github.com')
      .get('/repos/acme/foo/code-scanning/alerts')
      .query({ page: '1', per_page: '30' })
      .reply(200, [{ number: 1, state: 'open' }]);

    const client = await connectedClient(registerCodeSecurityTools, 'read-write');
    const result = await client.callTool({
      name: 'list_code_scanning_alerts',
      arguments: { owner: 'acme', repo: 'foo' },
    });
    expect(result.isError).toBeFalsy();
    const text = (result.content as Array<{ type: string; text: string }>)[0]?.text ?? '';
    expect(JSON.parse(text)).toEqual([{ number: 1, state: 'open' }]);
  });

  it('list_code_scanning_alerts forwards filter/sort to the wire', async () => {
    const scope = nock('https://api.github.com')
      .get('/repos/acme/foo/code-scanning/alerts')
      .query({ tool_name: 'codeql', state: 'open', sort: 'created', direction: 'desc', page: '1', per_page: '30' })
      .reply(200, []);
    const client = await connectedClient(registerCodeSecurityTools, 'read-write');
    const result = await client.callTool({
      name: 'list_code_scanning_alerts',
      arguments: { owner: 'acme', repo: 'foo', tool_name: 'codeql', state: 'open', sort: 'created', direction: 'desc' },
    });
    expect(result.isError).toBeFalsy();
    expect(scope.isDone()).toBe(true);
  });

  it('get_code_scanning_alert returns raw JSON', async () => {
    nock('https://api.github.com')
      .get('/repos/acme/foo/code-scanning/alerts/1')
      .reply(200, { number: 1, rule: { id: 'js/xss' } });
    const client = await connectedClient(registerCodeSecurityTools, 'read-write');
    const result = await client.callTool({
      name: 'get_code_scanning_alert',
      arguments: { owner: 'acme', repo: 'foo', alert_number: 1 },
    });
    expect(result.isError).toBeFalsy();
    const text = (result.content as Array<{ type: string; text: string }>)[0]?.text ?? '';
    expect(JSON.parse(text)).toMatchObject({ number: 1 });
  });

  it('propagates a 404 from get_code_scanning_alert', async () => {
    nock('https://api.github.com')
      .get('/repos/acme/foo/code-scanning/alerts/999')
      .reply(404, { message: 'Not Found' });
    const client = await connectedClient(registerCodeSecurityTools, 'read-write');
    const result = await client.callTool({
      name: 'get_code_scanning_alert',
      arguments: { owner: 'acme', repo: 'foo', alert_number: 999 },
    });
    expect(result.isError).toBe(true);
    const text = (result.content as Array<{ type: string; text: string }>)[0]?.text ?? '';
    expect(text).toContain('Not Found');
  });

  it('list_secret_scanning_alerts returns raw JSON', async () => {
    nock('https://api.github.com')
      .get('/repos/acme/foo/secret-scanning/alerts')
      .query({ page: '1', per_page: '30' })
      .reply(200, [{ number: 1, secret_type: 'github_pat' }]);
    const client = await connectedClient(registerCodeSecurityTools, 'read-write');
    const result = await client.callTool({
      name: 'list_secret_scanning_alerts',
      arguments: { owner: 'acme', repo: 'foo' },
    });
    expect(result.isError).toBeFalsy();
  });

  it('get_secret_scanning_alert returns raw JSON', async () => {
    nock('https://api.github.com')
      .get('/repos/acme/foo/secret-scanning/alerts/1')
      .reply(200, { number: 1, secret_type: 'github_pat' });
    const client = await connectedClient(registerCodeSecurityTools, 'read-write');
    const result = await client.callTool({
      name: 'get_secret_scanning_alert',
      arguments: { owner: 'acme', repo: 'foo', alert_number: 1 },
    });
    expect(result.isError).toBeFalsy();
  });

  it('list_dependabot_alerts returns raw JSON', async () => {
    nock('https://api.github.com')
      .get('/repos/acme/foo/dependabot/alerts')
      .query({ page: '1', per_page: '30' })
      .reply(200, [{ number: 1, state: 'open' }]);
    const client = await connectedClient(registerCodeSecurityTools, 'read-write');
    const result = await client.callTool({
      name: 'list_dependabot_alerts',
      arguments: { owner: 'acme', repo: 'foo' },
    });
    expect(result.isError).toBeFalsy();
  });

  it('get_dependabot_alert returns raw JSON', async () => {
    nock('https://api.github.com')
      .get('/repos/acme/foo/dependabot/alerts/1')
      .reply(200, { number: 1, state: 'open' });
    const client = await connectedClient(registerCodeSecurityTools, 'read-write');
    const result = await client.callTool({
      name: 'get_dependabot_alert',
      arguments: { owner: 'acme', repo: 'foo', alert_number: 1 },
    });
    expect(result.isError).toBeFalsy();
  });

  it('list_global_advisories returns raw JSON', async () => {
    nock('https://api.github.com')
      .get('/advisories')
      .query({ page: '1', per_page: '30' })
      .reply(200, [{ ghsa_id: 'GHSA-xxxx-yyyy-zzzz' }]);
    const client = await connectedClient(registerCodeSecurityTools, 'read-write');
    const result = await client.callTool({
      name: 'list_global_advisories',
      arguments: {},
    });
    expect(result.isError).toBeFalsy();
  });

  it('get_global_advisory returns raw JSON', async () => {
    nock('https://api.github.com')
      .get('/advisories/GHSA-xxxx-yyyy-zzzz')
      .reply(200, { ghsa_id: 'GHSA-xxxx-yyyy-zzzz' });
    const client = await connectedClient(registerCodeSecurityTools, 'read-write');
    const result = await client.callTool({
      name: 'get_global_advisory',
      arguments: { ghsa_id: 'GHSA-xxxx-yyyy-zzzz' },
    });
    expect(result.isError).toBeFalsy();
  });

  it('list_repository_advisories returns raw JSON', async () => {
    nock('https://api.github.com')
      .get('/repos/acme/foo/security-advisories')
      .query({ page: '1', per_page: '30' })
      .reply(200, [{ ghsa_id: 'GHSA-xxxx-yyyy-zzzz' }]);
    const client = await connectedClient(registerCodeSecurityTools, 'read-write');
    const result = await client.callTool({
      name: 'list_repository_advisories',
      arguments: { owner: 'acme', repo: 'foo' },
    });
    expect(result.isError).toBeFalsy();
  });

  it('get_repository_advisory returns raw JSON', async () => {
    nock('https://api.github.com')
      .get('/repos/acme/foo/security-advisories/GHSA-xxxx-yyyy-zzzz')
      .reply(200, { ghsa_id: 'GHSA-xxxx-yyyy-zzzz' });
    const client = await connectedClient(registerCodeSecurityTools, 'read-write');
    const result = await client.callTool({
      name: 'get_repository_advisory',
      arguments: { owner: 'acme', repo: 'foo', ghsa_id: 'GHSA-xxxx-yyyy-zzzz' },
    });
    expect(result.isError).toBeFalsy();
  });

  it('registers exactly the 10 tools in both permission modes', async () => {
    const expected = [
      'get_code_scanning_alert',
      'get_dependabot_alert',
      'get_global_advisory',
      'get_repository_advisory',
      'get_secret_scanning_alert',
      'list_code_scanning_alerts',
      'list_dependabot_alerts',
      'list_global_advisories',
      'list_repository_advisories',
      'list_secret_scanning_alerts',
    ];
    const ro = await connectedClient(registerCodeSecurityTools, 'read-only');
    expect((await ro.listTools()).tools.map((t) => t.name).sort()).toEqual(expected);
    const rw = await connectedClient(registerCodeSecurityTools, 'read-write');
    expect((await rw.listTools()).tools.map((t) => t.name).sort()).toEqual(expected);
  });
});
```

- [x] **Step 2: Verify tests fail** — `npm test -- code_security` (module not found).

- [x] **Step 3: Create `src/toolsets/code_security.ts`**

```typescript
import type { McpServer } from '@modelcontextprotocol/server';
import type { Octokit } from 'octokit';
import { z } from 'zod';
import { ownerRepoSchema, paginationSchema, toToolResult, toToolError } from './common.js';

const alertNumberSchema = {
  alert_number: z.number().int().describe('The GitHub alert number (integer, per-repo).'),
};

const ghsaIdSchema = {
  ghsa_id: z.string().describe('GHSA advisory ID (e.g. "GHSA-xxxx-yyyy-zzzz").'),
};

export function registerCodeSecurityTools(
  server: McpServer,
  octokit: Octokit,
  _permission: 'read-only' | 'read-write',
): void {
  server.registerTool(
    'list_code_scanning_alerts',
    {
      description: 'List code-scanning alerts for a repository. Requires `security_events` PAT scope for private repos, `public_repo` for public.',
      inputSchema: z.object({
        ...ownerRepoSchema,
        tool_name: z.string().optional().describe('Filter by scanning tool name.'),
        state: z.enum(['open', 'closed', 'dismissed', 'fixed']).optional().describe('Filter by alert state.'),
        sort: z.enum(['created', 'updated']).optional(),
        direction: z.enum(['asc', 'desc']).optional(),
        ref: z.string().optional().describe('Git ref to filter by (branch/tag/SHA).'),
        ...paginationSchema,
      }),
    },
    async ({ owner, repo, tool_name, state, sort, direction, ref, page, per_page }) => {
      try {
        const response = await octokit.rest.codeScanning.listAlertsForRepo({
          owner, repo, tool_name, state, sort, direction, ref, page, per_page,
        });
        return toToolResult(response.data);
      } catch (error) {
        return toToolError(error);
      }
    },
  );

  server.registerTool(
    'get_code_scanning_alert',
    {
      description: 'Get a code-scanning alert. Requires `security_events` PAT scope (private) or `public_repo` (public).',
      inputSchema: z.object({ ...ownerRepoSchema, ...alertNumberSchema }),
    },
    async ({ owner, repo, alert_number }) => {
      try {
        const response = await octokit.rest.codeScanning.getAlert({ owner, repo, alert_number });
        return toToolResult(response.data);
      } catch (error) {
        return toToolError(error);
      }
    },
  );

  server.registerTool(
    'list_secret_scanning_alerts',
    {
      description: 'List secret-scanning alerts for a repository. Requires `security_events` PAT scope.',
      inputSchema: z.object({
        ...ownerRepoSchema,
        state: z.enum(['open', 'resolved']).optional().describe('Filter by state.'),
        secret_type: z.string().optional().describe('Comma-separated list of secret types to filter by.'),
        resolution: z.string().optional().describe('Comma-separated list of resolutions to filter by.'),
        ...paginationSchema,
      }),
    },
    async ({ owner, repo, state, secret_type, resolution, page, per_page }) => {
      try {
        const response = await octokit.rest.secretScanning.listAlertsForRepo({
          owner, repo, state, secret_type, resolution, page, per_page,
        });
        return toToolResult(response.data);
      } catch (error) {
        return toToolError(error);
      }
    },
  );

  server.registerTool(
    'get_secret_scanning_alert',
    {
      description: 'Get a secret-scanning alert. Requires `security_events` PAT scope.',
      inputSchema: z.object({ ...ownerRepoSchema, ...alertNumberSchema }),
    },
    async ({ owner, repo, alert_number }) => {
      try {
        const response = await octokit.rest.secretScanning.getAlert({ owner, repo, alert_number });
        return toToolResult(response.data);
      } catch (error) {
        return toToolError(error);
      }
    },
  );

  server.registerTool(
    'list_dependabot_alerts',
    {
      description: 'List Dependabot alerts for a repository. Requires `security_events` PAT scope.',
      inputSchema: z.object({
        ...ownerRepoSchema,
        state: z.string().optional().describe('Comma-separated states (e.g. "open,dismissed").'),
        severity: z.string().optional().describe('Comma-separated severities.'),
        ecosystem: z.string().optional().describe('Comma-separated ecosystems.'),
        package: z.string().optional().describe('Comma-separated package names.'),
        ...paginationSchema,
      }),
    },
    async ({ owner, repo, state, severity, ecosystem, package: pkg, page, per_page }) => {
      try {
        const response = await octokit.rest.dependabot.listAlertsForRepo({
          owner, repo, state, severity, ecosystem, package: pkg, page, per_page,
        });
        return toToolResult(response.data);
      } catch (error) {
        return toToolError(error);
      }
    },
  );

  server.registerTool(
    'get_dependabot_alert',
    {
      description: 'Get a Dependabot alert. Requires `security_events` PAT scope.',
      inputSchema: z.object({ ...ownerRepoSchema, ...alertNumberSchema }),
    },
    async ({ owner, repo, alert_number }) => {
      try {
        const response = await octokit.rest.dependabot.getAlert({ owner, repo, alert_number });
        return toToolResult(response.data);
      } catch (error) {
        return toToolError(error);
      }
    },
  );

  server.registerTool(
    'list_global_advisories',
    {
      description: 'List GitHub Global Security Advisories from the public GHSA database.',
      inputSchema: z.object({
        ecosystem: z.string().optional().describe('Filter by package ecosystem (npm, pip, etc.).'),
        severity: z.enum(['unknown', 'low', 'medium', 'high', 'critical']).optional(),
        cwes: z.string().optional().describe('Comma-separated CWE IDs to filter by.'),
        type: z.enum(['reviewed', 'malware', 'unreviewed']).optional(),
        ...paginationSchema,
      }),
    },
    async ({ ecosystem, severity, cwes, type, page, per_page }) => {
      try {
        const response = await octokit.rest.securityAdvisories.listGlobalAdvisories({
          ecosystem, severity, cwes, type, page, per_page,
        });
        return toToolResult(response.data);
      } catch (error) {
        return toToolError(error);
      }
    },
  );

  server.registerTool(
    'get_global_advisory',
    {
      description: 'Get a global GitHub security advisory by GHSA ID.',
      inputSchema: z.object({ ...ghsaIdSchema }),
    },
    async ({ ghsa_id }) => {
      try {
        const response = await octokit.rest.securityAdvisories.getGlobalAdvisory({ ghsa_id });
        return toToolResult(response.data);
      } catch (error) {
        return toToolError(error);
      }
    },
  );

  server.registerTool(
    'list_repository_advisories',
    {
      description: 'List repository security advisories.',
      inputSchema: z.object({ ...ownerRepoSchema, ...paginationSchema }),
    },
    async ({ owner, repo, page, per_page }) => {
      try {
        const response = await octokit.rest.securityAdvisories.listRepositoryAdvisories({
          owner, repo, page, per_page,
        });
        return toToolResult(response.data);
      } catch (error) {
        return toToolError(error);
      }
    },
  );

  server.registerTool(
    'get_repository_advisory',
    {
      description: 'Get a repository security advisory by GHSA ID.',
      inputSchema: z.object({ ...ownerRepoSchema, ...ghsaIdSchema }),
    },
    async ({ owner, repo, ghsa_id }) => {
      try {
        const response = await octokit.rest.securityAdvisories.getRepositoryAdvisory({
          owner, repo, ghsa_id,
        });
        return toToolResult(response.data);
      } catch (error) {
        return toToolError(error);
      }
    },
  );
}
```

- [x] **Step 4: Run tests** — `npm test -- code_security` → 13 PASS. Full suite: 179 + 13 = 192.

- [x] **Step 5: Commit** — `git commit -m "feat: add code_security toolset (10 read-only tools)"`

---

## Task 2: Wire + README

- [x] Alphabetically add `registerCodeSecurityTools` import. Add call after `registerProjectsTools`.
- [x] README bullet after `projects`: `- \`code_security\` — code scanning, secret scanning, Dependabot alerts, and security advisories`
- [x] `npm test && npm run typecheck && npm run lint && npm run build` all PASS.
- [x] `git commit -m "feat: wire code_security toolset into buildServer"`
