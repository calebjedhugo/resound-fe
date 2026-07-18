import { defineConfig } from 'vite';
import jsconfigPaths from 'vite-jsconfig-paths';
import fs from 'fs';
import path from 'path';
import { execFile } from 'child_process';
import prettier from 'prettier';

const PUZZLES_DIR = path.resolve(__dirname, 'public/puzzles');
const MANIFEST_PATH = path.join(PUZZLES_DIR, 'manifest.json');
const ID_PATTERN = /^[a-zA-Z0-9_-]+$/;

// git actions are scoped to the puzzle files. Commit/revert only touch this
// pathspec; push/pull are commit-level and inherently whole-repo.
const PUZZLES_PATHSPEC = 'public/puzzles';

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
 * Write an object to a JSON file formatted exactly as the repo's Prettier
 * config would, so editor-written files match `prettier --write` and pass
 * the lint-staged check on commit (no formatting churn).
 */
async function writeJsonFile(filePath, obj) {
  const config = await prettier.resolveConfig(filePath);
  const formatted = await prettier.format(JSON.stringify(obj), {
    ...config,
    filepath: filePath,
    parser: 'json',
  });
  fs.writeFileSync(filePath, formatted);
}

/**
 * Upsert a puzzle's summary into manifest.json, preserving order.
 * Updates an existing entry by id, or appends a new one.
 */
async function upsertManifest(puzzle) {
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
  await writeJsonFile(MANIFEST_PATH, manifest);
}

/**
 * Remove a puzzle's entry from manifest.json by id, preserving order.
 */
async function removeFromManifest(id) {
  let manifest = { puzzles: [] };
  try {
    manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'));
  } catch {
    return;
  }
  manifest.puzzles = manifest.puzzles.filter((p) => p.id !== id);
  await writeJsonFile(MANIFEST_PATH, manifest);
}

/**
 * Dev-only endpoint that writes edited puzzle JSON straight into
 * public/puzzles/<id>.json (and keeps manifest.json in sync) so the
 * editor round-trips into the repo's real files during development.
 * DELETE removes the file and its manifest entry.
 */
function puzzleWriterPlugin() {
  return {
    name: 'resound-puzzle-writer',
    configureServer(server) {
      server.middlewares.use('/api/puzzles', async (req, res, next) => {
        const id = req.url.replace(/^\//, '').split('?')[0];

        if (req.method === 'DELETE') {
          if (!ID_PATTERN.test(id)) {
            res.statusCode = 400;
            res.end(JSON.stringify({ error: 'Invalid puzzle id' }));
            return;
          }
          try {
            const filePath = path.join(PUZZLES_DIR, `${id}.json`);
            if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
            await removeFromManifest(id);
            res.statusCode = 200;
            res.end(JSON.stringify({ ok: true, id }));
          } catch (err) {
            res.statusCode = 500;
            res.end(JSON.stringify({ error: err.message }));
          }
          return;
        }

        if (req.method !== 'POST') {
          next();
          return;
        }
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
          await writeJsonFile(path.join(PUZZLES_DIR, `${id}.json`), puzzle);
          await upsertManifest(puzzle);
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

/**
 * Run a git subcommand at the repo root. Never throws — resolves a result
 * object so the caller can report stdout/stderr to the editor UI. execFile
 * (no shell) makes user-supplied args like a commit message injection-safe.
 *
 * A timeout + GIT_TERMINAL_PROMPT=0 turn a would-be hang (network stall or a
 * credential prompt with no TTY behind the dev server) into a fast, reported
 * error instead of a request that never resolves and a UI stuck "busy".
 */
function runGit(args, { timeoutMs = 30000 } = {}) {
  return new Promise((resolve) => {
    execFile(
      'git',
      args,
      {
        cwd: __dirname,
        maxBuffer: 16 * 1024 * 1024,
        timeout: timeoutMs,
        env: { ...process.env, GIT_TERMINAL_PROMPT: '0' },
      },
      (err, stdout, stderr) => {
        // execFile kills with SIGTERM on timeout (err.killed + signal set).
        const timedOut = Boolean(err && err.killed && err.signal === 'SIGTERM');
        resolve({
          ok: !err,
          timedOut,
          stdout: (stdout || '').toString(),
          stderr: (stderr || '').toString(),
        });
      }
    );
  });
}

// Strip ANSI color escapes (git hooks like lint-staged emit them) so the
// editor status line shows clean text, not "[34m→".
const ANSI_ESCAPE = new RegExp(`${String.fromCharCode(27)}\\[[0-9;]*m`, 'g');

/** Human-readable failure text from a runGit result (prefers git's own stderr). */
function gitError(r) {
  if (r.timedOut) return 'git timed out — network stall or a credential prompt (no terminal here)';
  return (r.stderr || r.stdout || 'git command failed').replace(ANSI_ESCAPE, '').trim();
}

/**
 * Dev-only git controls for the editor (see src/editor/ui/GitPanel.js).
 * Exposes /api/git/{status,commit,pull,push,revert,unrevert}. commit and
 * revert are scoped to public/puzzles/; push/pull operate on the whole repo
 * (git can't push a subtree). revert stashes uncommitted puzzle edits so it
 * is undoable — unrevert pops that stash (the editor's Cmd-Z-after-revert).
 */
function gitPlugin() {
  return {
    name: 'resound-git-controls',
    configureServer(server) {
      server.middlewares.use('/api/git', async (req, res, next) => {
        const action = req.url.replace(/^\//, '').split('?')[0];
        const send = (status, body) => {
          res.statusCode = status;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify(body));
        };
        try {
          if (req.method === 'GET' && action === 'status') {
            const changed = await runGit(['status', '--porcelain', '--', PUZZLES_PATHSPEC]);
            const files = changed.stdout
              .split('\n')
              .map((s) => s.trim())
              .filter(Boolean);
            const branch = await runGit(['rev-parse', '--abbrev-ref', 'HEAD']);
            const counts = await runGit([
              'rev-list',
              '--left-right',
              '--count',
              '@{upstream}...HEAD',
            ]);
            let behind = 0;
            let ahead = 0;
            if (counts.ok) {
              const parts = counts.stdout.trim().split(/\s+/);
              behind = Number(parts[0]) || 0;
              ahead = Number(parts[1]) || 0;
            }
            send(200, {
              ok: true,
              branch: branch.stdout.trim(),
              changedCount: files.length,
              files,
              ahead,
              behind,
              hasUpstream: counts.ok,
            });
            return;
          }

          if (req.method === 'POST' && action === 'commit') {
            const body = JSON.parse((await readBody(req)) || '{}');
            const message = (body.message || '').trim();
            if (!message) {
              send(400, { ok: false, error: 'Commit message required' });
              return;
            }
            const add = await runGit(['add', '--', PUZZLES_PATHSPEC]);
            if (!add.ok) {
              send(500, { ok: false, error: gitError(add) });
              return;
            }
            const commit = await runGit(['commit', '-m', message]);
            if (!commit.ok) {
              // Non-zero here is usually "nothing to commit" (button raced a
              // stale status) or a failing pre-commit hook — surface it.
              send(500, { ok: false, error: gitError(commit) });
              return;
            }
            const head = await runGit(['rev-parse', '--short', 'HEAD']);
            const hash = head.stdout.trim();
            send(200, {
              ok: true,
              hash,
              summary: `Committed ${hash}`,
              stdout: commit.stdout,
              stderr: commit.stderr,
            });
            return;
          }

          if (req.method === 'POST' && action === 'push') {
            const r = await runGit(['push']);
            if (!r.ok) {
              send(500, { ok: false, error: gitError(r) });
              return;
            }
            const out = `${r.stderr}\n${r.stdout}`;
            const noop = /Everything up-to-date/i.test(out);
            // git prints the update like "   e8b2365..3b363cd  main -> main".
            const refLine = (out.match(/[0-9a-f]{4,}\.\.[0-9a-f]{4,}\s+\S+\s+->\s+\S+/) || [])[0];
            const summary = noop
              ? 'Nothing to push — remote already up to date'
              : `Pushed${refLine ? ` (${refLine.trim()})` : ' to remote'}`;
            send(200, { ok: true, noop, summary, stdout: r.stdout, stderr: r.stderr });
            return;
          }

          if (req.method === 'POST' && action === 'pull') {
            // --autostash: the working tree almost always carries unrelated
            // WIP (src/ edits); without it rebase refuses to run at all.
            const r = await runGit(['pull', '--rebase', '--autostash']);
            if (!r.ok) {
              send(500, { ok: false, error: gitError(r) });
              return;
            }
            const out = `${r.stdout}\n${r.stderr}`;
            const noop = /Already up to date/i.test(out);
            send(200, {
              ok: true,
              noop,
              summary: noop ? 'Already up to date — nothing pulled' : 'Pulled changes from remote',
              stdout: r.stdout,
              stderr: r.stderr,
            });
            return;
          }

          if (req.method === 'POST' && action === 'revert') {
            // Stash (not discard) so Cmd-Z can restore. -u also sweeps up
            // newly-created, still-untracked puzzle files.
            const r = await runGit([
              'stash',
              'push',
              '-u',
              '-m',
              'resound-editor-revert',
              '--',
              PUZZLES_PATHSPEC,
            ]);
            const nothing = /No local changes to save/i.test(r.stdout + r.stderr);
            send(r.ok ? 200 : 500, {
              ok: r.ok,
              nothing,
              summary: nothing ? 'Nothing to revert' : 'Reverted — ⌘Z to restore',
              error: r.ok ? undefined : gitError(r),
              stdout: r.stdout,
              stderr: r.stderr,
            });
            return;
          }

          if (req.method === 'POST' && action === 'unrevert') {
            const r = await runGit(['stash', 'pop']);
            send(r.ok ? 200 : 500, {
              ok: r.ok,
              summary: r.ok ? 'Restored reverted edits' : undefined,
              error: r.ok ? undefined : gitError(r),
              stdout: r.stdout,
              stderr: r.stderr,
            });
            return;
          }

          next();
        } catch (err) {
          send(500, { ok: false, error: err.message });
        }
      });
    },
  };
}

export default defineConfig({
  plugins: [jsconfigPaths(), puzzleWriterPlugin(), gitPlugin()],
  server: {
    // Honor an externally assigned port (tooling that can't use 5173);
    // defaults to Vite's standard 5173 otherwise
    port: Number(process.env.PORT) || 5173,
    watch: {
      // Editor autosave writes puzzle JSON into public/ constantly; Vite's
      // default watcher full-reloads EVERY open tab on any public/ change,
      // which closed editor modals mid-edit and ejected game sessions to the
      // menu. Puzzles are fetch()ed at runtime, so no reload is ever needed.
      ignored: ['**/public/puzzles/**'],
    },
  },
  build: {
    rollupOptions: {
      input: {
        main: 'index.html',
        editor: 'editor.html',
      },
    },
  },
});
