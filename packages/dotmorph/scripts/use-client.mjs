// Bundlers drop module-level directives, so re-add 'use client' to the React
// entry after the build. Without it, importing `dotmorph/react` from a Next.js
// Server Component fails.
import { readFileSync, writeFileSync } from 'node:fs';

const file = new URL('../dist/react.js', import.meta.url);
const source = readFileSync(file, 'utf8');
if (!/^\s*['"]use client['"]/.test(source)) {
  writeFileSync(file, `'use client';\n${source}`);
  console.log('dotmorph: added "use client" to dist/react.js');
}
