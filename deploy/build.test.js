/**
 * What the production build ships, and how it splits it. three and the
 * resound packages each get a chunk of their own, so a returning player keeps
 * them cached across game edits (a tuning edit to constants.js used to rename
 * the one chunk three shared with it: ~180 kB gzip re-downloaded). The game
 * page loads no editor code and one copy of each package, and its stylesheet
 * is a hashed asset too (it was an unhashed public/ file, revalidated before
 * the game script could run).
 *
 * The deploy builds the game alone (RESOUND_BUILD=game, as deploy.sh runs
 * it), and the POC stage (build-poc.mjs) ships it precompressed for nginx's
 * gzip_static, with the asset list deploy/upload.sh prunes by.
 *
 * Runs three real Vite builds (deploy/__tests__/viteBuild.mjs).
 */
import { execFileSync } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import zlib from 'zlib';

const ROOT = path.resolve(__dirname, '..');
const BUILD_TIMEOUT_MS = 120000;

let tmp;
let full; // npm run build: game + editor
let tuned; // the same after a tuning edit
let game; // the deploy's build

function viteBuild(outDir, { tune = false, gameOnly = false } = {}) {
  const helper = path.join(__dirname, '__tests__/viteBuild.mjs');
  const args = [helper, outDir, ...(tune ? ['--tune'] : [])];
  const env = { ...process.env, ...(gameOnly ? { RESOUND_BUILD: 'game' } : {}) };
  // As from a shell: Jest's NODE_ENV=test would make Vite build the DEV flavour
  delete env.NODE_ENV;
  return JSON.parse(execFileSync(process.execPath, args, { cwd: ROOT, env }));
}

const stagePoc = (build, out) =>
  execFileSync(process.execPath, [
    path.join(__dirname, 'build-poc.mjs'),
    path.join(tmp, build),
    path.join(tmp, out),
  ]);

/** Every chunk file the game page (index.html) loads, its CSS included. */
function gamePageFiles(chunks) {
  const entry = Object.keys(chunks).find((file) => /^assets\/main-/.test(file));
  const files = new Set();
  const visit = (file) => {
    if (files.has(file)) return;
    files.add(file);
    chunks[file].css.forEach((css) => files.add(css));
    chunks[file].imports.forEach(visit);
  };
  visit(entry);
  return files;
}

const chunkNamed = (chunks, name) =>
  Object.keys(chunks).find((file) => file.startsWith(`assets/${name}-`));

beforeAll(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'resound-build-'));
  full = viteBuild(path.join(tmp, 'full'));
  tuned = viteBuild(path.join(tmp, 'tuned'), { tune: true });
  game = viteBuild(path.join(tmp, 'game'), { gameOnly: true });
  stagePoc('game', 'poc');
  stagePoc('full', 'poc-from-full');
}, BUILD_TIMEOUT_MS);

afterAll(() => {
  fs.rmSync(tmp, { recursive: true, force: true });
});

describe('A tuning edit to the game constants', () => {
  it('renames the chunk constants.js ships in', () => {
    const holder = (chunks) =>
      Object.keys(chunks).find((file) => chunks[file].modules.includes('src/core/constants.js'));

    expect(holder(tuned)).not.toBe(holder(full));
  });

  it.each(['three', 'resound-notation', 'resound-sound'])('keeps the %s chunk name', (name) => {
    expect(chunkNamed(full, name)).toBeDefined();
    expect(chunkNamed(tuned, name)).toBe(chunkNamed(full, name));
  });
});

describe('The vendor chunks', () => {
  it.each([
    ['three', /^pkg:three\/build\//],
    ['resound-notation', /^pkg:resound-notation\//],
    ['resound-sound', /^pkg:resound-sound\//],
  ])('%s holds only that package and imports nothing', (name, pkg) => {
    const chunk = full[chunkNamed(full, name)];

    expect(chunk.modules.every((id) => pkg.test(id))).toBe(true);
    expect(chunk.imports).toEqual([]);
  });
});

describe('The game page', () => {
  it('loads no editor code', () => {
    const modules = [...gamePageFiles(full)].flatMap((file) => full[file]?.modules || []);

    expect(
      modules.filter((id) => /^src\/editor\/|^pkg:three\/examples\/jsm\/controls\//.test(id))
    ).toEqual([]);
  });

  it('loads one copy of three and of each resound package', () => {
    const modules = [...gamePageFiles(full)].flatMap((file) => full[file]?.modules || []);

    expect(modules.filter((id) => /three\.module\.js$/.test(id))).toEqual([
      'pkg:three/build/three.module.js',
    ]);
    expect(modules.filter((id) => /^pkg:three\/src\//.test(id))).toEqual([]);
    expect(modules.filter((id) => /resound-sound\/dist\/index\.js$/.test(id))).toHaveLength(1);
    expect(
      modules.filter((id) => /resound-notation\/dist\/NotationRenderer\.js$/.test(id))
    ).toHaveLength(1);
  });
});

describe('The deploy build', () => {
  it('holds the game alone', () => {
    const modules = Object.values(game).flatMap((chunk) => chunk.modules);

    expect(modules.filter((id) => /^src\/editor\//.test(id))).toEqual([]);
    expect(fs.existsSync(path.join(tmp, 'game/editor.html'))).toBe(false);
  });

  it('has no dynamic import, so it needs no modulepreload polyfill (and ships none)', () => {
    const chunks = Object.values(game);

    expect(chunks.flatMap((chunk) => chunk.dynamicImports)).toEqual([]);
    expect(
      chunks.flatMap((chunk) => chunk.modules).filter((id) => /modulepreload/.test(id))
    ).toEqual([]);
  });

  it.each([
    ['three', /^pkg:three\/build\//],
    ['resound-notation', /^pkg:resound-notation\//],
    ['resound-sound', /^pkg:resound-sound\//],
  ])('gives %s a chunk of its own', (name, pkg) => {
    const chunk = game[chunkNamed(game, name)];

    expect(chunk.modules.every((id) => pkg.test(id))).toBe(true);
  });
});

describe("The game page's stylesheet", () => {
  const stylesheets = () =>
    [
      ...fs
        .readFileSync(path.join(tmp, 'full/index.html'), 'utf8')
        .matchAll(/<link rel="stylesheet" href="([^"]+)"/g),
    ].map(([, href]) => href);

  it('is a hashed asset', () => {
    expect(stylesheets()).toEqual([expect.stringMatching(/^\/assets\/index-[0-9a-f]{8}\.css$/)]);
  });

  it('ships the menu styles byte-for-byte', () => {
    const [href] = stylesheets();

    expect(fs.readFileSync(path.join(tmp, 'full', href))).toEqual(
      fs.readFileSync(path.join(ROOT, 'src/ui/menu.css'))
    );
  });
});

describe('The POC stage', () => {
  const poc = (...parts) => path.join(tmp, 'poc', ...parts);
  const stagedFiles = () =>
    fs.readdirSync(poc(), { recursive: true }).filter((f) => fs.statSync(poc(f)).isFile());

  it('drops the editor from a full build', () => {
    const staged = fs.readdirSync(path.join(tmp, 'poc-from-full'), { recursive: true });

    expect(staged.filter((f) => /editor/.test(f))).toEqual([]);
  });

  it('ships only the POC levels', () => {
    const { puzzles } = JSON.parse(fs.readFileSync(poc('puzzles/manifest.json'), 'utf8'));
    const levels = fs.readdirSync(poc('puzzles')).filter((f) => f.endsWith('.json'));

    expect(puzzles.every(({ id }) => id.startsWith('poc-'))).toBe(true);
    expect(levels.sort()).toEqual(
      ['manifest.json', ...puzzles.map(({ id }) => `${id}.json`)].sort()
    );
  });

  it('precompresses every page, script, stylesheet and puzzle', () => {
    const text = stagedFiles().filter((f) => /\.(html|js|css|json)$/.test(f));

    expect(text.filter((f) => !fs.existsSync(poc(`${f}.gz`)))).toEqual([]);
  });

  it('every .gz unzips to exactly the file beside it', () => {
    const gzipped = stagedFiles().filter((f) => f.endsWith('.gz'));
    const unzipsWrong = (gz) =>
      !zlib.gunzipSync(fs.readFileSync(poc(gz))).equals(fs.readFileSync(poc(gz.slice(0, -3))));

    expect(gzipped.length).toBeGreaterThan(0);
    expect(gzipped.filter(unzipsWrong)).toEqual([]);
  });

  it('lists exactly the assets it ships, for the upload to keep next time', () => {
    expect(fs.readFileSync(poc('.deploy-assets'), 'utf8')).toBe(
      `${fs.readdirSync(poc('assets')).sort().join('\n')}\n`
    );
  });
});
