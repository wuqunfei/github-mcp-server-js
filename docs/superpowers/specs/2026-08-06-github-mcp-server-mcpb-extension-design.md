# github-mcp-server-js — Claude Desktop Extension (.mcpb) design

**Status:** proposed
**Supplements:** `2026-08-05-github-mcp-server-design.md` §"Claude Desktop
Extension (.mcpb) Packaging"

This spec turns the packaging section of the master design into a concrete
implementation plan, sequenced as (1) local pack + real-install verification
in Claude Desktop, (2) CI/CD release automation.

## Goal

Ship the existing stdio MCP server as a `.mcpb` bundle so Claude Desktop
users can install it by dragging the file into Settings > Extensions — no
terminal, no manual `claude_desktop_config.json` editing.

## Non-goals

- HTTP transport packaging — `.mcpb` bundles are spawned by Claude Desktop as
  a local child process; HTTP is out of scope.
- `npm publish` automation — requires `NPM_TOKEN` and is tracked as a
  separate future plan.
- Extension signing — the `.mcpb` spec (v0.1) does not yet mandate signing;
  unsigned bundles work in current Claude Desktop.
- Custom branded icon — we use the CC0-licensed Simple Icons GitHub mark to
  avoid Octocat trademark risk. A polished brand icon is a follow-up.

## Bundle contents

The `tsup` build already produces a self-contained single-file
`dist/cli.js` (~92 KB with all deps inlined), so the bundle is minimal:

```
github-mcp-server-js-<version>.mcpb   (zip archive)
├── manifest.json
├── dist/cli.js
└── assets/icon.png                   (128×128)
```

No `node_modules`, no `src/`, no `test/`.

## manifest.json

```json
{
  "manifest_version": "0.1",
  "name": "github-mcp-server-js",
  "display_name": "GitHub MCP Server (JS)",
  "version": "0.1.0",
  "description": "MCP server exposing 104 GitHub REST tools across 16 toolsets, built on octokit.js.",
  "author": { "name": "Qunfei Wu" },
  "homepage": "https://github.com/wuqunfei/github-mcp-server-js",
  "repository": {
    "type": "git",
    "url": "https://github.com/wuqunfei/github-mcp-server-js"
  },
  "icon": "assets/icon.png",
  "server": {
    "type": "node",
    "entry_point": "dist/cli.js",
    "mcp_config": {
      "command": "node",
      "args": ["${__dirname}/dist/cli.js"],
      "env": {
        "GITHUB_TOKEN": "${user_config.github_token}",
        "GITHUB_SERVER_URL": "${user_config.github_server_url}",
        "GITHUB_PERMISSION": "${user_config.github_permission}",
        "LOG_LEVEL": "${user_config.log_level}"
      }
    }
  },
  "user_config": {
    "github_token": {
      "type": "string",
      "title": "GitHub Personal Access Token",
      "description": "PAT used for all GitHub API calls. Stored securely in the OS keychain.",
      "required": true,
      "sensitive": true
    },
    "github_server_url": {
      "type": "string",
      "title": "GitHub Server URL",
      "description": "Bare hostname or full API base URL. Set this for GitHub Enterprise Server.",
      "default": "github.com"
    },
    "github_permission": {
      "type": "string",
      "title": "Permission (read-only or read-write)",
      "description": "read-only registers only read tools; read-write registers all 104 tools.",
      "default": "read-write"
    },
    "log_level": {
      "type": "string",
      "title": "Log Level (debug, info, or error)",
      "description": "Verbosity of server log output. One of: debug, info, error.",
      "default": "info"
    }
  }
}
```

**Note on enums:** the `.mcpb` v0.1 schema supports only `string`, `number`,
and `directory` field types — no native enum. `github_permission` and
`log_level` are therefore free-text strings with defaults; the valid values
are described in the field title/description. The server already validates
these env vars at startup, so invalid input fails loudly.

**Note on schema field names (verified against mcpb v2.1.2):** the manifest
uses `manifest_version` (not `mcpb_version`) as the schema version key. Every
`user_config` field requires `description`; omit at your peril — the
validator rejects missing `description` even when a `title` is present.

## Phase 1 — Local pack + real-install verification

**New/modified repo artifacts:**

- Add `manifest.json` at repo root (see above).
- Add `assets/icon.png` — 128×128 render of the Simple Icons GitHub mark
  (CC0 1.0). Chosen over Octocat to avoid GitHub trademark issues.
- Add dev dep `@anthropic-ai/mcpb`.
- Add `scripts/pack-mcpb.mjs`:
  - Reads `package.json.version` and `manifest.json.version`; if they
    differ, exits non-zero with a clear diff message.
  - Runs `mcpb validate manifest.json`.
  - Ensures a fresh `dist/cli.js` (calls `npm run build`).
  - Invokes `mcpb pack .
    dist/github-mcp-server-js-<package.json.version>.mcpb`.
- Configure `mcpb pack` so the resulting zip contains only `manifest.json`,
  `dist/cli.js`, and `assets/icon.png`. `mcpb pack` respects a `.mcpbignore`
  file (npm-ignore-style patterns); use that to exclude `src/`, `test/`,
  `node_modules/`, `docs/`, and every top-level file except the three
  bundle members. The pack script also asserts the produced archive
  contains exactly those three entries as a safety net.
- `package.json` script: `"pack:mcpb": "node scripts/pack-mcpb.mjs"`.

**Verification (manual, one-time):**

1. `npm run pack:mcpb` — produces
   `dist/github-mcp-server-js-0.1.0.mcpb`.
2. Drag the file into Claude Desktop > Settings > Extensions.
3. Fill in `GITHUB_TOKEN`, keep other defaults.
4. Open a chat and confirm one real tool call succeeds
   (e.g. `get_authenticated_user`).
5. Uninstall the extension.

Verification success = extension installs, all four config fields render
correctly (with the token masked), and the tool call returns the real
authenticated user object.

## Phase 2 — CI/CD release automation

Only started after Phase 1 verification passes.

**New workflow:** `.github/workflows/release.yml`

Trigger: `push` on tags matching `v*.*.*`.

Jobs:
1. **gate** — runs the same steps as CI (`typecheck`, `lint`, `spellcheck`,
   `npm audit --audit-level=high`, `test`, `build`). Depends on nothing.
2. **release** — depends on `gate`:
   - `actions/checkout@v4` with `fetch-depth: 0`
   - `actions/setup-node@v4` with `node-version: '24'`, `cache: 'npm'`
   - `npm ci`
   - `npm run pack:mcpb`
   - `softprops/action-gh-release@v2` uploads
     `dist/github-mcp-server-js-*.mcpb` as an asset on the tag's release,
     using `${{ secrets.GITHUB_TOKEN }}` (provided automatically by
     Actions, no manual secret needed).

**Version-bump flow (documented, not automated in this plan):**
1. Bump `version` in both `package.json` and `manifest.json` (script
   catches drift).
2. Commit + tag: `git tag v0.1.1 && git push origin main --tags`.
3. Workflow runs, `.mcpb` shows up under the tag's GitHub Release.

## Testing

**Unit tests:** the pack script itself is small enough to test with a
targeted vitest suite:

- `test/unit/scripts/pack-mcpb.test.ts`:
  - Version-drift check flags mismatched versions
  - Version-match check passes when versions align
  - (End-to-end pack invocation isn't unit-tested — that's what Phase 1
    manual verification covers.)

**Integration verification:** covered by the manual Phase 1 test above.
Once the CD is wired (Phase 2), pushing an `-rc` tag (e.g. `v0.1.0-rc1`)
and confirming the release asset appears constitutes the Phase 2 test.

## File map

```
github-mcp-server-js/
  manifest.json                       (new — Phase 1)
  assets/
    icon.png                          (new — Phase 1, 128×128, Simple Icons GH mark)
  scripts/
    pack-mcpb.mjs                     (new — Phase 1)
  test/unit/scripts/
    pack-mcpb.test.ts                 (new — Phase 1)
  .github/workflows/
    release.yml                       (new — Phase 2)
  package.json                        (modified — Phase 1: add pack:mcpb script + dev dep)
  README.md                           (modified — Phase 1: install instructions)
  .mcpbignore                         (new — Phase 1)
```

## Open questions

None — all decisions are made:
- Bundle single-file (tsup output), no `node_modules`
- Simple Icons GH mark for icon (CC0)
- Version drift caught by pack script, not by manifest linting
- Phase 1 first, Phase 2 only after manual verification
- No signing (spec v0.1 doesn't require it)
- No `npm publish` in this plan (separate future work)
