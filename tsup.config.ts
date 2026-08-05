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
