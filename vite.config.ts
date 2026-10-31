import { defineConfig } from 'vitest/config';

// Relative base so the build runs from any IPFS gateway subpath or ENS name.
export default defineConfig({
  base: './',
  build: { target: 'es2022', assetsInlineLimit: 0 },
  test: { include: ['src/**/*.test.ts'] },
});
