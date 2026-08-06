<p align="center">
  <img src="./assets/icon-248.png" alt="github-mcp-server-js logo — the GitHub Octocat reimagined as a cat-suited kitten" width="200" />
</p>
<h2 align="center">Github-MCP-Server-JS</h2>

<p align="center">
  <strong>🚀 A pure Node.js GitHub MCP server for Claude Desktop and any MCP-compatible client — ⚡ 104 REST tools across 16 toolsets, 🚫 no Docker, 🚫 no Go, 🚫 no python. ✨</strong>
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/github-mcp-server-js"><img src="https://img.shields.io/npm/v/github-mcp-server-js.svg" alt="npm version" /></a>
  <a href="https://nodejs.org/"><img src="https://img.shields.io/node/v/github-mcp-server-js.svg" alt="node" /></a>
  <a href="./LICENSE"><img src="https://img.shields.io/npm/l/github-mcp-server-js.svg" alt="license" /></a>
  <a href="https://github.com/wuqunfei/github-mcp-server-js/actions/workflows/ci.yml"><img src="https://github.com/wuqunfei/github-mcp-server-js/actions/workflows/ci.yml/badge.svg" alt="CI" /></a>
</p>

Built exclusively on the two **first-party SDKs from the official providers** — no custom HTTP client, no hand-rolled protocol layer:

- 🐙 **[Octokit.js](https://github.com/octokit/octokit.js)** — GitHub's official REST/GraphQL client. Every tool in this server is a thin, typed wrapper around a verified `octokit.rest.*` method.
- 🤖 **[MCP TypeScript](https://github.com/modelcontextprotocol/typescript-sdk)** — Anthropic's official Model Context Protocol server SDK.

## ✨ Highlights

- 🧰 **Complete surface** — 104 tools across 16 toolsets (issues, pull requests, actions, code security, Copilot admin, ProjectsV2, and more).
- 🔒 **Secure by default** — flip `GITHUB_PERMISSION=read-only` and every mutating tool is never even registered.
- 📦 **Three install channels** — npm (`npx`), Claude Desktop Extension (`.mcpb`), or unpacked extension (`.zip`).
- ✅ **Signed releases** — every version built by GitHub Actions with npm provenance and Sigstore attestation.
- 🧪 **Three-tier test suite** — 211 hermetic unit tests (nock-mocked) plus a 25-assertion read-only integration suite and 2 state-preserving write round-trips against the real GitHub API.
- 🪶 **Zero heavy runtime** — pure Node 24+, no Docker, no Go, single-file bundle (~2 MB).

---

## 💡 Why this project exists

Five gaps in the current GitHub-MCP landscape:

- 🏢 **No remote MCP on enterprise GitHub.** GHES and most managed enterprise deployments don't yet expose a remote MCP endpoint — run a local server yourself.

- 🗄️ **The Anthropic reference server is deprecated.** [`@modelcontextprotocol/server-github`](https://www.npmjs.com/package/@modelcontextprotocol/server-github) is [archived](https://github.com/modelcontextprotocol/servers-archived/tree/main/src/github). No fixes, no new tools.

- 🐳 **The newer official server needs Docker + Go.** [github/github-mcp-server](https://github.com/github/github-mcp-server) ships as a Docker-run Go binary — often blocked by enterprise policy.

- 🧰 **Broader tool coverage.** 104 tools across 16 toolsets — a superset of the archived `server-github` and typical `gh`-CLI wrappers. See [Toolsets](#toolsets) for the full list.

- 🔒 **Read-only mode is one env var.** `GITHUB_PERMISSION=read-only` registers only the 76 read tools; the 28 mutating operations (`create_issue`, `merge_pull_request`, `star_repo`, `run_workflow`, …) are never exposed to the model. Same binary, one variable, verified by tests.

**`github-mcp-server-js` fills all five** — pure Node 24+ / TypeScript, single-file bundle, `npx`-installable, shipped as both an npm package and a Claude Desktop Extension.

---

## 🚀 Quick start

Pick one of three install paths, from easiest to most hands-on.

### ⚡ Path 1 — `npx` from Claude Desktop config *(recommended for CLI users)*

Edit your Claude Desktop config file:

- **macOS:** `~/Library/Application Support/Claude/claude_desktop_config.json`
- **Windows:** `%APPDATA%\Claude\claude_desktop_config.json`

Add this entry (create the file with `{ "mcpServers": {} }` if it doesn't exist):

```json
{
  "mcpServers": {
    "github": {
      "command": "npx",
      "args": ["-y", "github-mcp-server-js"],
      "env": {
        "GITHUB_TOKEN": "ghp_your_personal_access_token_here",
        "GITHUB_SERVER_URL": "github.com",
        "GITHUB_PERMISSION": "read-write",
        "LOG_LEVEL": "info"
      }
    }
  }
}
```

Only `GITHUB_TOKEN` is required — the other three are shown with their defaults so you can see every knob at a glance. Common adjustments:

- **GitHub Enterprise Server:** `"GITHUB_SERVER_URL": "github.mycompany.com"` (bare hostname is fine; the server appends `/api/v3` automatically).
- **Read-only mode:** `"GITHUB_PERMISSION": "read-only"` — the 28 mutating tools (`create_issue`, `merge_pull_request`, `star_repo`, `run_workflow`, …) are never registered.
- **Verbose logs:** `"LOG_LEVEL": "debug"` prints every request/response summary to stderr; Claude Desktop surfaces stderr in its MCP log. Every line is already JSON — no separate format flag needed.

Restart Claude Desktop. All 104 tools become available in every new chat.

The server can also run standalone from any terminal:

```bash
npx github-mcp-server-js                                # stdio (for MCP clients)
npx github-mcp-server-js --transport=http --port=3000   # standalone HTTP
```

### 🖱️ Path 2 — Claude Desktop Extension via drag-drop (`.mcpb`)

No config-file editing required; the token is stored in the OS keychain.

1. Download `github-mcp-server-js-<version>.mcpb` from the latest [GitHub Release](https://github.com/wuqunfei/github-mcp-server-js/releases).
2. Open **Claude Desktop → Settings → Extensions**.
3. **Drag the `.mcpb` file** into the Extensions pane.
4. Fill in your `GITHUB_TOKEN` (masked; stored in the macOS / Windows keychain, never in plaintext). The remaining fields carry sensible defaults.
5. Click **Install**. All 104 tools are immediately available.

### 🛠️ Path 3 — Claude Desktop unpacked extension (`.zip`, developer mode)

Claude Desktop also supports loading an **unpacked** extension from a directory. This is useful when you want to inspect the manifest, hot-swap `dist/cli.js`, or work behind a corporate proxy that blocks `.mcpb` downloads.

1. Download `github-mcp-server-js-<version>.zip` from the latest [GitHub Release](https://github.com/wuqunfei/github-mcp-server-js/releases). The archive is byte-identical to the `.mcpb`; only the extension differs so stock `unzip` tooling can open it.
2. Extract: `unzip github-mcp-server-js-<version>.zip -d github-mcp-server-js`.
3. In **Claude Desktop → Settings → Extensions**, enable **developer mode** if it isn't already on.
4. Click **Install unpacked extension** and select the extracted directory.
5. Fill in `GITHUB_TOKEN` as in Path 2.

Edits to `manifest.json` or `dist/cli.js` in the extracted directory take effect on the next Claude Desktop reload — useful for local iteration on a fork.

### 🏗️ Build the bundles yourself

```bash
git clone https://github.com/wuqunfei/github-mcp-server-js
cd github-mcp-server-js
npm ci
npm run pack:mcpb
# → dist/github-mcp-server-js-<version>.mcpb
# → dist/github-mcp-server-js-<version>.zip  (byte-identical copy)
```

---

## ⚙️ Configuration

Configuration is entirely via environment variables. Claude Desktop sets them from the `.mcpb` user-config form; for `npx` installs you set them yourself.

| Variable | Required | Default | Description |
|---|---|---|---|
| `GITHUB_TOKEN` | Yes | — | Personal access token used for all GitHub API calls. |
| `GITHUB_SERVER_URL` | No | `github.com` | GitHub host — bare hostname or full API base URL. Set this for GitHub Enterprise Server. |
| `GITHUB_PERMISSION` | No | `read-write` | `read-only` (registers 76 read tools) or `read-write` (all 104). |
| `LOG_LEVEL` | No | `info` | `debug`, `info`, or `error`. Every tool call logs `tool_call` / `tool_ok` / `tool_error` as one JSON object per stderr line, plus an MCP `notifications/message` for the connected client. |

## 🧰 Toolsets

All 16 toolsets are shipped, exposing **104 tools** total. Write tools are only registered when `GITHUB_PERMISSION=read-write` (the default); `read-only` mode registers the read tools alone. The **Access** column indicates: **R** = registered in read-only mode; **W** = registered only in read-write mode.

### 📁 `repos` — repositories, branches, commits, tags, file contents

| Tool | Access | Description |
|---|---|---|
| `get_repository` | R | Get a GitHub repository by owner and name. |
| `list_branches` | R | List branches in a repository. |
| `get_branch` | R | Get a single branch in a repository. |
| `get_file_contents` | R | Get the contents of a file or directory in a repository. |
| `list_commits` | R | List commits in a repository. |
| `get_commit` | R | Get a single commit in a repository. |
| `list_tags` | R | List tags in a repository. |
| `create_or_update_file` | W | Create a new file or update an existing file in a repository. |

### 🐛 `issues` — issue CRUD, comments, labels, conversation locking

| Tool | Access | Description |
|---|---|---|
| `list_issues` | R | List issues in a repository. |
| `get_issue` | R | Get a single issue in a repository. |
| `list_comments` | R | List comments on an issue. |
| `list_labels` | R | List all labels defined in a repository. |
| `list_labels_on_issue` | R | List the labels currently applied to an issue. |
| `create_issue` | W | Create a new issue in a repository. |
| `update_issue` | W | Update an existing issue. |
| `add_comment` | W | Add a comment to an issue. |
| `add_labels` | W | Add labels to an issue, keeping the issue's existing labels. |
| `remove_label` | W | Remove a single label from an issue. |
| `lock_issue` | W | Lock an issue conversation to collaborators only. |
| `unlock_issue` | W | Unlock a previously locked issue conversation. |

### 🔀 `pull_requests` — PR listing, creation, merging, reviews

| Tool | Access | Description |
|---|---|---|
| `list_pull_requests` | R | List pull requests in a repository. |
| `get_pull_request` | R | Get a single pull request. |
| `list_pull_request_files` | R | List the files changed in a pull request. |
| `list_pull_request_commits` | R | List the commits on a pull request. |
| `list_pull_request_reviews` | R | List the reviews on a pull request. |
| `create_pull_request` | W | Create a new pull request. |
| `update_pull_request` | W | Update an existing pull request. |
| `merge_pull_request` | W | Merge a pull request. |
| `create_pull_request_review` | W | Create a review on a pull request. |
| `request_reviewers` | W | Request reviewers for a pull request. |

### 🔎 `search` — repo, code, commit, issue/PR, user search

| Tool | Access | Description |
|---|---|---|
| `search_repos` | R | Search GitHub repositories. `q` accepts GitHub search qualifiers (e.g. `stars:>100 language:go`). |
| `search_code` | R | Search code across GitHub. `q` accepts code-search qualifiers (e.g. `repo:foo/bar in:file`). |
| `search_commits` | R | Search commits on default branches. `q` accepts commit-search qualifiers. |
| `search_issues` | R | Search issues and pull requests (scope with `is:issue` or `is:pull-request`). |
| `search_users` | R | Search GitHub users. |

### 👤 `users` — profiles, followers, following, hovercard

| Tool | Access | Description |
|---|---|---|
| `get_user_by_username` | R | Get public information about a user by login. |
| `get_authenticated_user` | R | Get the profile of the currently authenticated user (owner of `GITHUB_TOKEN`). |
| `list_user_followers` | R | List the users who follow a given user. |
| `list_user_following` | R | List the users that a given user follows. |
| `get_user_hovercard` | R | Get contextual "hovercard" information about a user, optionally scoped to a subject. |

### 📝 `gists` — list, get, create, update, delete gists

| Tool | Access | Description |
|---|---|---|
| `list_gists` | R | List gists for the authenticated user. |
| `get_gist` | R | Get a single gist by id (full file content included). |
| `create_gist` | W | Create a new gist (one or more files, public or secret). |
| `update_gist` | W | Update an existing gist: change description, add/rename/delete files. |
| `delete_gist` | W | Delete a gist (permanent — only the owner can delete). |

### 🔔 `activity` — notifications, starred repos, star/unstar

| Tool | Access | Description |
|---|---|---|
| `list_notifications` | R | List notifications for the authenticated user (paginated, max 50/page). |
| `list_starred_repos` | R | List repositories starred by the authenticated user. |
| `check_repo_starred` | R | Check whether the authenticated user has starred a repository. Returns `{ starred: boolean }`. |
| `star_repo` | W | Star a repository on behalf of the authenticated user. |
| `unstar_repo` | W | Unstar a repository the authenticated user previously starred. |

### 📦 `packages` — GitHub Packages owned by the authenticated user

Requires the `read:packages` token scope. `package_type` is required and must be
one of `npm`, `maven`, `rubygems`, `docker`, `nuget`, `container`.

| Tool | Access | Description |
|---|---|---|
| `list_packages_for_authenticated_user` | R | List packages owned by the authenticated user for a given package type. |
| `get_package_for_authenticated_user` | R | Get a specific package owned by the authenticated user. |
| `list_package_versions_for_authenticated_user` | R | List all versions of a package owned by the authenticated user. |
| `get_package_version_for_authenticated_user` | R | Get a specific version of a package owned by the authenticated user. |

### 🔧 `misc` — utility endpoints

| Tool | Access | Description |
|---|---|---|
| `get_rate_limit` | R | Get the current API rate-limit status for the authenticated user. |
| `get_meta` | R | Get GitHub API metadata: IP ranges, SSH keys, and service host info. |
| `list_emojis` | R | List all emoji names and their image URLs available on GitHub. |
| `render_markdown` | R | Render a Markdown string to HTML using GitHub's renderer (returns raw HTML). |

### 🔌 `apps` — GitHub App public info and user installations

| Tool | Access | Description |
|---|---|---|
| `get_app` | R | Get public metadata for a GitHub App by URL slug. |
| `list_installations_for_authenticated_user` | R | List GitHub App installations accessible to the authenticated user. |
| `list_installation_repos_for_authenticated_user` | R | List repositories the authenticated user can access under a specific installation. |

### 🪄 `copilot` — Copilot org-admin (org-owner PAT required)

| Tool | Access | Description |
|---|---|---|
| `get_copilot_organization_details` | R | Get Copilot seat breakdown and policy settings for an organization. |
| `list_copilot_seats` | R | List all Copilot seat assignments in an organization. |
| `get_copilot_seat_details_for_user` | R | Get Copilot seat details (last activity, editor) for a specific org member. |

### 🏢 `orgs_teams` — organization inspection and team membership

| Tool | Access | Description |
|---|---|---|
| `get_org` | R | Get a GitHub organization by login. |
| `list_org_members` | R | List members of an organization. |
| `list_org_repos` | R | List repositories in an organization. |
| `list_teams` | R | List teams in an organization. |
| `get_team_by_name` | R | Get a team by its slug within an organization. |
| `list_team_members` | R | List the members of a team. |
| `add_or_update_team_membership` | W | Add a user to a team or update their role (requires org-owner or team-maintainer). |
| `remove_team_membership` | W | Remove a user from a team (requires org-owner or team-admin). |

### 💻 `codespaces` — user codespace lifecycle

| Tool | Access | Description |
|---|---|---|
| `list_codespaces` | R | List codespaces for the authenticated user. |
| `get_codespace` | R | Get a codespace by name for the authenticated user. |
| `create_codespace_in_repo` | W | Create a codespace in a repository for the authenticated user. |
| `start_codespace` | W | Start a stopped codespace. |
| `stop_codespace` | W | Stop a running codespace. |

### 📋 `projects` — GitHub ProjectsV2 (org-scoped, read-only)

| Tool | Access | Description |
|---|---|---|
| `list_org_projects` | R | List ProjectsV2 projects in an organization. |
| `get_org_project` | R | Get a ProjectsV2 project by its number. |
| `list_org_project_items` | R | List items in a ProjectsV2 project. |
| `list_org_project_fields` | R | List fields configured on a ProjectsV2 project. |
| `get_org_project_item` | R | Get a single item in a ProjectsV2 project. |

### 🛡️ `code_security` — code scanning, secrets, Dependabot, advisories

Alert-inspection tools require the `security_events` PAT scope (or `public_repo`
for public repositories).

| Tool | Access | Description |
|---|---|---|
| `list_code_scanning_alerts` | R | List code-scanning alerts for a repository. |
| `get_code_scanning_alert` | R | Get a code-scanning alert. |
| `list_secret_scanning_alerts` | R | List secret-scanning alerts for a repository. |
| `get_secret_scanning_alert` | R | Get a secret-scanning alert. |
| `list_dependabot_alerts` | R | List Dependabot alerts for a repository. |
| `get_dependabot_alert` | R | Get a Dependabot alert. |
| `list_global_advisories` | R | List GitHub Global Security Advisories (public GHSA database). |
| `get_global_advisory` | R | Get a global GitHub security advisory by GHSA ID. |
| `list_repository_advisories` | R | List repository security advisories. |
| `get_repository_advisory` | R | Get a repository security advisory by GHSA ID. |

### 🎬 `actions` — workflows, runs, jobs, artifacts, check runs

| Tool | Access | Description |
|---|---|---|
| `list_workflows` | R | List workflows in a repository. |
| `get_workflow` | R | Get a workflow by ID or filename (e.g. `ci.yml`). |
| `list_workflow_runs` | R | List runs for a workflow (filter by status, branch, event, actor). |
| `get_workflow_run` | R | Get a workflow run by ID. |
| `list_workflow_run_jobs` | R | List jobs for a workflow run. |
| `list_workflow_run_artifacts` | R | List artifacts produced by a workflow run. |
| `list_check_runs_for_ref` | R | List check runs for a Git ref (SHA, branch, or tag). |
| `run_workflow` | W | Trigger a `workflow_dispatch` event for a workflow. |
| `cancel_workflow_run` | W | Cancel a workflow run. |
| `rerun_workflow_run` | W | Re-run a workflow run. |
| `rerun_workflow_run_failed_jobs` | W | Re-run only the failed jobs in a workflow run. |
| `approve_workflow_run` | W | Approve a workflow run awaiting fork-PR approval. |

See `docs/superpowers/specs/2026-08-05-github-mcp-server-design.md` for the full
architecture.

## 🧪 Testing

The suite is organized in three tiers, each with a distinct purpose and
different guarantees. All three run against the same source; only the
network scope and the presence of `GITHUB_TOKEN` differ.

### 1. Unit tests — hermetic, mocked

- **Location:** `test/unit/`
- **Count:** 211 tests across 22 files
- **Network:** none (nock intercepts every HTTP call; `test/setup.ts`
  disables outbound connections so an accidental live call fails loudly)
- **Runtime:** ~1.3 seconds
- **When it runs:** on every commit via the pre-commit hook and every
  push via CI

```bash
npm test
```

### 2. Integration tests — read-only, real API

- **Location:** `test/integration/read-only.test.ts`
- **Count:** 25 assertions across all 16 toolsets against stable public
  targets (`octocat/Hello-World`, `octokit/octokit.js`)
- **Network:** hits `api.github.com` — spawns the built `dist/cli.js` over
  stdio, exactly as a real MCP client would
- **Safety:** read-only — no state mutations anywhere
- **Skip behavior:** if `GITHUB_TOKEN` is missing, the whole suite is
  `describe.skip`'d so CI without a token stays green

```bash
GITHUB_TOKEN=ghp_... npm run test:integration
```

### 3. Integration tests — read + write, real API, opt-in

- **Location:** `test/integration/write.test.ts` (plus everything in tier 2)
- **Count:** all 25 read-only assertions + 2 write round-trips
- **Round-trips (state-preserving):**
  1. `create_gist → get_gist → update_gist → delete_gist` on a scratch
     gist — asserts the deleted gist 404s after cleanup
  2. `star_repo` / `unstar_repo` on a public repo, restoring the prior
     starred state whichever way it started
- **Opt-in gate:** requires `INTEGRATION_WRITE=1` — the write suite is
  `describe.skip`'d otherwise, so it never mutates state by accident

```bash
INTEGRATION_WRITE=1 GITHUB_TOKEN=ghp_... npm run test:integration:write
```

Both integration scripts run `npm run build` first so the tests exercise
the built `dist/cli.js` over stdio, matching real client usage exactly.

## 🔐 Build your own bundle (zero trust)

Prefer not to trust binaries we publish? Every release artifact is fully reproducible from source. You audit the code, run the same gates our CI runs, and produce your own `.mcpb` and `.zip` — no need to trust the SHA-256 on our [GitHub Releases](https://github.com/wuqunfei/github-mcp-server-js/releases) page or the npm registry.

### Prerequisites

- **Node.js 24+** — verify with `node --version`
- **npm** — bundled with Node 24 (currently npm 11.x); no separate install
- **git**

### Full audit + build pipeline

```bash
# 1. Clone the repo at the exact release tag you want to reproduce.
git clone https://github.com/wuqunfei/github-mcp-server-js
cd github-mcp-server-js
git checkout v0.1.1

# 2. Audit the code. Nothing is executed yet.
git log --stat v0.1.0..v0.1.1        # review commits between releases
# Or open the tree in your editor and read every changed file.

# 3. Install the exact dependency versions recorded in package-lock.json.
#    No transitive drift, no surprise upgrades.
npm ci

# 4. Run the same gate our release CI runs. Any failure means don't ship.
npm run typecheck
npm run lint
npm run spellcheck
npm audit --audit-level=high
npm test                              # 211 hermetic unit tests, nock-mocked

# 5. Build the self-contained CLI. Every runtime dependency is inlined
#    into a single ~1.85 MB file — nothing loaded from node_modules at runtime.
npm run build                         # → dist/cli.js

# 6. Pack the extension. The pack script:
#      - enforces manifest.json.version === package.json.version
#      - validates manifest.json against the .mcpb v0.1 schema
#      - re-runs the build for freshness
#      - packs and then unpacks the archive to assert exactly the three
#        expected entries (manifest.json, dist/cli.js, assets/icon.png)
npm run pack:mcpb
# → dist/github-mcp-server-js-<version>.mcpb
# → dist/github-mcp-server-js-<version>.zip   (byte-identical copy)
```

### Install your locally built bundle

Drag the resulting `.mcpb` (or the extracted `.zip`) into **Claude Desktop → Settings → Extensions** exactly as in [Path 2](#-path-2--claude-desktop-extension-via-drag-drop-mcpb) or [Path 3](#-path-3--claude-desktop-unpacked-extension-zip-developer-mode).

> **Note on byte reproducibility.** The SHA-256 of your local `.mcpb` may differ from our published artifact because zip entries encode file modification timestamps. The *contents* are identical when you build from the same commit with the same locked dependencies. To compare content, use `npx @anthropic-ai/mcpb unpack <file> <dir>` on both archives and diff the extracted trees.

## 🚢 Releases and provenance

Every published version is built by GitHub Actions from a tagged commit, [signed with npm's Trusted Publisher and Sigstore attestation](https://docs.npmjs.com/generating-provenance-statements), and shipped as three artifacts:

- 📦 **npm package** — `npm i github-mcp-server-js` (installs the bundled `dist/cli.js`).
- 🧩 **`.mcpb` Claude Desktop Extension** — drag-drop install (Path 2).
- 🗜️ **`.zip` alternate archive** — byte-identical to the `.mcpb`; used for the unpacked-extension flow (Path 3) and stock `unzip` inspection.

## 🙏 Credits

- **[octokit.js](https://github.com/octokit/octokit.js)** by GitHub — the REST/GraphQL client every tool wraps. Apache-2.0.
- **[MCP TypeScript SDK v2](https://github.com/modelcontextprotocol/typescript-sdk)** by Anthropic — the MCP server framework. MIT.
- **Prior art:** [`@modelcontextprotocol/server-github`](https://github.com/modelcontextprotocol/servers-archived/tree/main/src/github) (archived, original Anthropic reference server) and [`github/github-mcp-server`](https://github.com/github/github-mcp-server) (GitHub's official Go / Docker implementation). Both remain excellent choices where their constraints fit.

## 📄 License

MIT © 2026 Qunfei Wu. See [LICENSE](./LICENSE).
