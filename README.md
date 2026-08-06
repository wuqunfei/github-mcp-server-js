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

## Install as a Claude Desktop Extension

Prefer a one-drag install over editing config files? The server also ships
as a `.mcpb` (Claude Desktop Extension) bundle.

1. Download `github-mcp-server-js-<version>.mcpb` from the latest
   [GitHub Release](https://github.com/wuqunfei/github-mcp-server-js/releases).
2. Open Claude Desktop → **Settings** → **Extensions**.
3. Drag the `.mcpb` file into the Extensions pane.
4. Fill in your `GITHUB_TOKEN` (stored in the macOS/Windows keychain — never
   in plaintext). The other three fields have sensible defaults.
5. Click **Install**. All 104 tools are now available in every new chat.

To build the bundle locally instead:

```bash
npm ci
npm run pack:mcpb
# → dist/github-mcp-server-js-<version>.mcpb
```

## Toolsets

All 16 toolsets from the design are shipped, exposing **104 tools** total. Write
tools are only registered when `GITHUB_PERMISSION=read-write` (the default);
setting `GITHUB_PERMISSION=read-only` registers only the read tools. Access
column below: **R** = registered in read-only, **W** = registered only in
read-write.

### `repos` — repositories, branches, commits, tags, file contents

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

### `issues` — issue CRUD, comments, labels, conversation locking

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

### `pull_requests` — PR listing, creation, merging, reviews

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

### `search` — repo, code, commit, issue/PR, user search

| Tool | Access | Description |
|---|---|---|
| `search_repos` | R | Search GitHub repositories. `q` accepts GitHub search qualifiers (e.g. `stars:>100 language:go`). |
| `search_code` | R | Search code across GitHub. `q` accepts code-search qualifiers (e.g. `repo:foo/bar in:file`). |
| `search_commits` | R | Search commits on default branches. `q` accepts commit-search qualifiers. |
| `search_issues` | R | Search issues and pull requests (scope with `is:issue` or `is:pull-request`). |
| `search_users` | R | Search GitHub users. |

### `users` — profiles, followers, following, hovercard

| Tool | Access | Description |
|---|---|---|
| `get_user_by_username` | R | Get public information about a user by login. |
| `get_authenticated_user` | R | Get the profile of the currently authenticated user (owner of `GITHUB_TOKEN`). |
| `list_user_followers` | R | List the users who follow a given user. |
| `list_user_following` | R | List the users that a given user follows. |
| `get_user_hovercard` | R | Get contextual "hovercard" information about a user, optionally scoped to a subject. |

### `gists` — list, get, create, update, delete gists

| Tool | Access | Description |
|---|---|---|
| `list_gists` | R | List gists for the authenticated user. |
| `get_gist` | R | Get a single gist by id (full file content included). |
| `create_gist` | W | Create a new gist (one or more files, public or secret). |
| `update_gist` | W | Update an existing gist: change description, add/rename/delete files. |
| `delete_gist` | W | Delete a gist (permanent — only the owner can delete). |

### `activity` — notifications, starred repos, star/unstar

| Tool | Access | Description |
|---|---|---|
| `list_notifications` | R | List notifications for the authenticated user (paginated, max 50/page). |
| `list_starred_repos` | R | List repositories starred by the authenticated user. |
| `check_repo_starred` | R | Check whether the authenticated user has starred a repository. Returns `{ starred: boolean }`. |
| `star_repo` | W | Star a repository on behalf of the authenticated user. |
| `unstar_repo` | W | Unstar a repository the authenticated user previously starred. |

### `packages` — GitHub Packages owned by the authenticated user

Requires the `read:packages` token scope. `package_type` is required and must be
one of `npm`, `maven`, `rubygems`, `docker`, `nuget`, `container`.

| Tool | Access | Description |
|---|---|---|
| `list_packages_for_authenticated_user` | R | List packages owned by the authenticated user for a given package type. |
| `get_package_for_authenticated_user` | R | Get a specific package owned by the authenticated user. |
| `list_package_versions_for_authenticated_user` | R | List all versions of a package owned by the authenticated user. |
| `get_package_version_for_authenticated_user` | R | Get a specific version of a package owned by the authenticated user. |

### `misc` — utility endpoints

| Tool | Access | Description |
|---|---|---|
| `get_rate_limit` | R | Get the current API rate-limit status for the authenticated user. |
| `get_meta` | R | Get GitHub API metadata: IP ranges, SSH keys, and service host info. |
| `list_emojis` | R | List all emoji names and their image URLs available on GitHub. |
| `render_markdown` | R | Render a Markdown string to HTML using GitHub's renderer (returns raw HTML). |

### `apps` — GitHub App public info and user installations

| Tool | Access | Description |
|---|---|---|
| `get_app` | R | Get public metadata for a GitHub App by URL slug. |
| `list_installations_for_authenticated_user` | R | List GitHub App installations accessible to the authenticated user. |
| `list_installation_repos_for_authenticated_user` | R | List repositories the authenticated user can access under a specific installation. |

### `copilot` — Copilot org-admin (org-owner PAT required)

| Tool | Access | Description |
|---|---|---|
| `get_copilot_organization_details` | R | Get Copilot seat breakdown and policy settings for an organization. |
| `list_copilot_seats` | R | List all Copilot seat assignments in an organization. |
| `get_copilot_seat_details_for_user` | R | Get Copilot seat details (last activity, editor) for a specific org member. |

### `orgs_teams` — organization inspection and team membership

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

### `codespaces` — user codespace lifecycle

| Tool | Access | Description |
|---|---|---|
| `list_codespaces` | R | List codespaces for the authenticated user. |
| `get_codespace` | R | Get a codespace by name for the authenticated user. |
| `create_codespace_in_repo` | W | Create a codespace in a repository for the authenticated user. |
| `start_codespace` | W | Start a stopped codespace. |
| `stop_codespace` | W | Stop a running codespace. |

### `projects` — GitHub ProjectsV2 (org-scoped, read-only)

| Tool | Access | Description |
|---|---|---|
| `list_org_projects` | R | List ProjectsV2 projects in an organization. |
| `get_org_project` | R | Get a ProjectsV2 project by its number. |
| `list_org_project_items` | R | List items in a ProjectsV2 project. |
| `list_org_project_fields` | R | List fields configured on a ProjectsV2 project. |
| `get_org_project_item` | R | Get a single item in a ProjectsV2 project. |

### `code_security` — code scanning, secrets, Dependabot, advisories

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

### `actions` — workflows, runs, jobs, artifacts, check runs

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

## Testing

Unit tests are hermetic (nock-mocked, no network) and run on every commit:

```bash
npm test
```

Integration tests spawn the built CLI and hit the real GitHub API. They
self-skip when `GITHUB_TOKEN` is missing, so CI without a token stays green.

```bash
# Read-only integration suite (safe — no state mutations).
GITHUB_TOKEN=ghp_... npm run test:integration

# Read-only + opt-in write round-trips (create+delete a scratch gist,
# star+unstar a target while restoring the prior state).
GITHUB_TOKEN=ghp_... npm run test:integration:write
```

The scripts run `npm run build` first so the tests exercise the built
`dist/cli.js` over stdio, matching real client usage.
