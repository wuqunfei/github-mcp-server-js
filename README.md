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

Currently implemented:

- `repos` — repository, branch, commit, tag, and file-contents tools
- `issues` — issue CRUD, comments, labels, and conversation locking
- `pull_requests` — pull request listing, creation, merging, reviews, and reviewer requests
- `search` — code, repo, commit, issue/PR, and user search
- `users` — user profile lookup, authenticated user info, followers, following, hovercard context
- `gists` — list, get, create, update, and delete gists
- `activity` — list notifications, list starred repos, check/star/unstar a repository
- `packages` — list and inspect GitHub Packages owned by the authenticated user (npm, maven, rubygems, docker, nuget, container)
- `misc` — utility tools: API rate limit status, GitHub server metadata, emoji list, Markdown-to-HTML rendering
- `apps` — GitHub App public info and user-accessible installations (`get_app`, `list_installations_for_authenticated_user`, `list_installation_repos_for_authenticated_user`)
- `copilot` — Copilot org-admin tools (org-owner PAT required): Copilot subscription details, seat list, per-user seat details (`get_copilot_organization_details`, `list_copilot_seats`, `get_copilot_seat_details_for_user`)

Additional toolsets (actions, and more) are tracked in
`docs/superpowers/specs/2026-08-05-github-mcp-server-design.md`.
