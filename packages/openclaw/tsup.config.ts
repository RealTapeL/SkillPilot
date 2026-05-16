import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  dts: true,
  // Skip type errors - types are already correctly in core package
  outDir: 'dist',
  clean: true
});
