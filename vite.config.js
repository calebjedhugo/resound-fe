import { defineConfig } from 'vite';
import jsconfigPaths from 'vite-jsconfig-paths';
import fs from 'fs';
import path from 'path';
import { execFile } from 'child_process';
import prettier from 'prettier';

const PUZZLES_DIR = path.resolve(__dirname, 'public/puzzles');
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

// Prettier costs ~1 ms to resolve a file's config and 10-20 ms to format a
// puzzle (measured 2026-10-17), on EVERY autosave. Prettier is deterministic,
// so each file's config is resolved once (prettier itself caches it for the
// process anyway) and an input identical to that file's last one reuses the
// last output: the manifest, whose text rarely changes, formats once.
const prettierConfigs = new Map(); // file path -> Promise<prettier config>
const lastFormatted = new Map(); // file path -> { source, formatted }

function prettierConfigFor(filePath) {
  if (!prettierConfigs.has(filePath)) {
    const config = prettier.resolveConfig(filePath);
    config.catch(() => prettierConfigs.delete(filePath)); // retry on the next save
    prettierConfigs.set(filePath, config);
  }
  return prettierConfigs.get(filePath);
}

async function formatJson(filePath, obj) {
  const source = JSON.stringify(obj);
  const last = lastFormatted.get(filePath);
  if (last && last.source === source) return last.formatted;
  const config = await prettierConfigFor(filePath);
  const formatted = await prettier.format(source, {
    ...config,
    filepath: filePath,
    parser: 'json',
  });
  lastFormatted.set(filePath, { source, formatted });
  return formatted;
}

/**
 * Write an object to a JSON file formatted exactly as the repo's Prettier
 * config would, so editor-written files match `prettier --write` and pass
 * the lint-staged check on commit (no formatting churn). A file that already
 * holds exactly those bytes is not rewritten.
 */
async function writeJsonFile(filePath, obj) {
  const formatted = await formatJson(filePath, obj);
  let current = null;
  try {
    current = fs.readFileSync(filePath, 'utf8');
  } catch {
    // No file yet.
  }
  if (current !== formatted) fs.writeFileSync(filePath, formatted);
}

/**
 * The puzzle files of one directory (public/puzzles/ in dev). Writes run ONE
 * AT A TIME in arrival order: two saves interleaving the manifest's
 * read-modify-write could drop an entry, and a slow format could land an
 * older save after a newer one. A save still waiting its turn takes on any
 * newer save of the same puzzle, so a burst formats and writes once.
 */
function createPuzzleFiles(dir) {
  const manifestPath = path.join(dir, 'manifest.json');
  const waiting = new Map(); // puzzle id -> queued save that has not started
  let tail = Promise.resolve();

  function enqueue(task) {
    const run = tail.then(task);
    tail = run.catch(() => {}); // a failed write must not block the next
    return run;
  }

  function readManifest() {
    return JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  }

  /**
   * Upsert a puzzle's summary into manifest.json, preserving order.
   * Updates an existing entry by id, or appends a new one.
   */
  async function upsertManifest(puzzle) {
    let manifest = { puzzles: [] };
    try {
      manifest = readManifest();
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
    await writeJsonFile(manifestPath, manifest);
  }

  /**
   * Remove a puzzle's entry from manifest.json by id, preserving order.
   */
  async function removeFromManifest(id) {
    let manifest;
    try {
      manifest = readManifest();
    } catch {
      return;
    }
    manifest.puzzles = manifest.puzzles.filter((p) => p.id !== id);
    await writeJsonFile(manifestPath, manifest);
  }

  return {
    /** Write <id>.json and its manifest entry; resolves once they are on disk. */
    save(puzzle) {
      const queued = waiting.get(puzzle.id);
      if (queued) {
        queued.puzzle = puzzle; // latest content wins; both callers settle on its write
        return queued.run;
      }
      const save = { puzzle };
      waiting.set(puzzle.id, save);
      save.run = enqueue(async () => {
        waiting.delete(puzzle.id); // from here on, a newer save queues behind this one
        await writeJsonFile(path.join(dir, `${puzzle.id}.json`), save.puzzle);
        await upsertManifest(save.puzzle);
      });
      return save.run;
    },

    /** Remove <id>.json and its manifest entry. */
    delete(id) {
      waiting.delete(id); // a save arriving after the delete must land after it
      return enqueue(async () => {
        const filePath = path.join(dir, `${id}.json`);
        if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
        await removeFromManifest(id);
      });
    },
  };
}

/**
 * Dev-only endpoint that writes edited puzzle JSON straight into
 * public/puzzles/<id>.json (and keeps manifest.json in sync) so the
 * editor round-trips into the repo's real files during development.
 * DELETE removes the file and its manifest entry. `dir` exists for tests.
 */
export function puzzleWriterPlugin({ dir = PUZZLES_DIR } = {}) {
  const files = createPuzzleFiles(dir);
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
            await files.delete(id);
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
          await files.save(puzzle);
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
function runGit(args, { cwd = __dirname, timeoutMs = 30000 } = {}) {
  return new Promise((resolve) => {
    execFile(
      'git',
      args,
      {
        cwd,
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
 * Parse `git status --porcelain --branch` into the editor's status shape.
 * The `## ` header carries what used to take two more spawns (rev-parse for
 * the branch, rev-list for ahead/behind):
 *   ## main...origin/main [ahead 1, behind 2]   tracking (counts when nonzero)
 *   ## main...origin/main [gone]                 upstream ref deleted
 *   ## main | ## No commits yet on main          no upstream
 *   ## HEAD (no branch)                          detached
 */
function parseStatus(stdout) {
  const lines = stdout.split('\n').filter(Boolean);
  const header = lines[0] && lines[0].startsWith('## ') ? lines.shift().slice(3) : '';
  const files = lines.map((s) => s.trim());
  const [, local = header, upstream, track = ''] =
    header.match(/^(.*?)\.\.\.(\S+)(?: \[(.*)\])?$/) || [];
  let branch = local.replace(/^No commits yet on /, '');
  if (branch === 'HEAD (no branch)') branch = 'HEAD'; // what rev-parse --abbrev-ref says
  const count = (label) => Number((track.match(new RegExp(`${label} (\\d+)`)) || [])[1]) || 0;
  return {
    branch,
    changedCount: files.length,
    files,
    ahead: count('ahead'),
    behind: count('behind'),
    hasUpstream: Boolean(upstream) && track !== 'gone',
  };
}

/**
 * Dev-only git controls for the editor (see src/editor/ui/GitPanel.js).
 * Exposes /api/git/{status,commit,pull,push,revert,unrevert}. commit and
 * revert are scoped to public/puzzles/; push/pull operate on the whole repo
 * (git can't push a subtree). revert stashes uncommitted puzzle edits so it
 * is undoable — unrevert pops that stash (the editor's Cmd-Z-after-revert).
 * `cwd` (the repo to drive) exists for tests.
 */
export function gitPlugin({ cwd = __dirname } = {}) {
  const git = (args, options) => runGit(args, { cwd, ...options });
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
            // ONE spawn (it was three: ~98 ms -> ~39 ms a read, measured
            // 2026-10-17). A failed status reads as a clean, branchless tree,
            // as it always has.
            const r = await git([
              'status',
              '--porcelain',
              '--branch',
              '--ahead-behind',
              '--',
              PUZZLES_PATHSPEC,
            ]);
            send(200, { ok: true, ...parseStatus(r.stdout) });
            return;
          }

          if (req.method === 'POST' && action === 'commit') {
            const body = JSON.parse((await readBody(req)) || '{}');
            const message = (body.message || '').trim();
            if (!message) {
              send(400, { ok: false, error: 'Commit message required' });
              return;
            }
            const add = await git(['add', '--', PUZZLES_PATHSPEC]);
            if (!add.ok) {
              send(500, { ok: false, error: gitError(add) });
              return;
            }
            const commit = await git(['commit', '-m', message]);
            if (!commit.ok) {
              // Non-zero here is usually "nothing to commit" (button raced a
              // stale status) or a failing pre-commit hook — surface it.
              send(500, { ok: false, error: gitError(commit) });
              return;
            }
            const head = await git(['rev-parse', '--short', 'HEAD']);
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
            const r = await git(['push']);
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
            const r = await git(['pull', '--rebase', '--autostash']);
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
            const r = await git([
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
            const r = await git(['stash', 'pop']);
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

// Cross-origin isolation for local serving only (dev + `vite preview`): it
// raises performance.now() from Chrome's 100 µs to 5 µs resolution, which the
// dev frame profiler (core/FrameProfiler) needs to time sub-0.1 ms calls.
// Safe because the app loads nothing cross-origin.
const ISOLATION_HEADERS = {
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Embedder-Policy': 'require-corp',
};

export default defineConfig({
  plugins: [jsconfigPaths(), puzzleWriterPlugin(), gitPlugin()],
  preview: { headers: ISOLATION_HEADERS },
  server: {
    headers: ISOLATION_HEADERS,
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
