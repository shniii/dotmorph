import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));

const MAX_CAPTURE_BYTES = 8 * 1024 * 1024;

/**
 * Dev-only frame capture, used to render the README demo and compare frames.
 * Off unless you start the dev server with DOTMORPH_CAPTURE=1. Then POST a PNG
 * data URL from the page to /__capture?name=foo and it lands in
 * site/captures/foo.png. Cross-origin requests and oversized bodies are
 * rejected, so other websites can't write files while you run `npm run dev`.
 */
function capturePlugin(): Plugin {
  return {
    name: 'dotmorph-capture',
    apply: 'serve',
    configureServer(server) {
      if (process.env.DOTMORPH_CAPTURE !== '1') return;
      server.middlewares.use('/__capture', (req, res) => {
        const reject = (status: number) => {
          res.statusCode = status;
          res.end();
        };
        if (req.method !== 'POST') return reject(405);
        const site = req.headers['sec-fetch-site'];
        const origin = req.headers.origin;
        const host = req.headers.host;
        if ((site && site !== 'same-origin') || (origin && host && new URL(origin).host !== host)) return reject(403);
        let size = 0;
        const chunks: Buffer[] = [];
        req.on('data', (chunk: Buffer) => {
          size += chunk.length;
          if (size > MAX_CAPTURE_BYTES) {
            reject(413);
            req.destroy();
            return;
          }
          chunks.push(chunk);
        });
        req.on('end', () => {
          if (res.writableEnded) return;
          const url = new URL(req.url ?? '/', 'http://localhost');
          const name = (url.searchParams.get('name') ?? 'capture').replace(/[^\w.-]/g, '_').slice(0, 80);
          const dir = path.resolve(here, 'captures');
          fs.mkdirSync(dir, { recursive: true });
          const body = Buffer.concat(chunks).toString('utf8');
          fs.writeFileSync(path.join(dir, `${name}.png`), Buffer.from(body.replace(/^data:image\/png;base64,/, ''), 'base64'));
          res.setHeader('content-type', 'application/json');
          res.end(JSON.stringify({ saved: `${name}.png` }));
        });
      });
    },
  };
}

/**
 * DialKit's stylesheet starts with an @import of Geist Mono from Google Fonts.
 * The site's Content Security Policy only allows same-origin styles and fonts
 * (and visitors' IPs shouldn't go to a third party), so drop the import here;
 * the playground self-hosts Geist Mono via @fontsource instead.
 */
function stripRemoteFontImports(): Plugin {
  return {
    name: 'dotmorph-strip-remote-font-imports',
    enforce: 'pre',
    transform(code, id) {
      if (!/dialkit[\\/]dist[\\/].*\.css($|\?)/.test(id)) return null;
      const stripped = code.replace(/@import\s+(?:url\()?\s*['"]?https:\/\/fonts\.googleapis\.com[^;]*;/g, '');
      return stripped === code ? null : { code: stripped, map: null };
    },
  };
}

export default defineConfig({
  plugins: [stripRemoteFontImports(), react(), capturePlugin()],
  build: {
    // Never inline fonts as data: URLs; the CSP only allows same-origin font files.
    assetsInlineLimit: (file) => (/\.(woff2?|ttf|otf)$/i.test(file) ? false : undefined),
  },
  resolve: {
    // The site consumes the library from its sources so edits hot-reload; consumers get dist/.
    alias: [
      { find: /^dotmorph\/react$/, replacement: path.resolve(here, '../packages/dotmorph/src/react.tsx') },
      { find: /^dotmorph$/, replacement: path.resolve(here, '../packages/dotmorph/src/index.ts') },
    ],
  },
});
