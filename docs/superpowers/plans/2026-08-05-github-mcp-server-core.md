# github-mcp-server-js — Core Infrastructure Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the working core of github-mcp-server-js: config loading, the shared Octokit client, the `McpServer` wiring with permission-gated tool registration, both transports (stdio + HTTP), the CLI entrypoint, pre-commit/CI tooling, and one fully-implemented toolset (`repos`) that establishes the pattern every other toolset (in later plans) will copy.

**Architecture:** A single `Octokit` client and a single `McpServer` instance are built once at startup from environment variables. Each toolset is a module exporting one `register*Tools(server, octokit, permission)` function; `server.ts` calls each toolset's registration function in turn. Two transport modules (`transports/stdio.ts`, `transports/http.ts`) attach the same `McpServer` to different `Transport` implementations; `cli.ts` parses flags and picks one at process start.

**Tech Stack:** TypeScript, `@modelcontextprotocol/server@^2.0.0`, `octokit@^5.0.5`, `zod@^4.2.0` (required peer of the MCP server package), `@whatwg-node/server` (bridges the HTTP transport's Web Standard `Request`/`Response` handler onto Node's `http.createServer`), `tsup` (bundling), `vitest` (test runner), `nock` (HTTP mocking), `eslint` + `typescript-eslint` (flat config), `cspell`, `gitleaks`, `husky` + `lint-staged`.

## Global Constraints

- Package name: `github-mcp-server-js` (unscoped, matches repo name).
- Env vars (exact names): `GITHUB_TOKEN` (required), `GITHUB_SERVER_URL` (optional, default `github.com`), `GITHUB_PERMISSION` (optional, `read-only` | `read-write`, default `read-write`), `LOG_LEVEL` (optional, `debug` | `info` | `error`, default `info`).
- `GITHUB_SERVER_URL` accepts either a bare hostname or a full API base URL; normalize to `https://api.github.com` for `github.com`/unset, else `https://<host>/api/v3` unless the input already contains a path (then used as-is after ensuring an `https://` scheme).
- Transport selection is CLI-only: `--transport=stdio` (default) or `--transport=http --port=<n>` (default port `3000`). Never read transport choice from an env var.
- Single-tenant for both transports: one `Octokit` instance built once at startup, reused for every tool call.
- `GITHUB_PERMISSION=read-only` must prevent write-tool handlers from ever being registered with `McpServer` — not just block them at call time.
- All logging goes to `stderr` only, regardless of transport (stdout is reserved for the stdio JSON-RPC wire protocol). Verbosity gated by `LOG_LEVEL`.
- Tool responses return the raw octokit response body as JSON, unmodified. No field trimming, no text summarization.
- Errors propagate unmodified: catch the octokit `RequestError`, surface `error.message` (which already includes the GitHub `message` field) in an MCP tool error result. No normalization layer, no rate-limit special-casing.
- List tools take explicit `page` (default `1`) and `per_page` (default `30`, max `100`) parameters. No auto-pagination.
- No additional auth layer on the HTTP transport (trusted network context assumed).
- TypeScript only; bundled via `tsup` to a single-file CLI output for fast `npx` cold-start.

---

## File Structure

```
github-mcp-server-js/
  src/
    cli.ts                  # parses --transport/--port, builds server, connects transport
    server.ts                # buildServer(octokit, permission) -> McpServer, calls each toolset's register fn
    config.ts                # loads + validates env vars, normalizes GITHUB_SERVER_URL
    octokit-client.ts        # buildOctokitClient(config) -> Octokit
    logger.ts                # stderr-only logger gated by LOG_LEVEL
    toolsets/
      repos.ts                # registerReposTools(server, octokit, permission)
    transports/
      stdio.ts                # runStdio(server): connects McpServer to StdioServerTransport
      http.ts                  # runHttp(server, port): connects McpServer to WebStandardStreamableHTTPServerTransport, serves via Node http
  test/
    unit/
      config.test.ts
      octokit-client.test.ts
      toolsets/
        repos.test.ts
  package.json
  tsconfig.json
  tsup.config.ts
  eslint.config.js
  cspell.json
  .gitleaks.toml
  .husky/
    pre-commit
  .github/
    workflows/
      ci.yml
  .gitignore
  README.md
```

Each toolset file has one responsibility: register its own tools against an already-built `McpServer`/`Octokit` pair. `server.ts` knows the list of toolsets; toolsets know nothing about each other or about transports. Transports know nothing about toolsets — they only connect a pre-built `McpServer` to a `Transport`.

---

### Task 1: Project scaffolding

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `tsup.config.ts`
- Create: `.gitignore`
- Create: `eslint.config.js`
- Create: `cspell.json`

**Interfaces:**
- Produces: an installable Node project with `npm run build`, `npm run typecheck`, `npm run lint`, `npm run test`, `npm run spellcheck` scripts that later tasks rely on.

- [ ] **Step 1: Create `package.json`**

```json
{
  "name": "github-mcp-server-js",
  "version": "0.1.0",
  "description": "A GitHub MCP server built on octokit.js and the MCP TypeScript SDK v2",
  "type": "module",
  "bin": {
    "github-mcp-server-js": "dist/cli.js"
  },
  "files": [
    "dist"
  ],
  "engines": {
    "node": ">=20"
  },
  "scripts": {
    "build": "tsup",
    "dev": "tsx src/cli.ts",
    "typecheck": "tsc --noEmit",
    "lint": "eslint .",
    "spellcheck": "cspell \"**/*.{ts,md}\"",
    "test": "vitest run",
    "prepare": "husky"
  },
  "dependencies": {
    "@modelcontextprotocol/server": "^2.0.0",
    "@whatwg-node/server": "^0.11.0",
    "octokit": "^5.0.5",
    "zod": "^4.2.0"
  },
  "devDependencies": {
    "@modelcontextprotocol/client": "^2.0.0",
    "@types/node": "^24.0.0",
    "cspell": "^10.0.1",
    "eslint": "^10.8.0",
    "husky": "^9.1.7",
    "lint-staged": "^17.3.0",
    "nock": "^14.0.17",
    "tsup": "^8.5.1",
    "tsx": "^4.19.0",
    "typescript": "^5.7.0",
    "typescript-eslint": "^8.66.0",
    "vitest": "^4.1.10"
  }
}
```

- [ ] **Step 2: Create `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "lib": ["ES2022"],
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "noUncheckedIndexedAccess": true,
    "outDir": "dist"
  },
  "include": ["src", "test"]
}
```

- [ ] **Step 3: Create `tsup.config.ts`**

```typescript
import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/cli.ts'],
  format: ['esm'],
  target: 'node20',
  bundle: true,
  clean: true,
  banner: {
    js: '#!/usr/bin/env node',
  },
});
```

- [ ] **Step 4: Create `.gitignore`**

```
node_modules/
dist/
*.log
.env
```

- [ ] **Step 5: Create `eslint.config.js`**

```javascript
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: ['dist/**'],
  },
  ...tseslint.configs.recommended,
  {
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    },
  },
);
```

- [ ] **Step 6: Create `cspell.json`**

```json
{
  "version": "0.2",
  "language": "en",
  "words": [
    "octokit",
    "mcpb",
    "gitleaks",
    "cspell",
    "tsup",
    "codespaces",
    "dependabot",
    "toolsets"
  ],
  "ignorePaths": ["node_modules/**", "dist/**"]
}
```

- [ ] **Step 7: Install dependencies**

Run: `npm install`
Expected: installs succeed, `package-lock.json` is created.

- [ ] **Step 8: Verify scripts run on an empty `src/`**

Run: `npm run typecheck`
Expected: fails or is a no-op since `src/cli.ts` doesn't exist yet — that's fine, this step just confirms `tsc` executes without a config error. If it errors with "no inputs were found", that's expected and will resolve once Task 2 adds files.

- [ ] **Step 9: Commit**

```bash
git add package.json tsconfig.json tsup.config.ts .gitignore eslint.config.js cspell.json package-lock.json
git commit -m "chore: scaffold project (package.json, tsconfig, tsup, eslint, cspell)"
```

---

### Task 2: Config loading (`config.ts`)

**Files:**
- Create: `src/config.ts`
- Test: `test/unit/config.test.ts`

**Interfaces:**
- Produces:
  ```typescript
  export interface Config {
    githubToken: string;
    githubApiBaseUrl: string;   // normalized, e.g. "https://api.github.com" or "https://host/api/v3"
    permission: 'read-only' | 'read-write';
    logLevel: 'debug' | 'info' | 'error';
  }
  export function loadConfig(env: Record<string, string | undefined>): Config;
  export class ConfigError extends Error {}
  ```
- Consumes: nothing (pure function of an env-like object, passed explicitly for testability — do not read `process.env` directly inside `loadConfig`).

- [ ] **Step 1: Write the failing tests**

```typescript
// test/unit/config.test.ts
import { describe, expect, it } from 'vitest';
import { ConfigError, loadConfig } from '../../src/config.js';

describe('loadConfig', () => {
  it('throws when GITHUB_TOKEN is missing', () => {
    expect(() => loadConfig({})).toThrow(ConfigError);
  });

  it('defaults githubApiBaseUrl to api.github.com when GITHUB_SERVER_URL is unset', () => {
    const config = loadConfig({ GITHUB_TOKEN: 't' });
    expect(config.githubApiBaseUrl).toBe('https://api.github.com');
  });

  it('normalizes a bare Enterprise Server hostname to the /api/v3 base URL', () => {
    const config = loadConfig({ GITHUB_TOKEN: 't', GITHUB_SERVER_URL: 'github.mycompany.com' });
    expect(config.githubApiBaseUrl).toBe('https://github.mycompany.com/api/v3');
  });

  it('accepts a full API base URL and uses it as-is', () => {
    const config = loadConfig({
      GITHUB_TOKEN: 't',
      GITHUB_SERVER_URL: 'https://github.mycompany.com/api/v3',
    });
    expect(config.githubApiBaseUrl).toBe('https://github.mycompany.com/api/v3');
  });

  it('treats a bare "github.com" the same as unset', () => {
    const config = loadConfig({ GITHUB_TOKEN: 't', GITHUB_SERVER_URL: 'github.com' });
    expect(config.githubApiBaseUrl).toBe('https://api.github.com');
  });

  it('defaults permission to read-write', () => {
    const config = loadConfig({ GITHUB_TOKEN: 't' });
    expect(config.permission).toBe('read-write');
  });

  it('accepts GITHUB_PERMISSION=read-only', () => {
    const config = loadConfig({ GITHUB_TOKEN: 't', GITHUB_PERMISSION: 'read-only' });
    expect(config.permission).toBe('read-only');
  });

  it('rejects an invalid GITHUB_PERMISSION value', () => {
    expect(() => loadConfig({ GITHUB_TOKEN: 't', GITHUB_PERMISSION: 'nonsense' })).toThrow(
      ConfigError,
    );
  });

  it('defaults logLevel to info', () => {
    const config = loadConfig({ GITHUB_TOKEN: 't' });
    expect(config.logLevel).toBe('info');
  });

  it('rejects an invalid LOG_LEVEL value', () => {
    expect(() => loadConfig({ GITHUB_TOKEN: 't', LOG_LEVEL: 'verbose' })).toThrow(ConfigError);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run test/unit/config.test.ts`
Expected: FAIL — `Cannot find module '../../src/config.js'`

- [ ] **Step 3: Write the implementation**

```typescript
// src/config.ts
export interface Config {
  githubToken: string;
  githubApiBaseUrl: string;
  permission: 'read-only' | 'read-write';
  logLevel: 'debug' | 'info' | 'error';
}

export class ConfigError extends Error {}

const PERMISSIONS = ['read-only', 'read-write'] as const;
const LOG_LEVELS = ['debug', 'info', 'error'] as const;

function normalizeServerUrl(rawValue: string | undefined): string {
  if (!rawValue || rawValue === 'github.com') {
    return 'https://api.github.com';
  }

  const withScheme = rawValue.startsWith('http://') || rawValue.startsWith('https://')
    ? rawValue
    : `https://${rawValue}`;

  const url = new URL(withScheme);
  if (url.pathname === '/' || url.pathname === '') {
    url.pathname = '/api/v3';
  }
  return url.toString().replace(/\/$/, '');
}

export function loadConfig(env: Record<string, string | undefined>): Config {
  const githubToken = env.GITHUB_TOKEN;
  if (!githubToken) {
    throw new ConfigError('GITHUB_TOKEN environment variable is required');
  }

  const permission = env.GITHUB_PERMISSION ?? 'read-write';
  if (!PERMISSIONS.includes(permission as (typeof PERMISSIONS)[number])) {
    throw new ConfigError(
      `GITHUB_PERMISSION must be one of ${PERMISSIONS.join(', ')}, got "${permission}"`,
    );
  }

  const logLevel = env.LOG_LEVEL ?? 'info';
  if (!LOG_LEVELS.includes(logLevel as (typeof LOG_LEVELS)[number])) {
    throw new ConfigError(`LOG_LEVEL must be one of ${LOG_LEVELS.join(', ')}, got "${logLevel}"`);
  }

  return {
    githubToken,
    githubApiBaseUrl: normalizeServerUrl(env.GITHUB_SERVER_URL),
    permission: permission as Config['permission'],
    logLevel: logLevel as Config['logLevel'],
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run test/unit/config.test.ts`
Expected: PASS (10 tests)

- [ ] **Step 5: Commit**

```bash
git add src/config.ts test/unit/config.test.ts
git commit -m "feat: add env var config loading and validation"
```

---

### Task 3: Octokit client construction (`octokit-client.ts`)

**Files:**
- Create: `src/octokit-client.ts`
- Test: `test/unit/octokit-client.test.ts`

**Interfaces:**
- Consumes: `Config` from Task 2 (`config.githubToken`, `config.githubApiBaseUrl`).
- Produces:
  ```typescript
  export function buildOctokitClient(config: Config): Octokit;
  ```

- [ ] **Step 1: Write the failing test**

```typescript
// test/unit/octokit-client.test.ts
import { describe, expect, it } from 'vitest';
import type { Config } from '../../src/config.js';
import { buildOctokitClient } from '../../src/octokit-client.js';

function makeConfig(overrides: Partial<Config> = {}): Config {
  return {
    githubToken: 'test-token',
    githubApiBaseUrl: 'https://api.github.com',
    permission: 'read-write',
    logLevel: 'info',
    ...overrides,
  };
}

describe('buildOctokitClient', () => {
  it('configures the client with the given base URL', () => {
    const octokit = buildOctokitClient(
      makeConfig({ githubApiBaseUrl: 'https://github.mycompany.com/api/v3' }),
    );
    expect(octokit.request.endpoint.DEFAULTS.baseUrl).toBe(
      'https://github.mycompany.com/api/v3',
    );
  });

  it('configures the client with the given token', () => {
    const octokit = buildOctokitClient(makeConfig({ githubToken: 'secret-token' }));
    const headers = octokit.request.endpoint.DEFAULTS.headers as Record<string, string>;
    expect(headers.authorization).toContain('secret-token');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/unit/octokit-client.test.ts`
Expected: FAIL — `Cannot find module '../../src/octokit-client.js'`

- [ ] **Step 3: Write the implementation**

```typescript
// src/octokit-client.ts
import { Octokit } from 'octokit';
import type { Config } from './config.js';

export function buildOctokitClient(config: Config): Octokit {
  return new Octokit({
    auth: config.githubToken,
    baseUrl: config.githubApiBaseUrl,
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run test/unit/octokit-client.test.ts`
Expected: PASS (2 tests)

- [ ] **Step 5: Commit**

```bash
git add src/octokit-client.ts test/unit/octokit-client.test.ts
git commit -m "feat: build Octokit client from config"
```

---

### Task 4: Logger (`logger.ts`)

**Files:**
- Create: `src/logger.ts`

**Interfaces:**
- Consumes: `Config['logLevel']`.
- Produces:
  ```typescript
  export interface Logger {
    debug(message: string): void;
    info(message: string): void;
    error(message: string): void;
  }
  export function createLogger(logLevel: Config['logLevel']): Logger;
  ```

This module has no branching logic worth a unit test beyond "does it write to stderr, not stdout" — that's an integration property exercised implicitly once the CLI runs in Task 8. No dedicated test file; write the implementation directly.

- [ ] **Step 1: Write the implementation**

```typescript
// src/logger.ts
import type { Config } from './config.js';

export interface Logger {
  debug(message: string): void;
  info(message: string): void;
  error(message: string): void;
}

const LEVEL_RANK: Record<Config['logLevel'], number> = {
  debug: 0,
  info: 1,
  error: 2,
};

export function createLogger(logLevel: Config['logLevel']): Logger {
  const threshold = LEVEL_RANK[logLevel];

  function write(level: Config['logLevel'], message: string): void {
    if (LEVEL_RANK[level] >= threshold) {
      process.stderr.write(`[${level}] ${message}\n`);
    }
  }

  return {
    debug: (message) => write('debug', message),
    info: (message) => write('info', message),
    error: (message) => write('error', message),
  };
}
```

- [ ] **Step 2: Verify it compiles**

Run: `npx tsc --noEmit`
Expected: no errors related to `src/logger.ts` (errors about missing `src/cli.ts` etc. from other not-yet-written files are expected at this point and will clear as later tasks land).

- [ ] **Step 3: Commit**

```bash
git add src/logger.ts
git commit -m "feat: add stderr-only logger gated by LOG_LEVEL"
```

---

### Task 5: `repos` toolset — reference pattern for all future toolsets

This is the task every future toolset (in later plans) will copy. It establishes: how a toolset file is structured, how permission gating works, how pagination params are declared, how errors propagate, and how tools are tested.

Implements 8 tools from the design's `repos` toolset row: `get_repository`, `list_branches`, `get_branch`, `get_file_contents`, `create_or_update_file`, `list_commits`, `get_commit`, `list_tags`.

**Files:**
- Create: `src/toolsets/repos.ts`
- Test: `test/unit/toolsets/repos.test.ts`

**Interfaces:**
- Consumes: `Octokit` instance (Task 3), `Config['permission']` (Task 2), `McpServer` (from `@modelcontextprotocol/server`).
- Produces:
  ```typescript
  export function registerReposTools(
    server: McpServer,
    octokit: Octokit,
    permission: 'read-only' | 'read-write',
  ): void;
  ```
- This function is called once by `server.ts` in Task 6 — `buildServer` relies on this exact name and signature.

**Verified octokit endpoint mapping** (confirmed live against the installed `octokit@5.0.5` package):

| Tool name | octokit method | HTTP | Read/Write |
|---|---|---|---|
| `get_repository` | `octokit.rest.repos.get` | GET `/repos/{owner}/{repo}` | read |
| `list_branches` | `octokit.rest.repos.listBranches` | GET `/repos/{owner}/{repo}/branches` | read |
| `get_branch` | `octokit.rest.repos.getBranch` | GET `/repos/{owner}/{repo}/branches/{branch}` | read |
| `get_file_contents` | `octokit.rest.repos.getContent` | GET `/repos/{owner}/{repo}/contents/{path}` | read |
| `create_or_update_file` | `octokit.rest.repos.createOrUpdateFileContents` | PUT `/repos/{owner}/{repo}/contents/{path}` | write |
| `list_commits` | `octokit.rest.repos.listCommits` | GET `/repos/{owner}/{repo}/commits` | read |
| `get_commit` | `octokit.rest.repos.getCommit` | GET `/repos/{owner}/{repo}/commits/{ref}` | read |
| `list_tags` | `octokit.rest.repos.listTags` | GET `/repos/{owner}/{repo}/tags` | read |

- [ ] **Step 1: Write the failing tests**

```typescript
// test/unit/toolsets/repos.test.ts
import { McpServer } from '@modelcontextprotocol/server';
import { Client } from '@modelcontextprotocol/client';
import { InMemoryTransport } from '@modelcontextprotocol/server';
import { Octokit } from 'octokit';
import nock from 'nock';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { registerReposTools } from '../../../src/toolsets/repos.js';

async function connectedClient(permission: 'read-only' | 'read-write') {
  const octokit = new Octokit({ auth: 'test-token', baseUrl: 'https://api.github.com' });
  const server = new McpServer({ name: 'test-server', version: '0.0.0' });
  registerReposTools(server, octokit, permission);

  const client = new Client({ name: 'test-client', version: '0.0.0' });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await Promise.all([client.connect(clientTransport), server.connect(serverTransport)]);
  return client;
}

describe('registerReposTools', () => {
  afterEach(() => {
    nock.cleanAll();
  });

  it('registers get_repository and returns the raw GitHub response as JSON', async () => {
    nock('https://api.github.com')
      .get('/repos/octocat/hello-world')
      .reply(200, { id: 1, full_name: 'octocat/hello-world', default_branch: 'main' });

    const client = await connectedClient('read-write');
    const result = await client.callTool({
      name: 'get_repository',
      arguments: { owner: 'octocat', repo: 'hello-world' },
    });

    expect(result.isError).toBeFalsy();
    const text = (result.content as Array<{ type: string; text: string }>)[0]?.text ?? '';
    expect(JSON.parse(text)).toMatchObject({ full_name: 'octocat/hello-world' });
  });

  it('propagates a 404 as an MCP tool error with the raw GitHub message', async () => {
    nock('https://api.github.com')
      .get('/repos/octocat/missing-repo')
      .reply(404, { message: 'Not Found', documentation_url: 'https://docs.github.com/rest' });

    const client = await connectedClient('read-write');
    const result = await client.callTool({
      name: 'get_repository',
      arguments: { owner: 'octocat', repo: 'missing-repo' },
    });

    expect(result.isError).toBe(true);
    const text = (result.content as Array<{ type: string; text: string }>)[0]?.text ?? '';
    expect(text).toContain('Not Found');
  });

  it('passes page and per_page through to list_branches', async () => {
    nock('https://api.github.com')
      .get('/repos/octocat/hello-world/branches')
      .query({ page: '2', per_page: '10' })
      .reply(200, [{ name: 'develop' }]);

    const client = await connectedClient('read-write');
    const result = await client.callTool({
      name: 'list_branches',
      arguments: { owner: 'octocat', repo: 'hello-world', page: 2, per_page: 10 },
    });

    expect(result.isError).toBeFalsy();
    const text = (result.content as Array<{ type: string; text: string }>)[0]?.text ?? '';
    expect(JSON.parse(text)).toEqual([{ name: 'develop' }]);
  });

  it('does not register create_or_update_file in read-only mode', async () => {
    const client = await connectedClient('read-only');
    const { tools } = await client.listTools();
    expect(tools.map((tool) => tool.name)).not.toContain('create_or_update_file');
  });

  it('registers create_or_update_file in read-write mode', async () => {
    const client = await connectedClient('read-write');
    const { tools } = await client.listTools();
    expect(tools.map((tool) => tool.name)).toContain('create_or_update_file');
  });

  it('registers all 7 read-only tools regardless of permission', async () => {
    const client = await connectedClient('read-only');
    const { tools } = await client.listTools();
    const names = tools.map((tool) => tool.name);
    expect(names).toEqual(
      expect.arrayContaining([
        'get_repository',
        'list_branches',
        'get_branch',
        'get_file_contents',
        'list_commits',
        'get_commit',
        'list_tags',
      ]),
    );
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run test/unit/toolsets/repos.test.ts`
Expected: FAIL — `Cannot find module '../../../src/toolsets/repos.js'`

- [ ] **Step 3: Write the implementation**

```typescript
// src/toolsets/repos.ts
import type { McpServer } from '@modelcontextprotocol/server';
import type { Octokit } from 'octokit';
import { z } from 'zod';

const paginationSchema = {
  page: z.number().int().min(1).default(1),
  per_page: z.number().int().min(1).max(100).default(30),
};

function toToolResult(data: unknown) {
  return {
    content: [{ type: 'text' as const, text: JSON.stringify(data) }],
  };
}

function toToolError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return {
    isError: true,
    content: [{ type: 'text' as const, text: message }],
  };
}

export function registerReposTools(
  server: McpServer,
  octokit: Octokit,
  permission: 'read-only' | 'read-write',
): void {
  server.registerTool(
    'get_repository',
    {
      description: 'Get a GitHub repository by owner and name.',
      inputSchema: z.object({
        owner: z.string().describe('Repository owner (user or organization login)'),
        repo: z.string().describe('Repository name'),
      }),
    },
    async ({ owner, repo }) => {
      try {
        const response = await octokit.rest.repos.get({ owner, repo });
        return toToolResult(response.data);
      } catch (error) {
        return toToolError(error);
      }
    },
  );

  server.registerTool(
    'list_branches',
    {
      description: 'List branches in a GitHub repository.',
      inputSchema: z.object({
        owner: z.string().describe('Repository owner (user or organization login)'),
        repo: z.string().describe('Repository name'),
        ...paginationSchema,
      }),
    },
    async ({ owner, repo, page, per_page }) => {
      try {
        const response = await octokit.rest.repos.listBranches({ owner, repo, page, per_page });
        return toToolResult(response.data);
      } catch (error) {
        return toToolError(error);
      }
    },
  );

  server.registerTool(
    'get_branch',
    {
      description: 'Get a single branch in a GitHub repository.',
      inputSchema: z.object({
        owner: z.string().describe('Repository owner (user or organization login)'),
        repo: z.string().describe('Repository name'),
        branch: z.string().describe('Branch name'),
      }),
    },
    async ({ owner, repo, branch }) => {
      try {
        const response = await octokit.rest.repos.getBranch({ owner, repo, branch });
        return toToolResult(response.data);
      } catch (error) {
        return toToolError(error);
      }
    },
  );

  server.registerTool(
    'get_file_contents',
    {
      description: 'Get the contents of a file or directory in a GitHub repository.',
      inputSchema: z.object({
        owner: z.string().describe('Repository owner (user or organization login)'),
        repo: z.string().describe('Repository name'),
        path: z.string().describe('Path to the file or directory'),
        ref: z.string().optional().describe('Branch, tag, or commit SHA (defaults to the default branch)'),
      }),
    },
    async ({ owner, repo, path, ref }) => {
      try {
        const response = await octokit.rest.repos.getContent({ owner, repo, path, ref });
        return toToolResult(response.data);
      } catch (error) {
        return toToolError(error);
      }
    },
  );

  server.registerTool(
    'list_commits',
    {
      description: 'List commits in a GitHub repository.',
      inputSchema: z.object({
        owner: z.string().describe('Repository owner (user or organization login)'),
        repo: z.string().describe('Repository name'),
        sha: z.string().optional().describe('SHA or branch to list commits from'),
        path: z.string().optional().describe('Only commits touching this file path'),
        ...paginationSchema,
      }),
    },
    async ({ owner, repo, sha, path, page, per_page }) => {
      try {
        const response = await octokit.rest.repos.listCommits({
          owner,
          repo,
          sha,
          path,
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
    'get_commit',
    {
      description: 'Get a single commit in a GitHub repository.',
      inputSchema: z.object({
        owner: z.string().describe('Repository owner (user or organization login)'),
        repo: z.string().describe('Repository name'),
        ref: z.string().describe('Commit SHA, branch, or tag'),
      }),
    },
    async ({ owner, repo, ref }) => {
      try {
        const response = await octokit.rest.repos.getCommit({ owner, repo, ref });
        return toToolResult(response.data);
      } catch (error) {
        return toToolError(error);
      }
    },
  );

  server.registerTool(
    'list_tags',
    {
      description: 'List tags in a GitHub repository.',
      inputSchema: z.object({
        owner: z.string().describe('Repository owner (user or organization login)'),
        repo: z.string().describe('Repository name'),
        ...paginationSchema,
      }),
    },
    async ({ owner, repo, page, per_page }) => {
      try {
        const response = await octokit.rest.repos.listTags({ owner, repo, page, per_page });
        return toToolResult(response.data);
      } catch (error) {
        return toToolError(error);
      }
    },
  );

  if (permission === 'read-write') {
    server.registerTool(
      'create_or_update_file',
      {
        description: 'Create a new file or update an existing file in a GitHub repository.',
        inputSchema: z.object({
          owner: z.string().describe('Repository owner (user or organization login)'),
          repo: z.string().describe('Repository name'),
          path: z.string().describe('Path to the file'),
          message: z.string().describe('Commit message'),
          content: z.string().describe('New file content, Base64-encoded'),
          sha: z
            .string()
            .optional()
            .describe('Blob SHA of the file being replaced, required when updating an existing file'),
          branch: z.string().optional().describe('Branch to commit to (defaults to the default branch)'),
        }),
      },
      async ({ owner, repo, path, message, content, sha, branch }) => {
        try {
          const response = await octokit.rest.repos.createOrUpdateFileContents({
            owner,
            repo,
            path,
            message,
            content,
            sha,
            branch,
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

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run test/unit/toolsets/repos.test.ts`
Expected: PASS (6 tests)

- [ ] **Step 5: Commit**

```bash
git add src/toolsets/repos.ts test/unit/toolsets/repos.test.ts
git commit -m "feat: implement repos toolset (8 tools) with permission gating"
```

---

### Task 6: `McpServer` wiring (`server.ts`)

**Files:**
- Create: `src/server.ts`

**Interfaces:**
- Consumes: `Octokit` (Task 3), `Config['permission']` (Task 2), `registerReposTools` (Task 5).
- Produces:
  ```typescript
  export function buildServer(octokit: Octokit, permission: 'read-only' | 'read-write'): McpServer;
  ```
- Future toolset plans will add one line per new toolset to this function's body — this is the seam later plans extend.

- [ ] **Step 1: Write the implementation**

No dedicated unit test for this file: it's a thin composition function with no branching logic of its own (the branching lives inside each toolset). Its behavior is exercised end-to-end by the CLI smoke test in Task 8.

```typescript
// src/server.ts
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

- [ ] **Step 2: Verify it compiles**

Run: `npx tsc --noEmit`
Expected: no errors related to `src/server.ts` (errors about missing `src/cli.ts` are expected until Task 8).

- [ ] **Step 3: Commit**

```bash
git add src/server.ts
git commit -m "feat: wire McpServer construction and toolset registration"
```

---

### Task 7: Transports (`stdio.ts`, `http.ts`)

**Files:**
- Create: `src/transports/stdio.ts`
- Create: `src/transports/http.ts`

**Interfaces:**
- Consumes: `McpServer` (Task 6).
- Produces:
  ```typescript
  // stdio.ts
  export function runStdio(server: McpServer): Promise<void>;

  // http.ts
  export function runHttp(server: McpServer, port: number): Promise<void>;
  ```

No dedicated unit tests for transports: they are thin adapters over SDK-provided and third-party classes (`StdioServerTransport`, `WebStandardStreamableHTTPServerTransport`, `createServerAdapter`) whose own behavior is already tested upstream. They're exercised by the CLI smoke test in Task 8.

- [ ] **Step 1: Write `stdio.ts`**

```typescript
// src/transports/stdio.ts
import { StdioServerTransport } from '@modelcontextprotocol/server/stdio';
import type { McpServer } from '@modelcontextprotocol/server';

export async function runStdio(server: McpServer): Promise<void> {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}
```

- [ ] **Step 2: Write `http.ts`**

```typescript
// src/transports/http.ts
import { createServer } from 'node:http';
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/server';
import type { McpServer } from '@modelcontextprotocol/server';
import { createServerAdapter } from '@whatwg-node/server';

export async function runHttp(server: McpServer, port: number): Promise<void> {
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: () => crypto.randomUUID(),
  });
  await server.connect(transport);

  const adapter = createServerAdapter((request: Request) => transport.handleRequest(request));
  const httpServer = createServer(adapter);

  await new Promise<void>((resolve) => {
    httpServer.listen(port, resolve);
  });
}
```

- [ ] **Step 3: Verify it compiles**

Run: `npx tsc --noEmit`
Expected: no errors related to `src/transports/stdio.ts` or `src/transports/http.ts` (errors about missing `src/cli.ts` are expected until Task 8).

- [ ] **Step 4: Commit**

```bash
git add src/transports/stdio.ts src/transports/http.ts
git commit -m "feat: add stdio and HTTP transport adapters"
```

---

### Task 8: CLI entrypoint (`cli.ts`) + end-to-end smoke test

**Files:**
- Create: `src/cli.ts`
- Test: `test/unit/cli.test.ts`

**Interfaces:**
- Consumes: `loadConfig` (Task 2), `buildOctokitClient` (Task 3), `createLogger` (Task 4), `buildServer` (Task 6), `runStdio`/`runHttp` (Task 7).
- Produces: the executable entrypoint referenced by `package.json`'s `bin` field.

- [ ] **Step 1: Write the failing test**

This test exercises `parseArgs` in isolation (the pure, testable part of `cli.ts`); the full process startup (env loading + transport connection) is exercised manually in Step 5 rather than under vitest, since it opens real stdio/network handles.

```typescript
// test/unit/cli.test.ts
import { describe, expect, it } from 'vitest';
import { parseArgs } from '../../src/cli.js';

describe('parseArgs', () => {
  it('defaults to stdio transport with no arguments', () => {
    expect(parseArgs([])).toEqual({ transport: 'stdio', port: 3000 });
  });

  it('parses --transport=http', () => {
    expect(parseArgs(['--transport=http'])).toEqual({ transport: 'http', port: 3000 });
  });

  it('parses --transport=http --port=4000', () => {
    expect(parseArgs(['--transport=http', '--port=4000'])).toEqual({
      transport: 'http',
      port: 4000,
    });
  });

  it('throws on an unknown transport value', () => {
    expect(() => parseArgs(['--transport=carrier-pigeon'])).toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/unit/cli.test.ts`
Expected: FAIL — `Cannot find module '../../src/cli.js'`

- [ ] **Step 3: Write the implementation**

```typescript
// src/cli.ts
import { buildOctokitClient } from './octokit-client.js';
import { buildServer } from './server.js';
import { loadConfig } from './config.js';
import { createLogger } from './logger.js';
import { runHttp } from './transports/http.js';
import { runStdio } from './transports/stdio.js';

export interface CliArgs {
  transport: 'stdio' | 'http';
  port: number;
}

export function parseArgs(argv: string[]): CliArgs {
  let transport: CliArgs['transport'] = 'stdio';
  let port = 3000;

  for (const arg of argv) {
    if (arg.startsWith('--transport=')) {
      const value = arg.slice('--transport='.length);
      if (value !== 'stdio' && value !== 'http') {
        throw new Error(`Unknown --transport value: "${value}" (expected "stdio" or "http")`);
      }
      transport = value;
    } else if (arg.startsWith('--port=')) {
      port = Number.parseInt(arg.slice('--port='.length), 10);
    }
  }

  return { transport, port };
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const config = loadConfig(process.env);
  const logger = createLogger(config.logLevel);
  const octokit = buildOctokitClient(config);
  const server = buildServer(octokit, config.permission);

  if (args.transport === 'stdio') {
    logger.info('Starting github-mcp-server-js over stdio');
    await runStdio(server);
  } else {
    logger.info(`Starting github-mcp-server-js over HTTP on port ${args.port}`);
    await runHttp(server, args.port);
  }
}

main().catch((error: unknown) => {
  process.stderr.write(`Fatal error: ${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run test/unit/cli.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 5: Manual smoke test of the full stack**

Run:
```bash
npm run build
GITHUB_TOKEN=dummy-token node dist/cli.js --transport=http --port=3999 &
sleep 1
curl -s -X POST http://localhost:3999/ \
  -H 'Content-Type: application/json' \
  -H 'Accept: application/json, text/event-stream' \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"smoke-test","version":"0.0.0"}}}'
kill %1
```
Expected: the `curl` response is a JSON-RPC result containing `serverInfo.name: "github-mcp-server-js"` (exact response shape may include an `Mcp-Session-Id` header and SSE framing — confirm the process starts, logs to stderr, and responds without crashing; do not treat minor protocol-envelope differences as a failure).

- [ ] **Step 6: Commit**

```bash
git add src/cli.ts test/unit/cli.test.ts
git commit -m "feat: add CLI entrypoint with --transport/--port flags"
```

---

### Task 9: Pre-commit hooks (husky + lint-staged + cspell + gitleaks)

**Note on gitleaks distribution:** gitleaks is a Go binary, not an npm package —
there is no official `gitleaks` npm package (an unrelated, unofficial package
with that name exists on npm and must NOT be used). Install it via Homebrew
(`brew install gitleaks`) or download a release binary from
https://github.com/gitleaks/gitleaks/releases. The pre-commit hook below calls
the `gitleaks` binary directly (assumed to be on `PATH`), not via `npx`.

**Files:**
- Create: `.husky/pre-commit`
- Modify: `package.json` (add `lint-staged` config)
- Create: `.gitleaks.toml`

**Interfaces:** none — this task wires existing tools together, no application code.

- [ ] **Step 1: Install the gitleaks binary locally**

Run: `brew install gitleaks`
Expected: `gitleaks version` prints a version number. If Homebrew is unavailable, download the appropriate binary from the releases page above and ensure it's on `PATH`.

- [ ] **Step 2: Initialize husky**

Run: `npx husky init`
Expected: creates `.husky/pre-commit` and adds a `prepare` script to `package.json` (already present from Task 1).

- [ ] **Step 3: Add `lint-staged` config to `package.json`**

Add this top-level key to `package.json`:

```json
"lint-staged": {
  "*.ts": [
    "eslint --fix",
    "cspell"
  ]
}
```

- [ ] **Step 4: Write `.husky/pre-commit`**

```sh
npx tsc --noEmit
npx lint-staged
if command -v gitleaks >/dev/null 2>&1; then
  gitleaks protect --staged --no-banner
else
  echo "gitleaks not found on PATH — install via 'brew install gitleaks' to enable secret scanning locally. CI still enforces this." >&2
fi
```

- [ ] **Step 5: Write `.gitleaks.toml`**

```toml
title = "gitleaks config for github-mcp-server-js"

[extend]
useDefault = true
```

- [ ] **Step 6: Verify the hook blocks a secret (requires gitleaks installed from Step 1)**

Run:
```bash
echo 'const token = "ghp_1234567890abcdefghijklmnopqrstuvwxyz12";' > /tmp/leak-test.ts
cp /tmp/leak-test.ts src/leak-test.ts
git add src/leak-test.ts
git commit -m "test: verify pre-commit blocks secrets"
```
Expected: commit is rejected by `gitleaks protect --staged`. Then clean up:
```bash
git reset HEAD src/leak-test.ts
rm src/leak-test.ts /tmp/leak-test.ts
```

- [ ] **Step 7: Commit the hook setup**

```bash
git add .husky/pre-commit .gitleaks.toml package.json
git commit -m "chore: add pre-commit hooks (typecheck, lint, spellcheck, secret scan)"
```

---

### Task 10: CI workflow (GitHub Actions)

**Files:**
- Create: `.github/workflows/ci.yml`

**Interfaces:** none.

- [ ] **Step 1: Write `.github/workflows/ci.yml`**

```yaml
name: CI

on:
  pull_request:
  push:
    branches: [main]

jobs:
  ci:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0

      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'

      - run: npm ci

      - run: npm run typecheck

      - run: npm run lint

      - run: npm run spellcheck

      - run: npm audit --audit-level=high

      - name: Scan for secrets
        uses: gitleaks/gitleaks-action@v2
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}

      - run: npm test

      - run: npm run build
```

- [ ] **Step 2: Verify locally that each step's underlying command succeeds**

Run: `npm run typecheck && npm run lint && npm run spellcheck && npm test && npm run build`
Expected: all pass (this validates the workflow's commands before pushing; the workflow itself only runs on GitHub Actions).

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/ci.yml
git commit -m "ci: add GitHub Actions workflow (typecheck, lint, spellcheck, audit, secret scan, test, build)"
```

---

### Task 11: README

**Files:**
- Create: `README.md`

**Interfaces:** none.

- [ ] **Step 1: Write `README.md`**

```markdown
# github-mcp-server-js

A GitHub MCP server built on [octokit.js](https://github.com/octokit/octokit.js) and the
[MCP TypeScript SDK v2](https://github.com/modelcontextprotocol/typescript-sdk).

## Usage

```bash
npx github-mcp-server-js
```

Runs over stdio by default. For a standalone HTTP server:

```bash
npx github-mcp-server-js --transport=http --port=3000
```

## Configuration

| Variable | Required | Default | Description |
|---|---|---|---|
| `GITHUB_TOKEN` | Yes | — | Personal access token used for all GitHub API calls |
| `GITHUB_SERVER_URL` | No | `github.com` | GitHub host — bare hostname or full API base URL. Set this for GitHub Enterprise Server |
| `GITHUB_PERMISSION` | No | `read-write` | `read-only` or `read-write` |
| `LOG_LEVEL` | No | `info` | `debug`, `info`, or `error` |

## Toolsets

Currently implemented: `repos` (repository, branch, commit, tag, and file-contents tools).
Additional toolsets (issues, pull requests, actions, and more) are tracked in
`docs/superpowers/specs/2026-08-05-github-mcp-server-design.md`.
```

- [ ] **Step 2: Commit**

```bash
git add README.md
git commit -m "docs: add README with usage and configuration"
```

---

## Self-Review Notes

- **Spec coverage:** config (Task 2), Octokit client (Task 3), logger (Task 4), one full toolset with permission gating (Task 5), server wiring (Task 6), both transports (Task 7), CLI (Task 8), pre-commit (Task 9), CI (Task 10), README (Task 11) all map directly to spec sections. CD (`npm publish`, `.mcpb` build) and the remaining 15 toolsets are intentionally out of scope for this plan — tracked as separate follow-up plans and as Task #1 in the project task list.
- **Type consistency:** `Config['permission']` (`'read-only' | 'read-write'`) is defined once in Task 2 and reused verbatim in Tasks 3, 5, 6 rather than redeclared. `registerReposTools(server, octokit, permission)` signature in Task 5 matches its call site in Task 6 exactly.
- **No placeholders:** every step includes complete, runnable code verified against the real `@modelcontextprotocol/server@2.0.0`, `octokit@5.0.5`, and `@whatwg-node/server@0.11.0` APIs (inspected directly from installed packages, not guessed from docs).
