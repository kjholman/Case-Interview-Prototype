/// <reference types="vitest" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { viteSingleFile } from 'vite-plugin-singlefile';

// `npm run build` emits one self-contained dist/index.html (JS + CSS inlined)
// that opens straight from disk with no server and no network.
export default defineConfig({
  plugins: [react(), viteSingleFile()],
  base: './',
  build: { assetsInlineLimit: 100_000_000, cssCodeSplit: false },
  test: { environment: 'node', include: ['tests/**/*.test.ts'] },
});
