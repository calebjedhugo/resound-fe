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
 *   - index.html preloads the JSON the boot fetches (manifest, the level it
 *     enters, that level's neighbors: a deep link's own, through a small
 *     script); every text file gets a level-9 `.gz` beside it for
 *     nginx's gzip_static (deploy/nginx-resound.conf); `.deploy-assets` lists
 *     the hashed assets for deploy/upload.sh's prune.
 *
 * The POC files only ever portal-link to each other, so the pruned set is
 * self-contained. Run after `vite build`; see deploy/deploy.sh.
 *
 * Usage: node deploy/build-poc.mjs [dist] [out]   (defaults: dist/, deploy/dist-poc/)
 */
import crypto from 'crypto';
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

// 3. Preload the JSON the game fetches as it boots: the manifest, then the
//    level it enters (the first, or a ?puzzle=<id> deep link's if the
//    manifest lists it), then that level's linked neighbors (PortalManager
//    loads them live at once). Three revalidations in a row once the scripts
//    have run; from the page, one round trip alongside the scripts.
//    crossorigin (anonymous) matches fetch()'s defaults, so the game's own
//    requests take the preloaded responses. The page links the manifest
//    (every boot fetches it); a script links the entered level's chain, read
//    from the query string (a preload the boot never fetches is a console
//    warning). It is a plain script, so its links are in before the game's
//    script runs, first in the head, so no stylesheet holds it back, and a
//    hashed asset: the CSP (nginx-resound.conf) runs same-origin scripts only.
const chainOf = (id) => {
  const { entities } = JSON.parse(fs.readFileSync(path.join(puzzlesDir, `${id}.json`), 'utf8'));
  const neighbors = entities
    .filter((e) => e.type === 'gate' && e.link && keep.has(`${e.link.puzzleId}.json`))
    .map((e) => e.link.puzzleId);
  return [...new Set([id, ...neighbors])];
};
const chains = Object.fromEntries(pocEntries.map(({ id }) => [id, chainOf(id)]));
const preloadScript = `// The puzzle JSON this page load's boot fetches after the manifest: the
// level it enters (a listed ?puzzle=<id> deep link's, else the first) and
// that level's linked neighbors. Written by deploy/build-poc.mjs
(() => {
  const chains = new Map(Object.entries(${JSON.stringify(chains)}));
  const requested = new URLSearchParams(window.location.search).get('puzzle');
  const entered = chains.has(requested) ? requested : ${JSON.stringify(pocEntries[0].id)};
  chains.get(entered).forEach((id) => {
    const link = document.createElement('link');
    link.rel = 'preload';
    link.href = \`/puzzles/\${id}.json\`;
    link.as = 'fetch';
    link.crossOrigin = 'anonymous';
    document.head.appendChild(link);
  });
})();
`;
const preloadHash = crypto.createHash('sha256').update(preloadScript).digest('hex').slice(0, 8);
const preloadAsset = `assets/preload-${preloadHash}.js`;
fs.writeFileSync(path.join(OUT, preloadAsset), preloadScript);
const indexPath = path.join(OUT, 'index.html');
fs.writeFileSync(
  indexPath,
  fs
    .readFileSync(indexPath, 'utf8')
    .replace(/^( *)<(script|link)\b/m, `$1<script src="/${preloadAsset}"></script>\n$&`)
    .replace(
      '  </head>',
      '    <link rel="preload" href="/puzzles/manifest.json" as="fetch" crossorigin>\n  </head>'
    )
);

// 4. Precompress once at level 9, so nginx never compresses at the origin
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

// 5. List the hashed assets (precompressed copies included). upload.sh
//    records the list on the server, and the NEXT deploy keeps every file in
//    it: a page loaded just before that deploy still finds its chunks.
fs.writeFileSync(
  path.join(OUT, '.deploy-assets'),
  `${fs.readdirSync(assetsDir).sort().join('\n')}\n`
);

console.log(`Staged POC build at ${OUT}`);
console.log(`  levels: ${pocEntries.map((p) => p.id).join(', ')}`);
