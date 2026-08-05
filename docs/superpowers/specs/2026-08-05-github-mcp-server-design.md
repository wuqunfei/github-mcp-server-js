# github-mcp-server-js — Design

## Overview

A general-purpose MCP server exposing GitHub functionality through hand-curated
tools built on `octokit.js`, implemented against the MCP TypeScript SDK v2
(`@modelcontextprotocol/server` / `@modelcontextprotocol/client`, v2.0.0+).
Distributed as an npm package (`github-mcp-server-js`) runnable via
`npx github-mcp-server-js`, and additionally packaged as a Claude Desktop
Extension (`.mcpb` bundle) for one-click install.

## Configuration

Four environment variables, shared by both transports:

| Variable | Required | Default | Purpose |
|---|---|---|---|
| `GITHUB_TOKEN` | Yes | — | Personal access token used for all GitHub API calls |
| `GITHUB_SERVER_URL` | No | `github.com` | GitHub host. Accepts either a bare hostname (e.g. `github.mycompany.com`) or a full API base URL (e.g. `https://github.mycompany.com/api/v3`). Normalized internally: `github.com` → `https://api.github.com`; any other host → `https://<host>/api/v3` (GitHub Enterprise Server convention), unless the input already includes a path, in which case it is used as-is. |
| `GITHUB_PERMISSION` | No | `read-write` | `read-only` \| `read-write`. Gates which tools are registered with the MCP server at startup — in `read-only` mode, write/mutating tool handlers are never registered, so the LLM client cannot see or call them. |
| `LOG_LEVEL` | No | `info` | `debug` \| `info` \| `error`. Controls verbosity of diagnostic logging. |

Both the stdio and HTTP transports are **single-tenant**: one `Octokit` client
is constructed once at startup from these env vars and reused for every tool
call, regardless of transport or caller.

## Transport & Runtime Architecture

Two thin transport wrappers around one shared core.

```
src/
  cli.ts              # parses --transport / --port, dispatches to a transport
  server.ts           # builds McpServer instance, registers tools from all toolsets
  octokit-client.ts   # builds the single Octokit instance from env vars
  toolsets/
    repos.ts
    issues.ts
    pull_requests.ts
    actions.ts
    code_security.ts
    search.ts
    orgs_teams.ts
    users.ts
    projects.ts
    gists.ts
    packages.ts
    activity.ts
    apps.ts
    codespaces.ts
    copilot.ts
    misc.ts
  transports/
    stdio.ts
    http.ts
```

**Startup sequence** (identical for both transports):
1. Read and validate env vars.
2. Build one `Octokit` client (`octokit-client.ts`).
3. Build an `McpServer` instance.
4. For each toolset file, call its `register*Tools(server, octokit, permission)`
   function; each function internally skips registering write tools when
   `GITHUB_PERMISSION=read-only`.
5. Connect the transport selected via CLI flag.

**CLI flags** (transport selection is CLI-only, not env-driven):
```
npx github-mcp-server-js                              # stdio (default)
npx github-mcp-server-js --transport=http --port=3000  # Streamable HTTP
```

- `stdio.ts` uses the SDK's `StdioServerTransport`. This is the default and
  is required both for direct `npx` usage in MCP clients (Claude Desktop,
  Claude Code, Cursor, etc.) and for the `.mcpb` bundle, which spawns the
  server as a local child process.
- `http.ts` uses the SDK's Streamable HTTP transport. Single-tenant, no
  additional authentication layer on the HTTP endpoint — it is assumed to
  run in a trusted network context (localhost / internal VPN).

Each toolset module is independently understandable and testable: it takes
the shared `McpServer` and `Octokit` instances and the effective permission
mode, and registers only its own tools.

## Toolset Inventory

All 16 toolsets are active by default, with no enable/disable filtering
(`GITHUB_PERMISSION` is the only registration-time filter, applied uniformly
across toolsets). Tool counts are estimates for v1 and will be refined during
implementation; total is expected to land around ~110 tools, of which roughly
half are read-only.

| Toolset | octokit REST namespaces | Example tools | Est. count |
|---|---|---|---|
| `repos` | repos, git, licenses, gitignore | get_repo, list_branches, get_file_contents, create_or_update_file, list_commits, get_commit, list_tags, create_branch | ~15 |
| `issues` | issues, reactions, interactions | list_issues, get_issue, create_issue, update_issue, add_comment, list_labels | ~10 |
| `pull_requests` | pulls | list_prs, get_pr, create_pr, merge_pr, list_pr_files, create_review, list_reviews | ~10 |
| `actions` | actions, checks | list_workflows, run_workflow, list_workflow_runs, get_run, list_artifacts, get_check_runs | ~12 |
| `code_security` | codeScanning, codeSecurity, secretScanning, securityAdvisories, dependabot, dependencyGraph | list_code_scanning_alerts, list_secret_scanning_alerts, list_dependabot_alerts, get_advisory | ~10 |
| `search` | search | search_code, search_repos, search_issues, search_users, search_commits | ~5 |
| `orgs_teams` | orgs, teams | list_org_repos, get_org, list_teams, list_team_members | ~8 |
| `users` | users | get_user, get_authenticated_user, list_followers | ~5 |
| `projects` | projects | list_projects, get_project, list_project_items | ~5 |
| `gists` | gists | list_gists, create_gist, get_gist, update_gist | ~5 |
| `packages` | packages | list_packages, get_package_version | ~4 |
| `activity` | activity | list_notifications, star_repo, list_starred | ~5 |
| `apps` | apps, oidc | get_app, list_installations | ~3 |
| `codespaces` | codespaces | list_codespaces, create_codespace, stop_codespace | ~5 |
| `copilot` | copilot | get_copilot_seat_details, list_copilot_usage | ~3 |
| `misc` | meta, emojis, markdown, rateLimit, billing, campaigns, credentials, hostedCompute, privateRegistries, migrations, enterpriseTeam*, codesOfConduct | get_rate_limit, render_markdown | ~4 |

Note: GitHub Discussions are GraphQL-only (not covered by octokit's REST
plugin) and are excluded from v1 scope.

Within each toolset, operations are hand-curated (not a 1:1 mapping of every
octokit method) — each exposed tool gets its own name, description, and Zod
input schema, following the pattern of the official Go-based
`github/github-mcp-server`. This keeps per-tool schemas precise (better LLM
tool-call accuracy) versus a generic dispatch-by-operation-name tool.

## Pagination

List tools expose `page` and `per_page` as explicit parameters (default
`per_page=30`, max `100`), matching GitHub's raw REST API pagination model.
No auto-pagination and no cursor abstraction — callers request additional
pages explicitly.

## Response Format

Tool responses return the octokit response body as raw JSON, unmodified. No
field trimming or text-summarization layer. Keeps tool implementations thin;
the LLM client is responsible for extracting relevant fields.

## Error Handling

Octokit errors propagate as-is into the MCP tool error result — no
normalization layer, no special-casing (including rate limits). Kept
consistent with the raw-JSON response philosophy: thin tool logic, no
custom error-shape abstraction.

## Logging

All logging goes to `stderr` regardless of transport (stdout is reserved for
JSON-RPC protocol messages in stdio mode — writing anything else to stdout
corrupts the protocol stream). Verbosity controlled by `LOG_LEVEL`
(`debug` / `info` / `error`).

## Language & Build

TypeScript, bundled via `tsup`/`esbuild` into a single-file CLI for fast
`npx` cold-start (avoids `tsc`'s many-small-files output and its
`node_modules` resolution overhead at startup). Tool input schemas defined
with Zod.

## Testing

- **Unit tests** (primary safety net, always run in CI): one test file per
  toolset, HTTP mocked via `nock`/MSW. Cover successful calls, input
  validation, and error propagation per tool.
- **Integration tests** (opt-in): real API calls against a small set of
  representative tools (e.g. `get_repo`, `list_issues`) against a public
  repo. Automatically skipped in CI unless a test `GITHUB_TOKEN` secret is
  present.

## Pre-commit & CI/CD

**Pre-commit** (`husky` + `lint-staged`, on `git commit`):
1. `tsc --noEmit` — typecheck
2. `eslint --fix` — lint (staged files)
3. `cspell` — spellcheck on staged files, including tool description
   strings (typos there can cause an LLM to misuse or skip a tool)
4. `gitleaks protect --staged` — block commits containing secrets

**CI** (GitHub Actions, on every PR and push to `main`):
1. `npm ci`
2. `tsc --noEmit`
3. `eslint .`
4. `cspell "**/*.{ts,md}"`
5. `npm audit --audit-level=high`
6. `gitleaks detect` (full history scan — backstops any `--no-verify` bypass
   of the pre-commit hook)
7. `npm test` (unit; integration tests only run if `GITHUB_TOKEN` secret set)
8. `npm run build` (verifies the tsup bundle compiles cleanly)

**CD** (GitHub Actions, on GitHub Release published / version tag push):
1. Re-run full CI suite as a gate
2. `npm publish` (requires `NPM_TOKEN` secret — to be supplied later)
3. Build `.mcpb` bundle via `@anthropic-ai/mcpb pack`, attach as a release
   asset

## Claude Desktop Extension (.mcpb) Packaging

In addition to the plain npm package, the server is packaged as a `.mcpb`
bundle (per https://www.anthropic.com/engineering/desktop-extensions) so
Claude Desktop users can install it by dragging the file into
Settings > Extensions, with no terminal or manual config editing.

- `manifest.json` declares `server.type = "node"`, an `entry_point` pointing
  at the bundled stdio server, and a `user_config` block mapping each of the
  4 env vars to a form field:

  | Env var | `user_config` field type | `sensitive` |
  |---|---|---|
  | `GITHUB_TOKEN` | string (required) | `true` — stored in OS keychain |
  | `GITHUB_SERVER_URL` | string, default `github.com` | `false` |
  | `GITHUB_PERMISSION` | enum (`read-only` / `read-write`), default `read-write` | `false` |
  | `LOG_LEVEL` | enum (`debug` / `info` / `error`), default `info` | `false` |

- Applies to the **stdio transport only** — `.mcpb` bundles are spawned by
  Claude Desktop as a local child process; the HTTP transport is out of
  scope for this packaging path.
- Built via `@anthropic-ai/mcpb init` / `pack` (npm package
  `@anthropic-ai/mcpb`), wired into the CD pipeline as a release asset.

## Project Scaffolding

```
github-mcp-server-js/
  src/
    cli.ts
    server.ts
    octokit-client.ts
    toolsets/            (16 files, one per toolset)
    transports/
      stdio.ts
      http.ts
  test/
    unit/                (mirrors toolsets/)
    integration/
  manifest.json           (.mcpb manifest)
  .github/workflows/
    ci.yml
    release.yml
  package.json
  tsconfig.json
  tsup.config.ts
  eslint.config.js
  cspell.json
  .gitleaks.toml
  README.md
```
