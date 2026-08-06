# github-mcp-server-js — Claude Desktop Extension (.mcpb) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development or superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Package the existing stdio MCP server as a `.mcpb` bundle so Claude Desktop users can install it by dragging the file into Settings > Extensions.

**Architecture:** Static `manifest.json` + tsup's existing single-file `dist/cli.js` + a small PNG icon, zipped by the `@anthropic-ai/mcpb` CLI's `pack` command. A tiny Node script (`scripts/pack-mcpb.mjs`) enforces `package.json` / `manifest.json` version parity, validates the manifest, runs the build, invokes `mcpb pack`, and asserts the resulting archive contains exactly the three expected entries. Phase 1 ships the local pack workflow and is verified by a one-time manual install in Claude Desktop; Phase 2 wires the same script into a tag-triggered GitHub Actions release workflow.

**Tech Stack:** `@anthropic-ai/mcpb@^2.1.2` (dev dep, provides `mcpb pack`/`validate`/`info`/`unpack`), Node ≥20, vitest for the version-parity unit test, `softprops/action-gh-release@v2` for asset upload.

## Global Constraints

- All existing verification gates keep passing: `npm test` (207/207 unit), `npm run typecheck`, `npm run lint`, `npm run spellcheck`, `npm run build`.
- The `.mcpb` bundle must contain EXACTLY three entries: `manifest.json`, `dist/cli.js`, `assets/icon.png`. Anything else is a bug; the pack script asserts this.
- `manifest.json.version` MUST equal `package.json.version` at pack time; drift is a hard error.
- `manifest.json` uses `mcpb_version: "0.1"`, `server.type: "node"`, `server.entry_point: "dist/cli.js"`, and the exact `mcp_config` + `user_config` blocks shown in the spec (`docs/superpowers/specs/2026-08-06-github-mcp-server-mcpb-extension-design.md` lines 44-99).
- `GITHUB_TOKEN` is the only `sensitive: true` user_config field (stored in OS keychain).
- The extension is stdio only. Do NOT wire `--transport=http` or any HTTP flag into `mcp_config.args`.
- Phase 2 depends on Phase 1 verification passing (manual Claude Desktop install works end-to-end). Do NOT start Phase 2 until Task 3 is signed off.
- CI Node version is `'24'` — use the same in `release.yml`.
- TypeScript is the language for tests. The pack script is `.mjs` (plain ESM Node) to avoid a build step for a script that runs at pack time.

---

## File Structure

```
manifest.json                              (new, Task 1)
assets/
  icon.png                                 (new, Task 1 — 128×128, CC0)
.mcpbignore                                (new, Task 1)
scripts/
  pack-mcpb.mjs                            (new, Task 2)
test/unit/scripts/
  pack-mcpb.test.ts                        (new, Task 2)
package.json                               (modified, Task 2 — add dev dep + script)
README.md                                  (modified, Task 3 — install instructions)
.github/workflows/release.yml              (new, Task 4)
```

---

# Phase 1 — Local pack + real-install verification

## Task 1: Static bundle contents (manifest.json, .mcpbignore, icon)

**Files:**
- Create: `manifest.json`
- Create: `.mcpbignore`
- Create: `assets/icon.png` (128×128)

**Interfaces:**
- Produces: A repo state where `mcpb pack .` (run manually) would emit a valid bundle with exactly the three bundle entries. No JavaScript interfaces.

- [ ] **Step 1: Create `manifest.json` at repo root** with the exact content below (matches spec lines 44-99; `version` MUST equal the current `package.json.version`, which is `0.1.0`).

```json
{
  "mcpb_version": "0.1",
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
      "default": "info"
    }
  }
}
```

- [ ] **Step 2: Create `.mcpbignore`** with npm-ignore-style patterns so `mcpb pack` includes only the three bundle members. `mcpb pack` starts with everything under the packed directory and applies `.mcpbignore`, so we exclude every top-level dir/file that isn't a bundle member.

```
# Anything not in the three explicit bundle members below.
src/
test/
docs/
scripts/
node_modules/
coverage/
.github/
.claude/
.git/
.husky/
.superpowers/
tsconfig.json
tsup.config.ts
vitest.config.ts
vitest.integration.config.ts
eslint.config.js
cspell.json
.gitleaks.toml
.gitignore
.mcpbignore
package.json
package-lock.json
README.md
CHANGELOG.md
LICENSE*
*.md
```

- [ ] **Step 3: Create `assets/icon.png`** — a 128×128 PNG version of the Simple Icons GitHub mark (CC0 1.0; safer than the Octocat trademark).

  Two supported approaches, pick whichever tooling is available:

  ```bash
  # Option A — librsvg (macOS: brew install librsvg; Ubuntu: apt install librsvg2-bin):
  curl -sSL "https://cdn.simpleicons.org/github/181717" -o /tmp/github.svg
  mkdir -p assets
  rsvg-convert -w 128 -h 128 -b white /tmp/github.svg -o assets/icon.png

  # Option B — sharp via npx (works anywhere Node is installed):
  curl -sSL "https://cdn.simpleicons.org/github/181717" -o /tmp/github.svg
  mkdir -p assets
  npx --yes sharp-cli -i /tmp/github.svg -o assets/icon.png resize 128 128 --background '#ffffff' --flatten
  ```

  Confirm dimensions:

  ```bash
  file assets/icon.png    # expect: "PNG image data, 128 x 128"
  ```

- [ ] **Step 4: Commit**

```bash
git add manifest.json .mcpbignore assets/icon.png
git commit -m "feat(mcpb): add manifest.json, icon, and .mcpbignore"
```

---

## Task 2: Pack script (`scripts/pack-mcpb.mjs`) + version-parity test

**Files:**
- Create: `scripts/pack-mcpb.mjs`
- Create: `test/unit/scripts/pack-mcpb.test.ts`
- Modify: `package.json` (add dev dep `@anthropic-ai/mcpb` and script `pack:mcpb`)

**Interfaces:**
- Consumes: `manifest.json`, `.mcpbignore`, `assets/icon.png` (from Task 1). `package.json.version` and `manifest.json.version`. `dist/cli.js` (produced by `npm run build`).
- Produces:
  - `checkVersionParity(pkg: { version: string }, manifest: { version: string }): void` — throws `Error` with a specific message when versions differ; returns `undefined` when they match. Exported from `scripts/pack-mcpb.mjs` for the unit test.
  - `pack:mcpb` npm script — after `npm ci && npm run pack:mcpb`, the file `dist/github-mcp-server-js-<version>.mcpb` exists and its `mcpb info` output shows exactly three entries.
- Consumers of the produced npm script: Task 3 (manual verification), Task 4 (release workflow).

- [ ] **Step 1: Add `@anthropic-ai/mcpb` as a dev dependency**

```bash
npm install --save-dev @anthropic-ai/mcpb@^2.1.2
```

Confirm `package.json` `devDependencies` now includes `"@anthropic-ai/mcpb": "^2.1.2"`.

- [ ] **Step 2: Write the failing test** at `test/unit/scripts/pack-mcpb.test.ts`

```ts
import { describe, expect, it } from 'vitest';
import { checkVersionParity } from '../../../scripts/pack-mcpb.mjs';

describe('checkVersionParity', () => {
  it('returns undefined when versions match', () => {
    expect(
      checkVersionParity({ version: '0.1.0' }, { version: '0.1.0' }),
    ).toBeUndefined();
  });

  it('throws with a message naming both versions when they differ', () => {
    expect(() =>
      checkVersionParity({ version: '0.1.0' }, { version: '0.2.0' }),
    ).toThrow(/package\.json.*0\.1\.0.*manifest\.json.*0\.2\.0/);
  });

  it('throws when manifest.json.version is missing', () => {
    expect(() =>
      checkVersionParity({ version: '0.1.0' }, {}),
    ).toThrow(/manifest\.json.*version/);
  });

  it('throws when package.json.version is missing', () => {
    expect(() =>
      checkVersionParity({}, { version: '0.1.0' }),
    ).toThrow(/package\.json.*version/);
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

```bash
npm test -- test/unit/scripts/pack-mcpb.test.ts
```

Expected: FAIL — module `../../../scripts/pack-mcpb.mjs` cannot be resolved.

- [ ] **Step 4: Create `scripts/pack-mcpb.mjs`** with the full content below.

```javascript
#!/usr/bin/env node
// Pack the repo into a Claude Desktop Extension (.mcpb) bundle.
//
// Enforces:
//   1. manifest.json.version === package.json.version (fail fast on drift)
//   2. manifest.json validates against the mcpb schema
//   3. dist/cli.js exists (rebuilds if needed)
//   4. The produced archive contains exactly manifest.json, dist/cli.js,
//      assets/icon.png (no stray files leaked through .mcpbignore)
import { spawnSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..');

const EXPECTED_ENTRIES = ['manifest.json', 'dist/cli.js', 'assets/icon.png'];

export function checkVersionParity(pkg, manifest) {
  if (!pkg || typeof pkg.version !== 'string') {
    throw new Error('package.json is missing a version field');
  }
  if (!manifest || typeof manifest.version !== 'string') {
    throw new Error('manifest.json is missing a version field');
  }
  if (pkg.version !== manifest.version) {
    throw new Error(
      `Version drift: package.json is ${pkg.version} but manifest.json is ${manifest.version}. Bump both together.`,
    );
  }
}

function run(cmd, args, opts = {}) {
  const result = spawnSync(cmd, args, {
    cwd: REPO_ROOT,
    stdio: 'inherit',
    ...opts,
  });
  if (result.status !== 0) {
    throw new Error(`\`${cmd} ${args.join(' ')}\` exited ${result.status}`);
  }
}

function walkFiles(dir, prefix = '') {
  const entries = [];
  for (const name of readdirSync(dir)) {
    const full = resolve(dir, name);
    const rel = prefix ? `${prefix}/${name}` : name;
    const stat = statSync(full);
    if (stat.isDirectory()) {
      entries.push(...walkFiles(full, rel));
    } else {
      entries.push(rel);
    }
  }
  return entries;
}

function assertArchiveEntries(mcpbPath) {
  // Unpack the archive to a temp dir and list actual files — format-independent,
  // no fragile stdout parsing. `mcpb unpack` unzips the .mcpb into <output>.
  const tmp = mkdtempSync(resolve(tmpdir(), 'mcpb-verify-'));
  try {
    run('npx', ['--yes', '@anthropic-ai/mcpb', 'unpack', mcpbPath, tmp]);
    const actual = walkFiles(tmp).sort();
    const expected = [...EXPECTED_ENTRIES].sort();
    const missing = expected.filter((e) => !actual.includes(e));
    const extras = actual.filter((e) => !expected.includes(e));
    if (missing.length > 0 || extras.length > 0) {
      throw new Error(
        `Bundle contents do not match expected set.\n  expected: ${expected.join(', ')}\n  actual:   ${actual.join(', ')}\n  missing:  ${missing.join(', ') || '(none)'}\n  extras:   ${extras.join(', ') || '(none)'}\nTighten .mcpbignore if there are extras.`,
      );
    }
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}

async function main() {
  const pkg = JSON.parse(readFileSync(resolve(REPO_ROOT, 'package.json'), 'utf8'));
  const manifest = JSON.parse(
    readFileSync(resolve(REPO_ROOT, 'manifest.json'), 'utf8'),
  );

  checkVersionParity(pkg, manifest);

  console.log(`▶ validating manifest.json`);
  run('npx', ['--yes', '@anthropic-ai/mcpb', 'validate', 'manifest.json']);

  console.log(`▶ building dist/cli.js`);
  run('npm', ['run', 'build']);

  if (!existsSync(resolve(REPO_ROOT, 'dist/cli.js'))) {
    throw new Error('dist/cli.js not produced by `npm run build`');
  }

  mkdirSync(resolve(REPO_ROOT, 'dist'), { recursive: true });
  const outPath = resolve(REPO_ROOT, `dist/github-mcp-server-js-${pkg.version}.mcpb`);

  console.log(`▶ packing → ${outPath}`);
  run('npx', ['--yes', '@anthropic-ai/mcpb', 'pack', '.', outPath]);

  console.log(`▶ verifying archive contents`);
  assertArchiveEntries(outPath);

  console.log(`✓ ${outPath}`);
}

// Only run main() when invoked as a script, not when imported for tests.
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    console.error(`✗ ${err.message}`);
    process.exit(1);
  });
}
```

- [ ] **Step 5: Add the `pack:mcpb` script to `package.json`** in the `scripts` block, between `test:integration:write` and `prepare`:

```json
    "pack:mcpb": "node scripts/pack-mcpb.mjs",
```

- [ ] **Step 6: Run the unit test — should now pass**

```bash
npm test -- test/unit/scripts/pack-mcpb.test.ts
```

Expected: 4 tests PASS.

- [ ] **Step 7: Run the full unit suite** to confirm no regression.

```bash
npm test
```

Expected: 211 tests pass (was 207; +4 for `pack-mcpb.test.ts`).

- [ ] **Step 8: Typecheck + lint + spellcheck**

```bash
npm run typecheck && npm run lint && npm run spellcheck
```

Expected: all clean. If cspell flags any new words (`mcpb`, `mcpbignore`, `simpleicons`), add them to `cspell.json`.

- [ ] **Step 9: Run the pack script end-to-end** — verifies the whole pipeline locally.

```bash
npm run pack:mcpb
ls -lh dist/github-mcp-server-js-*.mcpb
npx @anthropic-ai/mcpb info dist/github-mcp-server-js-0.1.0.mcpb
```

Expected: `dist/github-mcp-server-js-0.1.0.mcpb` exists (roughly 30-40 KB after compression) and `mcpb info` lists the three entries.

- [ ] **Step 10: Add `dist/*.mcpb` to `.gitignore`** so the built bundle isn't tracked.

```bash
grep -q '^dist/\*\.mcpb$' .gitignore || echo 'dist/*.mcpb' >> .gitignore
```

- [ ] **Step 11: Commit**

```bash
git add package.json package-lock.json scripts/pack-mcpb.mjs test/unit/scripts/pack-mcpb.test.ts .gitignore cspell.json
git commit -m "feat(mcpb): add pack-mcpb script with version-parity check + tests"
```

---

## Task 3: Manual Claude Desktop verification + README update

**Files:**
- Modify: `README.md` (add an "Install as Claude Desktop Extension" section)

**Interfaces:**
- Consumes: The `dist/github-mcp-server-js-0.1.0.mcpb` produced in Task 2.
- Produces: A README section documenting the drag-to-install flow, plus a verified assertion (recorded in the commit message) that the extension works end-to-end in a real Claude Desktop install.

- [ ] **Step 1: Manually verify in Claude Desktop**

  1. Ensure `dist/github-mcp-server-js-0.1.0.mcpb` exists (`npm run pack:mcpb` if not).
  2. Open Claude Desktop → Settings → Extensions.
  3. Drag `dist/github-mcp-server-js-0.1.0.mcpb` into the Extensions pane.
  4. Confirm the install dialog shows: name "GitHub MCP Server (JS)", four config fields (token masked, others with defaults visible), icon rendered.
  5. Enter a valid `GITHUB_TOKEN` (a PAT with `repo` + `read:user` scope is enough), leave the other three fields at their defaults, click Install.
  6. Open a new chat and prompt: "Use the get_authenticated_user tool and tell me the login". Confirm the response includes the token owner's real GitHub login.
  7. Uninstall the extension from Settings → Extensions.

  If any step fails, do NOT proceed — fix the underlying issue (likely `manifest.json`, `.mcpbignore`, or a missing dependency) and re-verify. This is the hard gate for Phase 2.

- [ ] **Step 2: Update `README.md`** — add a new top-level section after "Configuration" and before "Toolsets". The snippet below is fenced with four backticks so the inner triple-backtick blocks render correctly; when you paste it into `README.md`, use plain triple-backticks for the inner blocks.

````markdown
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
````

- [ ] **Step 3: Verify the README section by rendering it locally** (or just `less README.md` and eyeball the new section for typos).

- [ ] **Step 4: Spellcheck the README change**

```bash
npm run spellcheck
```

Add any flagged words to `cspell.json` (candidates: `mcpb`, `keychain`).

- [ ] **Step 5: Commit — record the manual-verify result in the message**

```bash
git add README.md cspell.json
git commit -m "docs(mcpb): document Claude Desktop Extension install (manual-verified)"
```

The commit message MUST include the phrase "manual-verified" so future me can search history and confirm Phase 1 was actually tested in a real Claude Desktop install (not just built and assumed to work).

---

# Phase 2 — CI/CD release automation

**Do NOT start until Phase 1 (Tasks 1-3) is complete AND the commit message from Task 3 Step 5 confirms manual verification succeeded.**

## Task 4: Release workflow (`.github/workflows/release.yml`)

**Files:**
- Create: `.github/workflows/release.yml`

**Interfaces:**
- Consumes: Everything from Phase 1 (`manifest.json`, `.mcpbignore`, `assets/icon.png`, `scripts/pack-mcpb.mjs`, `npm run pack:mcpb`).
- Produces: On every push of a tag matching `v*.*.*`, the workflow builds `dist/github-mcp-server-js-<version>.mcpb` and uploads it as an asset attached to the GitHub Release for that tag.

- [ ] **Step 1: Create `.github/workflows/release.yml`** with the exact content below.

```yaml
name: Release

on:
  push:
    tags:
      - 'v*.*.*'

jobs:
  gate:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0
      - uses: actions/setup-node@v4
        with:
          node-version: '24'
          cache: 'npm'
      - run: npm ci
      - run: npm run typecheck
      - run: npm run lint
      - run: npm run spellcheck
      - run: npm audit --audit-level=high
      - run: npm test
      - run: npm run build

  release:
    runs-on: ubuntu-latest
    needs: gate
    permissions:
      contents: write
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0
      - uses: actions/setup-node@v4
        with:
          node-version: '24'
          cache: 'npm'
      - run: npm ci
      - name: Pack .mcpb bundle
        run: npm run pack:mcpb
      - name: Upload .mcpb to the tag's GitHub Release
        uses: softprops/action-gh-release@v2
        with:
          files: dist/github-mcp-server-js-*.mcpb
          fail_on_unmatched_files: true
          generate_release_notes: true
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

Notes for the reviewer:
- `permissions.contents: write` on the release job is required for `action-gh-release` to create/attach to the Release.
- `fail_on_unmatched_files: true` guarantees the job fails loudly if `pack:mcpb` didn't produce the expected file.
- `generate_release_notes: true` uses GitHub's built-in commit-range notes; no separate CHANGELOG plumbing.
- No `NPM_TOKEN` — `npm publish` is deliberately out of scope for this plan.

- [ ] **Step 2: Lint the YAML** (if `actionlint` is installed; skip otherwise).

```bash
actionlint .github/workflows/release.yml 2>/dev/null || echo "actionlint not installed; skipping"
```

- [ ] **Step 3: Commit** (before tagging, so the tag points at a commit that has the workflow file).

```bash
git add .github/workflows/release.yml
git commit -m "ci(mcpb): add release workflow that attaches .mcpb to tag releases"
```

- [ ] **Step 4: Push the branch first**

```bash
git push origin main
```

- [ ] **Step 5: Verify by pushing a pre-release tag** — this is the acceptance test for Phase 2. Use an `-rc` tag so nobody mistakes it for a real release.

```bash
git tag v0.1.0-rc1
git push origin v0.1.0-rc1
```

- [ ] **Step 6: Watch the workflow** — open Actions in the GitHub UI or:

```bash
gh run watch
```

Expected: both jobs (`gate`, `release`) succeed. The Release page for tag `v0.1.0-rc1` shows `github-mcp-server-js-0.1.0.mcpb` as an attached asset.

- [ ] **Step 7: Verify the uploaded artifact end-to-end** — download it and confirm it installs into Claude Desktop identically to the local pack.

```bash
gh release download v0.1.0-rc1 -p 'github-mcp-server-js-*.mcpb' -D /tmp/mcpb-check
file /tmp/mcpb-check/*.mcpb
```

Drag `/tmp/mcpb-check/github-mcp-server-js-0.1.0.mcpb` into a fresh Claude Desktop Extensions pane and repeat the verification from Task 3 Step 1.

- [ ] **Step 8: Clean up the pre-release**

```bash
# Delete the RC release (keeps the tag ref; delete both if you prefer)
gh release delete v0.1.0-rc1 --yes
git push --delete origin v0.1.0-rc1
git tag -d v0.1.0-rc1
```

- [ ] **Step 9: Commit the checkboxes** (mark this task's boxes as done). No code change needed — this step is the sign-off that Phase 2 is verified live.

```bash
# Only if any docs were edited during verification; otherwise skip.
```

---

## Post-plan: version-bump workflow (documentation only)

Once both phases are in, the release flow is:

1. Bump `version` in **both** `package.json` and `manifest.json` (the pack script's parity check catches drift).
2. Commit both together:
   `git commit -am "chore: release v0.2.0"`
3. Tag and push:
   `git tag v0.2.0 && git push origin main --tags`
4. The release workflow builds and attaches `github-mcp-server-js-0.2.0.mcpb` to the auto-generated GitHub Release.

Not automated in this plan — automating the bump belongs in a separate release-tooling plan.

---

## Self-Review Notes

Coverage check against the spec (`2026-08-06-github-mcp-server-mcpb-extension-design.md`):

| Spec item | Covered by |
|---|---|
| `manifest.json` shape (lines 44-99) | Task 1 Step 1 (verbatim JSON block) |
| Bundle contains exactly three entries | Task 1 Step 2 (.mcpbignore), Task 2 Step 4 (`assertArchiveEntries`) |
| Icon: CC0 Simple Icons GitHub mark, 128×128 | Task 1 Step 3 (two supported toolchains) |
| Dev dep `@anthropic-ai/mcpb` | Task 2 Step 1 |
| `pack-mcpb.mjs` version-parity check | Task 2 Step 4 (`checkVersionParity`), Task 2 Step 2 (unit tests) |
| `pack-mcpb.mjs` validates manifest | Task 2 Step 4 (`mcpb validate`) |
| `pack-mcpb.mjs` runs `npm run build` | Task 2 Step 4 |
| `pack-mcpb.mjs` invokes `mcpb pack` | Task 2 Step 4 |
| Archive-content safety net | Task 2 Step 4 (`assertArchiveEntries`) |
| `pack:mcpb` npm script | Task 2 Step 5 |
| Manual Claude Desktop verification | Task 3 Step 1 |
| README install instructions | Task 3 Step 2 |
| `.github/workflows/release.yml` on `v*.*.*` tags | Task 4 Step 1 |
| Gate job runs full CI suite | Task 4 Step 1 (`gate` job) |
| Release job packs + uploads asset | Task 4 Step 1 (`release` job with `action-gh-release`) |
| Node 24 in release workflow | Task 4 Step 1 (`node-version: '24'`) |
| Tag-push acceptance test | Task 4 Step 5-7 |
| Non-goal: `npm publish` | Explicitly excluded, called out in Task 4 Step 1 notes |
| Non-goal: signing | No `mcpb sign` step |
| Non-goal: HTTP transport in the bundle | `mcp_config.args` in manifest has no `--transport=http` |

No open questions. No placeholders. All type/interface references are consistent (`checkVersionParity(pkg, manifest)` matches between definition, export, test import, and consumer).
