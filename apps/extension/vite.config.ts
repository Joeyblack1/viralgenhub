import { resolve } from 'path';
import { defineConfig } from 'vite';

// EXT_ENV=staging builds the staging variant (also trusts staging.viralgenhub.com).
const ALLOWED_ORIGINS =
  process.env.EXT_ENV === 'staging'
    ? ['https://app.viralgenhub.com', 'https://staging.viralgenhub.com']
    : ['https://app.viralgenhub.com'];

export default defineConfig({
  define: { __ALLOWED_ORIGINS__: JSON.stringify(ALLOWED_ORIGINS) },
  build: {
    outDir: resolve(__dirname, 'dist'),
    emptyOutDir: true,
    lib: {
      entry: resolve(__dirname, 'src/background.ts'),
      formats: ['es'],
      fileName: () => 'background.js',
    },
    rollupOptions: {
      output: {
        entryFileNames: 'background.js',
      },
    },
    target: 'esnext',
    minify: false,
    sourcemap: process.env.NODE_ENV === 'development',
  },
  publicDir: resolve(__dirname, 'public'),
});
