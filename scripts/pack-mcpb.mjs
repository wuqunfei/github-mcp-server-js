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
  copyFileSync,
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

  // A .mcpb is a zip archive with a specialized extension. Emit a byte-identical
  // .zip copy so users who want to inspect/extract with a stock unzip toolchain
  // don't need to know the .mcpb convention. Same file, same shasum.
  const zipPath = outPath.replace(/\.mcpb$/, '.zip');
  copyFileSync(outPath, zipPath);

  console.log(`✓ ${outPath}`);
  console.log(`✓ ${zipPath}`);
}

// Only run main() when invoked as a script, not when imported for tests.
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    console.error(`✗ ${err.message}`);
    process.exit(1);
  });
}
