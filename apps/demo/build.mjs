// Builds the demo into one self-contained HTML file: dist/index.html (open it directly)
// and dist/chhetry-demo.html (the same page as a fragment, for hosting as a published page).
import { build } from 'esbuild';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const here = (p) => fileURLToPath(new URL(p, import.meta.url));
const SHIMS = {
  'node:crypto': here('./src/shims/node-crypto.js'),
  'node:fs': here('./src/shims/node-fs.js'),
  'node:url': here('./src/shims/node-url.js'),
  '@anthropic-ai/sdk': here('./src/shims/anthropic-sdk.js'),
};

const shimPlugin = {
  name: 'browser-shims',
  setup(b) {
    b.onResolve({ filter: /^(node:(crypto|fs|url)|@anthropic-ai\/sdk)$/ }, (a) => ({ path: SHIMS[a.path] }));
  },
};

const result = await build({
  entryPoints: [here('./src/main.ts')],
  bundle: true,
  write: false,
  format: 'iife',
  platform: 'browser',
  target: 'es2022',
  minify: true,
  legalComments: 'none',
  inject: [here('./src/shims/buffer-global.js')],
  define: { 'process.env': '{}', 'process.env.NODE_ENV': '"production"', 'import.meta.url': '"file:///demo/packages/agent/src/prompts.ts"' },
  loader: { '.md': 'text' },
  plugins: [shimPlugin],
  logLevel: 'warning',
});

const js = result.outputFiles[0].text.replace(/<\/script/gi, '<\\/script');
const css = await readFile(here('./src/styles.css'), 'utf8');
const body = await readFile(here('./src/body.html'), 'utf8');

const fragment = body.replace('/*CSS*/', () => css).replace('/*JS*/', () => js);
const full = `<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n</head>\n<body>\n${fragment}\n</body>\n</html>\n`;

await mkdir(here('./dist'), { recursive: true });
await writeFile(here('./dist/chhetry-demo.html'), fragment);
await writeFile(here('./dist/index.html'), full);
console.log(`demo built: ${(full.length / 1024).toFixed(0)} KB`);
