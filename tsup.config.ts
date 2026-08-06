import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/cli.ts'],
  format: ['esm'],
  target: 'node24',
  bundle: true,
  clean: true,
  // Inline every dependency so dist/cli.js is truly self-contained. Required
  // for the .mcpb Claude Desktop Extension bundle, which ships only cli.js
  // (no node_modules). By default tsup marks entries in package.json
  // `dependencies` as external, which produced runtime `Cannot find package`
  // errors when the extension was extracted to a temp dir.
  noExternal: [/.*/],
  // Force a single-file output. Without this, dynamic imports (see cli.ts's
  // lazy `runHttp` import) become separate chunks — the .mcpb bundle only
  // ships dist/cli.js, so any extra chunks would break the extension.
  splitting: false,
  // CJS deps like @whatwg-node/node-fetch call `require('buffer')` at
  // module top-level. `shims: true` injects `createRequire(import.meta.url)`
  // + `__dirname`/`__filename` so those calls resolve inside the ESM output.
  shims: true,
  platform: 'node',
  banner: {
    js: '#!/usr/bin/env node',
  },
});
