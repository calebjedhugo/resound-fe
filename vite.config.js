import { defineConfig } from 'vite';
import jsconfigPaths from 'vite-jsconfig-paths';
import fs from 'fs';
import path from 'path';

const PUZZLES_DIR = path.resolve(__dirname, 'public/puzzles');
const MANIFEST_PATH = path.join(PUZZLES_DIR, 'manifest.json');
const ID_PATTERN = /^[a-zA-Z0-9_-]+$/;

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (chunk) => {
      data += chunk;
    });
    req.on('end', () => resolve(data));
    req.on('error', reject);
  });
}

/**
 * Upsert a puzzle's summary into manifest.json, preserving order.
 * Updates an existing entry by id, or appends a new one.
 */
function upsertManifest(puzzle) {
  let manifest = { puzzles: [] };
  try {
    manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'));
  } catch {
    // No manifest yet; start fresh.
  }
  const entry = { id: puzzle.id, name: puzzle.name, difficulty: puzzle.difficulty };
  const idx = manifest.puzzles.findIndex((p) => p.id === puzzle.id);
  if (idx >= 0) {
    manifest.puzzles[idx] = entry;
  } else {
    manifest.puzzles.push(entry);
  }
  fs.writeFileSync(MANIFEST_PATH, `${JSON.stringify(manifest, null, 2)}\n`);
}

/**
 * Dev-only endpoint that writes edited puzzle JSON straight into
 * public/puzzles/<id>.json (and keeps manifest.json in sync) so the
 * editor round-trips into the repo's real files during development.
 */
function puzzleWriterPlugin() {
  return {
    name: 'resound-puzzle-writer',
    configureServer(server) {
      server.middlewares.use('/api/puzzles', async (req, res, next) => {
        if (req.method !== 'POST') {
          next();
          return;
        }
        const id = req.url.replace(/^\//, '').split('?')[0];
        if (!ID_PATTERN.test(id)) {
          res.statusCode = 400;
          res.end(JSON.stringify({ error: 'Invalid puzzle id' }));
          return;
        }
        try {
          const puzzle = JSON.parse(await readBody(req));
          if (puzzle.id !== id) {
            res.statusCode = 400;
            res.end(JSON.stringify({ error: 'Body id does not match URL id' }));
            return;
          }
          fs.writeFileSync(
            path.join(PUZZLES_DIR, `${id}.json`),
            `${JSON.stringify(puzzle, null, 2)}\n`
          );
          upsertManifest(puzzle);
          res.statusCode = 200;
          res.end(JSON.stringify({ ok: true, id }));
        } catch (err) {
          res.statusCode = 500;
          res.end(JSON.stringify({ error: err.message }));
        }
      });
    },
  };
}

export default defineConfig({
  plugins: [jsconfigPaths(), puzzleWriterPlugin()],
  build: {
    rollupOptions: {
      input: {
        main: 'index.html',
        editor: 'editor.html',
      },
    },
  },
});
