import { configDefaults, defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    setupFiles: ['./test/setup.ts'],
    exclude: [...configDefaults.exclude, '**/.claude/**', 'test/integration/**'],
  },
});
