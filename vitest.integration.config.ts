import { configDefaults, defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/integration/**/*.test.ts'],
    setupFiles: ['./test/integration/setup.ts'],
    exclude: [...configDefaults.exclude, '**/.claude/**'],
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
});
