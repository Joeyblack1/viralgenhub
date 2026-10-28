import { resolve } from 'path';
import { defineConfig } from 'vite';

// EXT_ENV=staging builds the staging variant (also trusts staging.viralgenhub.com).
const ALLOWED_ORIGINS =
  process.env.EXT_ENV === 'staging'
    ? ['https://app.viralgenhub.com', 'https://staging.viralgenhub.com']
    : ['https://app.viralgenhub.com'];

// EXT_BROWSER=firefox builds the AMO variant: same background code plus the
// bridge content script (Firefox has no page-to-extension messaging).
// EXT_BROWSER=safari builds the Safari variant (wrapped by the Xcode project in
// apps/extension-safari): same code, Safari wording for the site-access hint.
// Default 'chromium' = Chrome Web Store and Edge Add-ons (one package).
const BROWSER =
  process.env.EXT_BROWSER === 'firefox' || process.env.EXT_BROWSER === 'safari'
    ? process.env.EXT_BROWSER
    : 'chromium';

const entry: Record<string, string> = {
  background: resolve(__dirname, 'src/background.ts'),
};
if (BROWSER === 'firefox') {
  entry.bridge = resolve(__dirname, 'src/bridge.ts');
}

export default defineConfig({
  define: {
    __ALLOWED_ORIGINS__: JSON.stringify(ALLOWED_ORIGINS),
    __BROWSER__: JSON.stringify(BROWSER),
  },
  build: {
    outDir: resolve(__dirname, 'dist'),
    emptyOutDir: true,
    lib: {
      entry,
      formats: ['es'],
      fileName: (_format, name) => `${name}.js`,
    },
    rollupOptions: {
      output: {
        entryFileNames: '[name].js',
      },
    },
    target: 'esnext',
    minify: false,
    sourcemap: process.env.NODE_ENV === 'development',
  },
  publicDir: resolve(__dirname, 'public'),
});
