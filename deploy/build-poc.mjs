#!/usr/bin/env node
/**
 * Stage a POC-only production build for resound.calebhugo.com.
 *
 * Takes the Vite build in `dist/` and produces `deploy/dist-poc/` — a public
 * artifact that ships ONLY the nine POC levels and the game itself:
 *
 *   - editor.html + its editor-only assets are dropped from a full build
 *     (deploy.sh builds the game alone, RESOUND_BUILD=game; the editor's
 *     write/git APIs are dev-server middleware that don't exist in production
 *     anyway).
 *   - public/puzzles is pruned to the `poc-*` files plus a manifest filtered to
 *     those entries, in their original order (so the game boots into
 *     `poc-threshold` — puzzles[0] — and Esc's menu lists only the POC set).
 *   - every text file gets a level-9 `.gz` beside it for nginx's gzip_static
 *     (deploy/nginx-resound.conf), and `.deploy-assets` lists the hashed
 *     assets for deploy/upload.sh's prune.
 *
 * The POC files only ever portal-link to each other, so the pruned set is
 * self-contained. Run after `vite build`; see deploy/deploy.sh.
 *
 * Usage: node deploy/build-poc.mjs [dist] [out]   (defaults: dist/, deploy/dist-poc/)
 */
import fs from 'fs';
import path from 'path';
import zlib from 'zlib';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const DIST = path.resolve(process.argv[2] || path.join(ROOT, 'dist'));
const OUT = path.resolve(process.argv[3] || path.join(__dirname, 'dist-poc'));

// What gzip helps (nginx-resound.conf compresses the same types)
const COMPRESSIBLE = /\.(html|js|css|json|svg|wasm)$/;

if (!fs.existsSync(DIST)) {
  console.error(`No build found at ${DIST}. Run \`npm run build\` first.`);
  process.exit(1);
}

// Fresh staging dir every run.
fs.rmSync(OUT, { recursive: true, force: true });
fs.cpSync(DIST, OUT, { recursive: true });

// 1. Drop the editor entry point and its editor-only assets. The shared
//    chunks (three, the resound packages, SongMatcher) are the game's too,
//    so leave them alone.
fs.rmSync(path.join(OUT, 'editor.html'), { force: true });
const assetsDir = path.join(OUT, 'assets');
if (fs.existsSync(assetsDir)) {
  for (const f of fs.readdirSync(assetsDir)) {
    if (/^editor-.*\.(js|css)$/.test(f)) fs.rmSync(path.join(assetsDir, f));
  }
}

// 2. Prune puzzles to the POC set + a manifest filtered to it (order preserved).
const puzzlesDir = path.join(OUT, 'puzzles');
const manifest = JSON.parse(fs.readFileSync(path.join(puzzlesDir, 'manifest.json'), 'utf8'));
const pocEntries = manifest.puzzles.filter((p) => p.id.startsWith('poc-'));
if (pocEntries.length === 0) {
  console.error('No poc-* entries found in manifest — refusing to ship an empty game.');
  process.exit(1);
}
const keep = new Set(['manifest.json', ...pocEntries.map((p) => `${p.id}.json`)]);
for (const f of fs.readdirSync(puzzlesDir)) {
  if (!keep.has(f)) fs.rmSync(path.join(puzzlesDir, f));
}
fs.writeFileSync(
  path.join(puzzlesDir, 'manifest.json'),
  `${JSON.stringify({ puzzles: pocEntries }, null, 2)}\n`
);

// 3. Precompress once at level 9, so nginx never compresses at the origin
//    (gzip_static serves the .gz to clients that accept gzip). A file gzip
//    wouldn't shrink keeps no .gz.
for (const f of fs.readdirSync(OUT, { recursive: true })) {
  const file = path.join(OUT, f);
  if (COMPRESSIBLE.test(f)) {
    const bytes = fs.readFileSync(file);
    const gz = zlib.gzipSync(bytes, { level: 9 });
    if (gz.length < bytes.length) fs.writeFileSync(`${file}.gz`, gz);
  }
}

// 4. List the hashed assets (precompressed copies included). upload.sh
//    records the list on the server, and the NEXT deploy keeps every file in
//    it: a page loaded just before that deploy still finds its chunks.
fs.writeFileSync(
  path.join(OUT, '.deploy-assets'),
  `${fs.readdirSync(assetsDir).sort().join('\n')}\n`
);

console.log(`Staged POC build at ${OUT}`);
console.log(`  levels: ${pocEntries.map((p) => p.id).join(', ')}`);
