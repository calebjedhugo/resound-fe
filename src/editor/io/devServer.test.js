/**
 * Dev-server endpoints (vite.config.js) that the editor saves and commits
 * through: the puzzle writer (/api/puzzles) and the git controls' status
 * read (/api/git/status).
 *
 * The real middleware runs against a temp directory, driven by bare
 * request/response objects. Prettier cannot load under Jest (it needs
 * --experimental-vm-modules), so a stand-in formatter records its calls and
 * the writer's contract with prettier is pinned by what it is asked to do.
 * Vite itself is only `defineConfig` here (its CJS shim won't load under
 * Jest either). git is real, in throwaway repos.
 */
import fs from 'fs';
import os from 'os';
import path from 'path';
import { Readable } from 'stream';
import { execFileSync } from 'child_process';
import prettier from 'prettier';
import { puzzleWriterPlugin, gitPlugin } from '../../../vite.config';

jest.mock('vite', () => ({ defineConfig: (config) => config }));
jest.mock('vite-jsconfig-paths', () => () => ({ name: 'vite-jsconfig-paths' }));
jest.mock('prettier', () => ({
  resolveConfig: jest.fn(async () => ({ tabWidth: 2, printWidth: 100 })),
  // Deterministic like prettier; a puzzle carrying `slow` takes a while, so
  // a save that started first could finish last.
  format: jest.fn(async (source) => {
    const obj = JSON.parse(source);
    if (obj.slow) {
      await new Promise((resolve) => {
        setTimeout(resolve, 30);
      });
    }
    return `${JSON.stringify(obj, null, 2)}\n`;
  }),
}));

/** Mount a plugin's middleware; returns `request(method, url, body)`. */
function mount(plugin) {
  let handler;
  plugin.configureServer({
    middlewares: {
      use: (prefix, fn) => {
        handler = fn;
      },
    },
  });
  return (method, url, body) =>
    new Promise((resolve, reject) => {
      const req = Readable.from(body === undefined ? [] : [JSON.stringify(body)]);
      req.method = method;
      req.url = url;
      const res = {
        statusCode: 200,
        setHeader() {},
        end: (text) => resolve({ status: res.statusCode, body: JSON.parse(text) }),
      };
      handler(req, res, () => resolve({ status: 404 })).catch(reject);
    });
}

const formatted = (obj) => `${JSON.stringify(obj, null, 2)}\n`;
const wait = (ms) =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
const puzzle = (id, fields = {}) => ({ id, name: id, difficulty: 1, entities: [], ...fields });

let tmpDirs = [];
function makeTempDir(prefix) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  tmpDirs.push(dir);
  return dir;
}

beforeEach(() => {
  jest.useRealTimers(); // streams, fs and child processes need the real event loop
  prettier.format.mockClear();
  prettier.resolveConfig.mockClear();
});

afterEach(() => {
  tmpDirs.forEach((dir) => fs.rmSync(dir, { recursive: true, force: true }));
  tmpDirs = [];
  jest.useFakeTimers();
});

describe('puzzle writer', () => {
  let dir;
  let request;
  const read = (name) => fs.readFileSync(path.join(dir, name), 'utf8');
  const save = (json) => request('POST', `/${json.id}`, json);

  beforeEach(() => {
    dir = makeTempDir('resound-puzzles-');
    request = mount(puzzleWriterPlugin({ dir }));
  });

  it('writes the puzzle and its manifest entry exactly as prettier formats them', async () => {
    const json = puzzle('meadow', { name: 'Meadow', difficulty: 2 });

    const res = await save(json);

    expect(res).toEqual({ status: 200, body: { ok: true, id: 'meadow' } });
    expect(read('meadow.json')).toBe(formatted(json));
    expect(read('manifest.json')).toBe(
      formatted({ puzzles: [{ id: 'meadow', name: 'Meadow', difficulty: 2 }] })
    );
    // The `prettier --write` contract: the compact JSON, the file's own
    // config, its path, and the json parser.
    expect(prettier.resolveConfig).toHaveBeenCalledWith(path.join(dir, 'meadow.json'));
    expect(prettier.format).toHaveBeenCalledWith(JSON.stringify(json), {
      tabWidth: 2,
      printWidth: 100,
      filepath: path.join(dir, 'meadow.json'),
      parser: 'json',
    });
  });

  it('leaves files alone when a save would not change their bytes', async () => {
    await save(puzzle('meadow'));
    const past = new Date('2026-01-01T00:00:00Z');
    fs.utimesSync(path.join(dir, 'meadow.json'), past, past);
    fs.utimesSync(path.join(dir, 'manifest.json'), past, past);

    await save(puzzle('meadow'));

    const mtime = (name) => fs.statSync(path.join(dir, name)).mtime.getTime();
    expect(mtime('meadow.json')).toBe(past.getTime());
    expect(mtime('manifest.json')).toBe(past.getTime());
  });

  it('rewrites only what changed: an edit that keeps the manifest entry leaves the manifest', async () => {
    await save(puzzle('meadow'));
    const past = new Date('2026-01-01T00:00:00Z');
    fs.utimesSync(path.join(dir, 'manifest.json'), past, past);

    await save(puzzle('meadow', { tempo: 90 }));

    expect(read('meadow.json')).toBe(formatted(puzzle('meadow', { tempo: 90 })));
    expect(fs.statSync(path.join(dir, 'manifest.json')).mtime.getTime()).toBe(past.getTime());

    await save(puzzle('meadow', { tempo: 90, name: 'Renamed' }));
    expect(read('manifest.json')).toBe(
      formatted({ puzzles: [{ id: 'meadow', name: 'Renamed', difficulty: 1 }] })
    );
  });

  it('formats a re-sent file once and resolves each file config once', async () => {
    await save(puzzle('meadow'));
    expect(prettier.format).toHaveBeenCalledTimes(2); // puzzle + manifest

    await save(puzzle('meadow'));
    await save(puzzle('meadow'));

    expect(prettier.format).toHaveBeenCalledTimes(2);
    expect(prettier.resolveConfig).toHaveBeenCalledTimes(2);
  });

  it('restores a file changed on disk since the last save, even when the save repeats', async () => {
    await save(puzzle('meadow'));
    fs.writeFileSync(path.join(dir, 'meadow.json'), '{"id":"meadow","reverted":true}\n');

    await save(puzzle('meadow'));

    expect(read('meadow.json')).toBe(formatted(puzzle('meadow')));
  });

  it('lands overlapping saves of one puzzle in arrival order, the latest winning', async () => {
    const first = save(puzzle('meadow', { version: 1, slow: true }));
    await wait(5); // version 1 is mid-format
    const responses = await Promise.all([
      first,
      save(puzzle('meadow', { version: 2 })),
      save(puzzle('meadow', { version: 3 })),
    ]);

    expect(responses.map((r) => r.status)).toEqual([200, 200, 200]);
    expect(JSON.parse(read('meadow.json')).version).toBe(3);
    // version 2 was still waiting its turn when 3 arrived: never formatted
    const formattedVersions = prettier.format.mock.calls
      .map(([source]) => JSON.parse(source).version)
      .filter(Boolean);
    expect(formattedVersions).toEqual([1, 3]);
  });

  it('keeps every manifest entry when different puzzles save at once', async () => {
    await Promise.all([
      save(puzzle('meadow', { slow: true })),
      save(puzzle('cavern')),
      save(puzzle('summit')),
    ]);

    const ids = JSON.parse(read('manifest.json')).puzzles.map((p) => p.id);
    expect(ids.sort()).toEqual(['cavern', 'meadow', 'summit']);
  });

  it('orders a delete between the saves around it', async () => {
    const requests = [save(puzzle('meadow', { version: 0, slow: true }))];
    await wait(5); // version 0 is mid-format
    requests.push(save(puzzle('meadow', { version: 1 })));
    await wait(5); // version 1 is waiting its turn
    requests.push(request('DELETE', '/meadow'));
    requests.push(save(puzzle('meadow', { version: 2 }))); // must not ride on version 1

    const results = await Promise.all(requests);

    expect(results.map((r) => r.status)).toEqual([200, 200, 200, 200]);
    expect(JSON.parse(read('meadow.json')).version).toBe(2);
    expect(JSON.parse(read('manifest.json')).puzzles.map((p) => p.id)).toEqual(['meadow']);
  });
});

describe('git status', () => {
  // Isolate from the developer's git config (signing, default branch...).
  const GIT_ENV = {
    GIT_CONFIG_GLOBAL: '/dev/null',
    GIT_CONFIG_NOSYSTEM: '1',
    GIT_AUTHOR_NAME: 'Test',
    GIT_AUTHOR_EMAIL: 'test@example.com',
    GIT_COMMITTER_NAME: 'Test',
    GIT_COMMITTER_EMAIL: 'test@example.com',
  };
  let savedEnv;
  let remote;
  let repo;
  let status;

  const git = (cwd, ...args) => execFileSync('git', args, { cwd, stdio: 'pipe' }).toString();
  const writeFile = (cwd, file, text) => {
    fs.mkdirSync(path.dirname(path.join(cwd, file)), { recursive: true });
    fs.writeFileSync(path.join(cwd, file), text);
  };
  const commitAll = (cwd, message) => {
    git(cwd, 'add', '-A');
    git(cwd, 'commit', '-q', '-m', message);
  };

  beforeEach(() => {
    savedEnv = Object.fromEntries(Object.keys(GIT_ENV).map((key) => [key, process.env[key]]));
    Object.assign(process.env, GIT_ENV);

    const root = makeTempDir('resound-git-');
    remote = path.join(root, 'remote.git');
    repo = path.join(root, 'work');
    git(root, 'init', '-q', '--bare', '-b', 'main', remote);
    git(root, 'init', '-q', '-b', 'main', repo);
    writeFile(repo, 'public/puzzles/meadow.json', '{}\n');
    writeFile(repo, 'src/game.js', '// game\n');
    commitAll(repo, 'start');
    git(repo, 'remote', 'add', 'origin', remote);
    git(repo, 'push', '-q', '-u', 'origin', 'main');

    const request = mount(gitPlugin({ cwd: repo }));
    status = async () => (await request('GET', '/status')).body;
  });

  afterEach(() => {
    Object.keys(GIT_ENV).forEach((key) => {
      if (savedEnv[key] === undefined) delete process.env[key];
      else process.env[key] = savedEnv[key];
    });
  });

  it('reports a clean tracking branch', async () => {
    expect(await status()).toEqual({
      ok: true,
      branch: 'main',
      changedCount: 0,
      files: [],
      ahead: 0,
      behind: 0,
      hasUpstream: true,
    });
  });

  it('counts only changed puzzle files, as porcelain lines', async () => {
    writeFile(repo, 'public/puzzles/meadow.json', '{ "changed": true }\n');
    writeFile(repo, 'public/puzzles/cavern.json', '{}\n');
    writeFile(repo, 'src/game.js', '// edited, but not a puzzle\n');

    const s = await status();

    expect(s.changedCount).toBe(2);
    expect(s.files).toEqual(['M public/puzzles/meadow.json', '?? public/puzzles/cavern.json']);
  });

  it('reports commits ahead of and behind the upstream', async () => {
    const other = path.join(path.dirname(repo), 'other');
    git(path.dirname(repo), 'clone', '-q', remote, other);
    writeFile(other, 'src/theirs.js', '// theirs\n');
    commitAll(other, 'theirs');
    git(other, 'push', '-q');
    git(repo, 'fetch', '-q');
    writeFile(repo, 'src/mine.js', '// mine\n');
    commitAll(repo, 'mine');
    writeFile(repo, 'src/mine2.js', '// mine too\n');
    commitAll(repo, 'mine too');

    expect(await status()).toMatchObject({ ahead: 2, behind: 1, hasUpstream: true });
  });

  it('has no upstream on an untracked branch, or once the upstream is gone', async () => {
    git(repo, 'checkout', '-q', '-b', 'sketch');
    expect(await status()).toMatchObject({
      branch: 'sketch',
      hasUpstream: false,
      ahead: 0,
      behind: 0,
    });

    git(repo, 'push', '-q', '-u', 'origin', 'sketch');
    git(repo, 'push', '-q', 'origin', '--delete', 'sketch');
    git(repo, 'fetch', '-q', '--prune');
    expect(await status()).toMatchObject({ branch: 'sketch', hasUpstream: false });
  });

  it('names a detached HEAD "HEAD", with no upstream', async () => {
    git(repo, 'checkout', '-q', '--detach');

    expect(await status()).toMatchObject({ branch: 'HEAD', hasUpstream: false, changedCount: 0 });
  });
});
