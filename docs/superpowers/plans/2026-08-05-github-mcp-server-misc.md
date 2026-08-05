# github-mcp-server-js — `misc` Toolset Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Add the `misc` toolset (4 utility tools wrapping GitHub's rate-limit, meta, emojis, and markdown-rendering endpoints) to `github-mcp-server-js`, following the exact structural, permission-gating, and response/error pattern established by the `users` and `packages` toolsets.

**Architecture:** Same pattern as prior toolsets: one `registerMiscTools(server, octokit, permission)` function registers each tool with `server.registerTool(name, {description, inputSchema}, handler)`; every handler wraps its octokit call in try/catch, returning raw data via `toToolResult`/`toToolError`; `server.ts` gains one more registration call. Octokit calls span four namespaces: `octokit.rest.rateLimit`, `octokit.rest.meta`, `octokit.rest.emojis`, `octokit.rest.markdown`. Because every selected endpoint is either a GET or a stateless transformation POST, all 4 tools are safe under `read-only` mode. The `permission` parameter is accepted (to keep the signature uniform) but never inspected; it is renamed `_permission` inside the function body to satisfy `@typescript-eslint/no-unused-vars`.

**The `render_markdown` special case:** `markdown/render` returns `Content-Type: text/html`, so `response.data` is a raw HTML string. Passing it to `toToolResult` would call `JSON.stringify(data)`, producing a double-encoded JSON string (e.g. `"\"<p>Hello</p>\""`) instead of the actual HTML markup. This plan handles the case inline in the `render_markdown` handler: it builds the MCP tool result manually with `{ content: [{ type: 'text' as const, text: response.data as string }] }`, bypassing `toToolResult` for this one tool only. No new shared helper is added to `common.ts` — this shape appears in exactly one tool across the entire codebase and adding a helper for one callsite would couple a general-purpose module to a markdown-specific concern.

**Tech Stack:** Same as prior plans — TypeScript, `@modelcontextprotocol/server@^2.0.0`, `octokit@^5.0.5`, `zod@^4.2.0`, `vitest`, `nock`. No new dependencies.

## Global Constraints

- Tool responses return the raw octokit response body unmodified. `get_rate_limit` returns a `rate-limit-overview` JSON object; `get_meta` returns an `api-overview` JSON object; `list_emojis` returns a `{ [key: string]: string }` emoji-name-to-URL map; `render_markdown` returns a raw HTML string. These shapes are preserved exactly; callers extract fields themselves.
- Errors propagate unmodified: catch the octokit `RequestError`, surface `error.message` in an MCP tool error result via `toToolError`. No normalization layer.
- None of the 4 tools take `page`/`per_page` parameters. `get_rate_limit`, `get_meta`, and `list_emojis` return complete, non-paginated responses. `render_markdown` is a stateless text transformation.
- `GITHUB_PERMISSION=read-only` gating is a no-op for this toolset because every tool is read-only. The read-only test still verifies the exact set of 4 tools is registered using `.toEqual([...exact set...])`, not `arrayContaining`, following the pattern established in `users` and `packages` plans.
- Verified tool-name collision check against the 54 existing tool names (8 repos, 12 issues, 10 pull_requests, 5 search, 5 users, 5 gists, 5 activity, 4 packages): **zero collisions** with the 4 new names (`get_rate_limit`, `get_meta`, `list_emojis`, `render_markdown`). None of these appear anywhere in the current tool name set.
- No modification to `common.ts`. The `render_markdown` inline result construction does not require a new shared helper.
- TypeScript only, no new runtime dependencies.

---

## Octokit Verification Results

Verified via `node --input-type=module -e "..."` against the installed `octokit@^5.0.5`:

| Namespace | Method | HTTP | URL |
|---|---|---|---|
| `rateLimit` | `get` | GET | `/rate_limit` |
| `meta` | `get` | GET | `/meta` |
| `meta` | `getAllVersions` | GET | `/versions` |
| `meta` | `getOctocat` | GET | `/octocat` |
| `meta` | `getZen` | GET | `/zen` |
| `meta` | `root` | GET | `/` |
| `emojis` | `get` | GET | `/emojis` |
| `markdown` | `render` | POST | `/markdown` |
| `markdown` | `renderRaw` | POST | `/markdown/raw` |
| `codesOfConduct` | `getAllCodesOfConduct` | GET | `/codes_of_conduct` |
| `codesOfConduct` | `getConductCode` | GET | `/codes_of_conduct/{key}` |

**Octokit surprise — `markdown` namespace:** The `markdown` namespace contains two render methods. `render` (POST `/markdown`) accepts a JSON body with `{ text, mode?, context? }` and returns `Content-Type: text/html`. `renderRaw` (POST `/markdown/raw`) sends raw text and also returns `text/html`. The plan uses `markdown.render` (the JSON-body variant) because it provides the `mode` and `context` parameters useful to callers, and its JSON input maps cleanly to Zod parameters.

**Octokit surprise — `text/html` response body:** For any `Content-Type: text/html` response, `@octokit/request`'s `fetch-wrapper.js` calls `response.text()` and assigns the result to `response.data` (a string), rather than `JSON.parse`. This means `response.data` is a raw HTML string after a successful `markdown.render` call. `toToolResult` in `common.ts` does `JSON.stringify(data)`, so passing a string produces `"\"<p>Hello</p>\""` — a JSON-encoded string rather than the HTML text itself. The handler must build the `content` array manually (see implementation below).

**Selection rationale for `meta.get` vs. other `meta.*` methods:** `meta.getOctocat` and `meta.getZen` return novelty ASCII art and zen aphorisms — amusing but not useful as LLM tools. `meta.root` returns the same data as `meta.get` (the GitHub API root) but without the full IP-range/SSH-key/hook detail. `meta.getAllVersions` returns a list of supported API versions (low utility). `meta.get` is the only one with meaningful operational value (IP ranges, SSH fingerprints, public keys). The other `meta.*` methods are excluded (see Deliberate scope decisions).

---

## Reference: verified octokit parameter shapes

Confirmed against `@octokit/openapi-types/types.d.ts` operations:

| Tool | octokit method | HTTP | Params | Response body type |
|---|---|---|---|---|
| `get_rate_limit` | `rateLimit.get` | GET `/rate_limit` | none | `rate-limit-overview` (JSON) |
| `get_meta` | `meta.get` | GET `/meta` | none | `api-overview` (JSON) |
| `list_emojis` | `emojis.get` | GET `/emojis` | none | `{ [key: string]: string }` (JSON map) |
| `render_markdown` | `markdown.render` | POST `/markdown` | body: `text` (required string), `mode?` (`"markdown" \| "gfm"`), `context?` (string) | raw HTML string (`text/html`) |

**`rate-limit-overview` schema** (from `components["schemas"]["rate-limit-overview"]`):
```
{
  resources: {
    core: rate-limit,
    graphql?: rate-limit,
    search: rate-limit,
    code_search?: rate-limit,
    source_import?: rate-limit,
    integration_manifest?: rate-limit,
    code_scanning_upload?: rate-limit,
    actions_runner_registration?: rate-limit,
    scim?: rate-limit,
    dependency_snapshots?: rate-limit,
    ...
  },
  rate: rate-limit
}
```
where `rate-limit` is `{ limit: number, used: number, remaining: number, reset: number }`.

**`api-overview` schema** (from `components["schemas"]["api-overview"]`): Contains `verifiable_password_authentication`, `ssh_key_fingerprints`, `ssh_keys`, `hooks`, `github_enterprise_importer`, `api`, `web`, `git`, `packages`, `pages`, `importer`, `actions`, `actions_macos`, `copilot`, `dependabot` — all arrays of IP CIDR strings or strings.

**`markdown/render` request body** (from `operations["markdown/render"].requestBody.content["application/json"]`):
- `text: string` — required. The Markdown text to render.
- `mode?: "markdown" | "gfm"` — optional. Rendering mode. `"gfm"` enables GitHub Flavored Markdown with repo-context cross-references. Defaults to `"markdown"`.
- `context?: string` — optional. Repository context for GFM cross-references (e.g. `"octo-org/octo-repo"`). Only meaningful when `mode = "gfm"`.

**`markdown/render` response** (from `operations["markdown/render"].responses[200].content["text/html"]`): `string`. The rendered HTML. Confirmed `response.data` is a `string` at runtime (octokit `fetch-wrapper.js` line 121-125: `mimetype.type.startsWith("text/")` → `response.text()`).

**cspell.json note:** The word `gfm` may be flagged by cspell. If the pre-commit hook rejects it, add `"gfm"` to the `words` array in `cspell.json`. All other words used in this toolset (`rateLimit`, `emojis`, `markdown`, `octocat`, `monalisa`) are either already in `cspell.json`, recognized by cspell's default dictionary, or standard technical abbreviations.

---

## File Structure

```
github-mcp-server-js/
  src/
    toolsets/
      misc.ts                # NEW: registerMiscTools(server, octokit, permission)
    server.ts                # MODIFIED: calls registerMiscTools
  test/
    unit/
      toolsets/
        misc.test.ts         # NEW: mirrors packages.test.ts's structure
```

`common.ts` is NOT modified. `README.md`'s Toolsets section is updated in Task 2 (Step 5).

---

## Task 1: Implement the `misc` toolset (4 tools) and its tests

**Files:**
- Create: `src/toolsets/misc.ts`
- Create: `test/unit/toolsets/misc.test.ts`

**Interfaces:**
- Consumes: `toToolResult`, `toToolError` from `./common.js`. Does NOT use `paginationSchema` (none of the 4 tools are paginated).
- Produces (for Task 2 / `server.ts` to consume):
  - `registerMiscTools(server: McpServer, octokit: Octokit, permission: 'read-only' | 'read-write'): void`

- [x] **Step 1: Write the failing tests**

Create `test/unit/toolsets/misc.test.ts`:

```typescript
import nock from 'nock';
import { afterEach, describe, expect, it } from 'vitest';
import { registerMiscTools } from '../../../src/toolsets/misc.js';
import { connectedClient } from './test-helpers.js';

describe('registerMiscTools', () => {
  afterEach(() => {
    nock.cleanAll();
  });

  // ── get_rate_limit ─────────────────────────────────────────────────────────

  it('registers get_rate_limit and returns the raw rate-limit-overview object as JSON', async () => {
    nock('https://api.github.com')
      .get('/rate_limit')
      .reply(200, {
        resources: {
          core: { limit: 5000, used: 10, remaining: 4990, reset: 1640995200 },
          search: { limit: 30, used: 0, remaining: 30, reset: 1640995200 },
          graphql: { limit: 5000, used: 0, remaining: 5000, reset: 1640995200 },
        },
        rate: { limit: 5000, used: 10, remaining: 4990, reset: 1640995200 },
      });

    const client = await connectedClient(registerMiscTools, 'read-write');
    const result = await client.callTool({ name: 'get_rate_limit', arguments: {} });

    expect(result.isError).toBeFalsy();
    const text = (result.content as Array<{ type: string; text: string }>)[0]?.text ?? '';
    const parsed = JSON.parse(text) as {
      resources: { core: { remaining: number } };
      rate: { remaining: number };
    };
    expect(parsed.resources.core.remaining).toBe(4990);
    expect(parsed.rate.remaining).toBe(4990);
  });

  it('propagates a 404 from get_rate_limit as an MCP tool error', async () => {
    nock('https://api.github.com')
      .get('/rate_limit')
      .reply(404, { message: 'Not Found', documentation_url: 'https://docs.github.com/rest' });

    const client = await connectedClient(registerMiscTools, 'read-write');
    const result = await client.callTool({ name: 'get_rate_limit', arguments: {} });

    expect(result.isError).toBe(true);
    const text = (result.content as Array<{ type: string; text: string }>)[0]?.text ?? '';
    expect(text).toContain('Not Found');
  });

  // ── get_meta ───────────────────────────────────────────────────────────────

  it('registers get_meta and returns the raw api-overview object as JSON', async () => {
    nock('https://api.github.com')
      .get('/meta')
      .reply(200, {
        verifiable_password_authentication: true,
        ssh_key_fingerprints: {
          SHA256_RSA: 'abc123',
          SHA256_ECDSA: 'def456',
        },
        ssh_keys: ['ssh-rsa AAAA...'],
        hooks: ['192.30.252.0/22'],
        web: ['192.30.252.0/22'],
        api: ['192.30.252.0/22'],
        git: ['192.30.252.0/22'],
        packages: ['192.30.252.0/22'],
        pages: ['192.30.252.0/22'],
        importer: ['192.30.252.0/22'],
        actions: ['192.30.252.0/22'],
        dependabot: ['192.30.252.0/22'],
      });

    const client = await connectedClient(registerMiscTools, 'read-write');
    const result = await client.callTool({ name: 'get_meta', arguments: {} });

    expect(result.isError).toBeFalsy();
    const text = (result.content as Array<{ type: string; text: string }>)[0]?.text ?? '';
    const parsed = JSON.parse(text) as {
      verifiable_password_authentication: boolean;
      hooks: string[];
    };
    expect(parsed.verifiable_password_authentication).toBe(true);
    expect(parsed.hooks).toContain('192.30.252.0/22');
  });

  it('propagates a 304 from get_meta as an MCP tool error', async () => {
    nock('https://api.github.com').get('/meta').reply(304);

    const client = await connectedClient(registerMiscTools, 'read-write');
    const result = await client.callTool({ name: 'get_meta', arguments: {} });

    // Octokit throws a RequestError for 304 ("Not modified") — surfaces as tool error.
    expect(result.isError).toBe(true);
    const text = (result.content as Array<{ type: string; text: string }>)[0]?.text ?? '';
    expect(text).toContain('Not modified');
  });

  // ── list_emojis ────────────────────────────────────────────────────────────

  it('registers list_emojis and returns the raw emoji map as JSON', async () => {
    nock('https://api.github.com')
      .get('/emojis')
      .reply(200, {
        '+1': 'https://github.githubassets.com/images/icons/emoji/unicode/1f44d.png',
        '-1': 'https://github.githubassets.com/images/icons/emoji/unicode/1f44e.png',
        smile: 'https://github.githubassets.com/images/icons/emoji/unicode/1f604.png',
        octocat: 'https://github.githubassets.com/images/icons/emoji/octocat.png',
      });

    const client = await connectedClient(registerMiscTools, 'read-write');
    const result = await client.callTool({ name: 'list_emojis', arguments: {} });

    expect(result.isError).toBeFalsy();
    const text = (result.content as Array<{ type: string; text: string }>)[0]?.text ?? '';
    const parsed = JSON.parse(text) as Record<string, string>;
    expect(parsed['smile']).toContain('1f604');
    expect(parsed['octocat']).toContain('octocat.png');
  });

  it('propagates a 304 from list_emojis as an MCP tool error', async () => {
    nock('https://api.github.com').get('/emojis').reply(304);

    const client = await connectedClient(registerMiscTools, 'read-write');
    const result = await client.callTool({ name: 'list_emojis', arguments: {} });

    expect(result.isError).toBe(true);
    const text = (result.content as Array<{ type: string; text: string }>)[0]?.text ?? '';
    expect(text).toContain('Not modified');
  });

  // ── render_markdown ────────────────────────────────────────────────────────

  it('registers render_markdown and returns the raw HTML string (not double-encoded JSON)', async () => {
    const htmlResponse = '<p>Hello <strong>world</strong></p>\n';
    nock('https://api.github.com')
      .post('/markdown', { text: '**world**' })
      .reply(200, htmlResponse, { 'Content-Type': 'text/html; charset=utf-8' });

    const client = await connectedClient(registerMiscTools, 'read-write');
    const result = await client.callTool({
      name: 'render_markdown',
      arguments: { text: '**world**' },
    });

    expect(result.isError).toBeFalsy();
    const text = (result.content as Array<{ type: string; text: string }>)[0]?.text ?? '';
    // The raw HTML must be returned as-is, NOT as a JSON-encoded string.
    // Correct:   '<p>Hello <strong>world</strong></p>\n'
    // Wrong:     '"<p>Hello <strong>world</strong></p>\\n"'
    expect(text).toBe(htmlResponse);
    expect(text).not.toBe(JSON.stringify(htmlResponse));
  });

  it('forwards mode and context to the markdown render endpoint', async () => {
    const scope = nock('https://api.github.com')
      .post('/markdown', {
        text: 'See #42',
        mode: 'gfm',
        context: 'octo-org/octo-repo',
      })
      .reply(200, '<p>See <a href="...">octo-org/octo-repo#42</a></p>\n', {
        'Content-Type': 'text/html; charset=utf-8',
      });

    const client = await connectedClient(registerMiscTools, 'read-write');
    const result = await client.callTool({
      name: 'render_markdown',
      arguments: { text: 'See #42', mode: 'gfm', context: 'octo-org/octo-repo' },
    });

    expect(result.isError).toBeFalsy();
    expect(scope.isDone()).toBe(true);
    const text = (result.content as Array<{ type: string; text: string }>)[0]?.text ?? '';
    expect(text).toContain('octo-org/octo-repo#42');
  });

  it('propagates a 400 from render_markdown as an MCP tool error', async () => {
    nock('https://api.github.com')
      .post('/markdown')
      .reply(400, {
        message: 'Problems parsing JSON',
        documentation_url: 'https://docs.github.com/rest',
      });

    const client = await connectedClient(registerMiscTools, 'read-write');
    const result = await client.callTool({
      name: 'render_markdown',
      arguments: { text: '' },
    });

    expect(result.isError).toBe(true);
    const text = (result.content as Array<{ type: string; text: string }>)[0]?.text ?? '';
    expect(text).toContain('Problems parsing JSON');
  });

  // ── registration count ─────────────────────────────────────────────────────

  it('registers exactly the 4 misc tools in read-only mode (and the same set in read-write)', async () => {
    const expected = ['get_meta', 'get_rate_limit', 'list_emojis', 'render_markdown'];

    const readOnlyClient = await connectedClient(registerMiscTools, 'read-only');
    const readOnlyTools = await readOnlyClient.listTools();
    expect(readOnlyTools.tools.map((t) => t.name).sort()).toEqual(expected);

    const readWriteClient = await connectedClient(registerMiscTools, 'read-write');
    const readWriteTools = await readWriteClient.listTools();
    expect(readWriteTools.tools.map((t) => t.name).sort()).toEqual(expected);
  });
});
```

- [x] **Step 2: Run tests to verify they fail**

Run: `npm test -- misc`
Expected: FAIL with a module-not-found error for `../../../src/toolsets/misc.js` (the file doesn't exist yet).

- [x] **Step 3: Create `src/toolsets/misc.ts`**

```typescript
import type { McpServer } from '@modelcontextprotocol/server';
import type { Octokit } from 'octokit';
import { z } from 'zod';
import { toToolError, toToolResult } from './common.js';

export function registerMiscTools(
  server: McpServer,
  octokit: Octokit,
  _permission: 'read-only' | 'read-write',
): void {
  // ── get_rate_limit ─────────────────────────────────────────────────────────

  server.registerTool(
    'get_rate_limit',
    {
      description:
        'Get the current API rate limit status for the authenticated user. ' +
        'Returns a rate-limit-overview object with per-category breakdowns ' +
        '(core, search, graphql, code_search, actions_runner_registration, etc.), ' +
        'each showing limit, used, remaining, and reset timestamp (Unix epoch seconds). ' +
        'Accessing this endpoint does not itself consume any rate limit quota.',
      inputSchema: z.object({}),
    },
    async () => {
      try {
        const response = await octokit.rest.rateLimit.get();
        return toToolResult(response.data);
      } catch (error) {
        return toToolError(error);
      }
    },
  );

  // ── get_meta ───────────────────────────────────────────────────────────────

  server.registerTool(
    'get_meta',
    {
      description:
        'Get GitHub API metadata: IP address ranges for GitHub services ' +
        '(hooks, web, api, git, packages, pages, importer, actions, dependabot, copilot), ' +
        'SSH key fingerprints, SSH public keys used to sign GitHub commits, ' +
        'and whether GitHub password authentication is enabled. ' +
        'Useful for firewall allowlisting, SSH host verification, and infrastructure automation. ' +
        'Returns an api-overview object. Safe to call without authentication.',
      inputSchema: z.object({}),
    },
    async () => {
      try {
        const response = await octokit.rest.meta.get();
        return toToolResult(response.data);
      } catch (error) {
        return toToolError(error);
      }
    },
  );

  // ── list_emojis ────────────────────────────────────────────────────────────

  server.registerTool(
    'list_emojis',
    {
      description:
        'List all emoji names available to use on GitHub, with their corresponding image URLs. ' +
        'Returns a flat JSON object mapping each emoji name (e.g. "smile", "+1", "octocat") ' +
        'to its CDN image URL on github.githubassets.com. ' +
        'Useful for populating emoji pickers, validating emoji names, or fetching emoji images.',
      inputSchema: z.object({}),
    },
    async () => {
      try {
        const response = await octokit.rest.emojis.get();
        return toToolResult(response.data);
      } catch (error) {
        return toToolError(error);
      }
    },
  );

  // ── render_markdown ────────────────────────────────────────────────────────

  server.registerTool(
    'render_markdown',
    {
      description:
        'Render a Markdown string to HTML using GitHub\'s Markdown renderer. ' +
        'Returns the rendered HTML as a plain text string (not JSON-encoded). ' +
        'Use mode "markdown" (default) for standard Markdown. ' +
        'Use mode "gfm" (GitHub Flavored Markdown) to enable cross-references ' +
        'such as #42 linking to issues and @mentions — requires the context parameter ' +
        'to specify the repository (e.g. "owner/repo") for resolving those references. ' +
        'This endpoint is stateless: it renders and returns HTML without modifying any data.',
      inputSchema: z.object({
        text: z.string().describe('The Markdown text to render to HTML.'),
        mode: z
          .enum(['markdown', 'gfm'])
          .optional()
          .describe(
            'Rendering mode. "markdown" (default) renders standard Markdown. ' +
              '"gfm" renders GitHub Flavored Markdown with cross-reference support ' +
              '(requires the context parameter to resolve issue and PR references).',
          ),
        context: z
          .string()
          .optional()
          .describe(
            'Repository context for resolving cross-references in gfm mode, ' +
              'in "owner/repo" format (e.g. "octo-org/octo-repo"). ' +
              'Ignored when mode is "markdown".',
          ),
      }),
    },
    async ({ text, mode, context }) => {
      try {
        const response = await octokit.rest.markdown.render({ text, mode, context });
        // response.data is a raw HTML string (Content-Type: text/html), NOT a JSON value.
        // toToolResult would call JSON.stringify on it, producing a double-encoded string.
        // Build the MCP content array directly to preserve the raw HTML text.
        return { content: [{ type: 'text' as const, text: response.data as string }] };
      } catch (error) {
        return toToolError(error);
      }
    },
  );
}
```

- [x] **Step 4: Run tests to verify they pass**

Run: `npm test -- misc`
Expected: PASS (9 tests in `misc.test.ts`).

- [x] **Step 5: Run the full test suite to confirm no regression in other toolsets**

Run: `npm test`
Expected: PASS. Total test count is the previous suite total plus the 9 new tests in `misc.test.ts`. No pre-existing test file is modified; `common.ts` is unchanged so `common.test.ts` still passes verbatim.

- [x] **Step 6: Commit**

```bash
git add src/toolsets/misc.ts test/unit/toolsets/misc.test.ts
git commit -m "feat: add misc toolset (4 utility tools: rate limit, meta, emojis, markdown)"
```

---

## Task 2: Wire `registerMiscTools` into `server.ts`

**Files:**
- Modify: `src/server.ts`
- Modify: `README.md` (Toolsets section)

**Interfaces:**
- Consumes: `registerMiscTools(server, octokit, permission)` from Task 1.
- Produces: nothing new — this is the final integration point.

- [x] **Step 1: Modify `src/server.ts`**

Current content (after `packages` was wired):

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

Replace with (new import sorted alphabetically, new call appended):

```typescript
import { McpServer } from '@modelcontextprotocol/server';
import type { Octokit } from 'octokit';
import { registerActivityTools } from './toolsets/activity.js';
import { registerGistsTools } from './toolsets/gists.js';
import { registerIssuesTools } from './toolsets/issues.js';
import { registerMiscTools } from './toolsets/misc.js';
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
  registerMiscTools(server, octokit, permission);

  return server;
}
```

- [x] **Step 2: Run the full test suite**

Run: `npm test`
Expected: PASS, same test count as after Task 1 (no test exercises `server.ts` directly — `buildServer` is a thin, non-branching composition function verified by the manual smoke test below).

- [x] **Step 3: Typecheck, lint, build**

Run: `npm run typecheck && npm run lint && npm run build`
Expected: all PASS. The build step confirms `dist/cli.js`'s bundled dependency graph now transitively includes `misc.ts`.

- [x] **Step 4: Manual end-to-end smoke test**

Run:
```bash
GITHUB_TOKEN=fake-token node dist/cli.js --transport=http --port=3996 &
sleep 1
curl -s -D /tmp/mcp-init-headers.txt -X POST http://localhost:3996/mcp \
  -H 'Content-Type: application/json' \
  -H 'Accept: application/json, text/event-stream' \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"smoke-test","version":"0.0.0"}}}'
SESSION=$(grep -i mcp-session-id /tmp/mcp-init-headers.txt | awk '{print $2}' | tr -d '\r')
curl -s -X POST http://localhost:3996/mcp \
  -H 'Content-Type: application/json' \
  -H 'Accept: application/json, text/event-stream' \
  -H "Mcp-Session-Id: $SESSION" \
  -d '{"jsonrpc":"2.0","id":2,"method":"tools/list","params":{}}'
kill %1
```

Expected: the `initialize` response contains `"serverInfo":{"name":"github-mcp-server-js"...}`. The `tools/list` response includes all 4 misc tools (`get_rate_limit`, `get_meta`, `list_emojis`, `render_markdown`) alongside all 54 previously-shipped tools — proving all toolsets are live in the same server with no duplicate-registration crash.

- [x] **Step 5: Update the README's Toolsets section**

Modify `README.md`'s "Currently implemented" list to add:

```markdown
- `misc` — utility tools: API rate limit status, GitHub server metadata, emoji list, Markdown-to-HTML rendering
```

Slot it after the existing `packages` bullet, keeping the toolsets listed in the order they were shipped.

- [x] **Step 6: If cspell flags `gfm`, add it to `cspell.json`**

If the pre-commit hook rejects the word `gfm` (which appears in the `render_markdown` description), open `cspell.json` and add `"gfm"` to the `words` array:

```json
{
  "words": [
    ...,
    "gfm"
  ]
}
```

If cspell does not flag it, skip this step.

- [x] **Step 7: Commit**

```bash
git add src/server.ts README.md
git commit -m "feat: wire misc toolset into buildServer"
```

---

## Deliberate scope decisions

The following octokit methods reachable from the namespaces listed in the design row (`meta`, `emojis`, `markdown`, `rateLimit`, `billing`, `campaigns`, `credentials`, `hostedCompute`, `privateRegistries`, `migrations`, `enterpriseTeam*`, `codesOfConduct`) were introspected and are **intentionally excluded**. Each exclusion is justified below.

### `meta.*` — excluded variants

1. **`meta.getOctocat` (GET `/octocat`) — novelty, out of scope.** Returns an ASCII art Octocat as a text response. Entertaining but provides no operational value to an LLM-facing tool. Not useful for any real workflow.

2. **`meta.getZen` (GET `/zen`) — novelty, out of scope.** Returns a random GitHub "Zen" aphorism as plain text (e.g. "Approachable is better than simple"). Same rationale as `getOctocat` — zero operational value.

3. **`meta.root` (GET `/`) — redundant, out of scope.** Returns the same API root document as `meta.get` but without the full IP-range and SSH-key detail. `get_meta` already provides a superset of this information.

4. **`meta.getAllVersions` (GET `/versions`) — niche, out of scope.** Returns a list of supported GitHub API versions (e.g. `["2022-11-28"]`). Useful only for tooling that needs to discover supported API versions dynamically, which is a developer-tooling concern not relevant to LLM-facing MCP tools.

### `markdown.renderRaw` — excluded

5. **`markdown.renderRaw` (POST `/markdown/raw`) — redundant, excluded.** Accepts a raw `text/plain` body and renders it to HTML without GitHub Flavored Markdown features. `render_markdown` (wrapping `markdown.render`) already covers raw Markdown rendering via `mode: "markdown"` and adds the GFM capability via `mode: "gfm"`. Exposing `renderRaw` as a second tool would duplicate `render_markdown`'s default behavior with no added value; callers would need to know which of two near-identical tools to pick.

### `codesOfConduct.*` — out of scope

6. **`codesOfConduct.getAllCodesOfConduct` (GET `/codes_of_conduct`) — out of scope.** Returns an array of GitHub's built-in codes of conduct (Contributor Covenant, Citizen Code of Conduct). Niche reference data used when scaffolding a new repo with a code of conduct file. Not useful as a standalone LLM tool — the relevant workflow (adding a CoC to a repo) is handled by `repos` toolset file-write tools, not by listing the available templates.

7. **`codesOfConduct.getConductCode` (GET `/codes_of_conduct/{key}`) — out of scope.** Returns the full text of a specific code of conduct by key (e.g. `contributor_covenant`). Same rationale as `getAllCodesOfConduct` — niche scaffolding data with no standalone utility in the ~4 tool budget.

### `billing`, `campaigns`, `credentials`, `hostedCompute`, `privateRegistries`, `migrations`, `enterpriseTeam*` — not present in `octokit.rest`

8. **`billing`, `campaigns`, `credentials`, `hostedCompute`, `privateRegistries`, `migrations`, `enterpriseTeam*` — absent from `octokit.rest`, excluded.** These namespaces are listed in the design row's octokit column as aspirational/candidate namespaces, but none of them appear as top-level keys on `octokit.rest` in the installed `octokit@^5.0.5`. They correspond to GitHub Enterprise and GitHub.com features that may be:
   - Not yet promoted to the stable REST API covered by `@octokit/plugin-rest-endpoint-methods`
   - Available only through the GitHub Enterprise Server API (not the standard `@octokit/openapi-types`)
   - Covered under different namespace names in the current plugin version

   Since none of these namespaces exist in the installed octokit build, they cannot be wrapped — and attempting to access them would produce a TypeScript type error. They are excluded from v1 scope. If future octokit versions add these namespaces, follow-up plans can add the relevant tools without disturbing the 4 existing misc tools.

---

## Self-Review Notes

- **Spec coverage:** `misc` toolset (Toolset Inventory row: multiple namespaces, example tools `get_rate_limit, render_markdown`, est. count ~4). Both named examples are implemented exactly. The count exactly matches the ~4 estimate. The two additional tools (`get_meta`, `list_emojis`) are the most universally useful tools from the remaining namespaces — `get_meta` is operationally important (IP ranges, SSH keys) and `list_emojis` is a natural companion endpoint with broad applicability.

- **`render_markdown` is read-only-safe:** Although it uses HTTP POST, `markdown/render` is a pure server-side text transformation — it renders Markdown to HTML and returns the result without persisting anything, creating any resource, or modifying any GitHub state. GitHub's own documentation for this endpoint does not list it under write or mutating operations. All 4 tools are therefore correctly registered unconditionally (no `permission === 'read-write'` guard), and `_permission` is an unused parameter by design.

- **`render_markdown` HTML response handling:** `toToolResult` in `common.ts` calls `JSON.stringify(data)`. For a string `data`, this produces `'"<p>Hello</p>"'` — a JSON-encoded string, not the raw HTML text. The test explicitly asserts `text === htmlResponse` (the raw HTML) and `text !== JSON.stringify(htmlResponse)` (the double-encoded form) to pin this behavior. The fix is a single-line inline result construction in the handler — no shared helper is warranted since only one tool in the entire codebase has a `text/html` response body.

- **`get_rate_limit` takes empty input schema:** Same as `get_authenticated_user` in the users toolset — `z.object({})` is the correct Zod expression for a parameterless tool. The test exercises `callTool` with `arguments: {}` to confirm the empty schema round-trips cleanly.

- **`get_meta` takes empty input schema:** Same pattern. No parameters required by the endpoint.

- **`list_emojis` takes empty input schema:** Same pattern. No parameters required by the endpoint.

- **304 responses surface as tool errors:** Octokit throws a `RequestError("Not modified", 304, ...)` for 304 responses rather than returning a successful response object (confirmed in `fetch-wrapper.js` lines 90-96). The test for `get_meta` and `list_emojis` both exercise this path, asserting `isError: true` and `text.toContain('Not modified')`. This is consistent with how every other toolset handles non-2xx responses.

- **`nock` body matching for `render_markdown`:** The test for the default render call uses `.post('/markdown', { text: '**world**' })` — nock matches the JSON body exactly. The GFM-mode test uses `.post('/markdown', { text: 'See #42', mode: 'gfm', context: 'octo-org/octo-repo' })`. `scope.isDone()` assertion proves that the optional `mode` and `context` parameters are forwarded on the wire, catching any parameter-name typo that would silently drop them.

- **Collision check performed:** All 4 tool names (`get_rate_limit`, `get_meta`, `list_emojis`, `render_markdown`) were verified against the 54 existing tool names (counted via `grep -rh "registerTool("` across all 8 shipped toolset files): zero collisions.

- **Lessons applied from prior plans:**
  - **`issues` I1 (strict permission-gating equality):** Task 1's read-only test uses `.toEqual([...exact 4 names...])`, not `arrayContaining`. Run against both `read-only` and `read-write` clients.
  - **`issues` I3 (wire-level filter passthrough):** `render_markdown`'s optional-parameter test uses `nock(...).post(...)` with full body match plus `scope.isDone()`.
  - **`search` M (all-read-only `_permission` naming):** Applied — `_permission` inside the function body.
  - **`packages` M (tool-name collision check):** Performed explicitly — see Global Constraints.

- **No placeholders:** all octokit method names (`rateLimit.get`, `meta.get`, `emojis.get`, `markdown.render`), HTTP verbs, URL paths, and parameter shapes verified directly against the installed `@octokit/plugin-rest-endpoint-methods` endpoint table (via `octokit.rest[ns][name].endpoint.DEFAULTS`) and `@octokit/openapi-types/types.d.ts` operation definitions — not memorized or guessed. Every intentionally excluded method is documented in the Deliberate scope decisions section.

- **Task right-sizing:** Task 1 bundles all 4 tools + tests into one reviewer gate, matching the `search`, `users`, `gists`, `activity`, and `packages` plans. Task 2 is a separate gate for the same reason as all prior plans: wiring is where duplicate-registration crashes and stale-README rot surface.
