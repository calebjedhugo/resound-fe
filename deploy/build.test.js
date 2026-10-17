/**
 * What the production build ships, and how it splits it. three and the
 * resound packages each get a chunk of their own, so a returning player keeps
 * them cached across game edits (a tuning edit to constants.js used to rename
 * the one chunk three shared with it: ~180 kB gzip re-downloaded). The game
 * page loads no editor code and one copy of each package.
 *
 * Runs two real Vite builds (deploy/__tests__/viteBuild.mjs).
 */
import { execFileSync } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';

const ROOT = path.resolve(__dirname, '..');
const BUILD_TIMEOUT_MS = 120000;

let tmp;
let base;
let tuned;

function viteBuild(outDir, ...flags) {
  const helper = path.join(__dirname, '__tests__/viteBuild.mjs');
  return JSON.parse(execFileSync(process.execPath, [helper, outDir, ...flags], { cwd: ROOT }));
}

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
  base = viteBuild(path.join(tmp, 'base'));
  tuned = viteBuild(path.join(tmp, 'tuned'), '--tune');
}, BUILD_TIMEOUT_MS);

afterAll(() => {
  fs.rmSync(tmp, { recursive: true, force: true });
});

describe('A tuning edit to the game constants', () => {
  it('renames the chunk constants.js ships in', () => {
    const holder = (chunks) =>
      Object.keys(chunks).find((file) => chunks[file].modules.includes('src/core/constants.js'));

    expect(holder(tuned)).not.toBe(holder(base));
  });

  it.each(['three', 'resound-notation', 'resound-sound'])('keeps the %s chunk name', (name) => {
    expect(chunkNamed(base, name)).toBeDefined();
    expect(chunkNamed(tuned, name)).toBe(chunkNamed(base, name));
  });
});

describe('The vendor chunks', () => {
  it.each([
    ['three', /^pkg:three\/build\//],
    ['resound-notation', /^pkg:resound-notation\//],
    ['resound-sound', /^pkg:resound-sound\//],
  ])('%s holds only that package and imports nothing', (name, pkg) => {
    const chunk = base[chunkNamed(base, name)];

    expect(chunk.modules.every((id) => pkg.test(id))).toBe(true);
    expect(chunk.imports).toEqual([]);
  });
});

describe('The game page', () => {
  it('loads no editor code', () => {
    const modules = [...gamePageFiles(base)].flatMap((file) => base[file]?.modules || []);

    expect(
      modules.filter((id) => /^src\/editor\/|^pkg:three\/examples\/jsm\/controls\//.test(id))
    ).toEqual([]);
  });

  it('loads one copy of three and of each resound package', () => {
    const modules = [...gamePageFiles(base)].flatMap((file) => base[file]?.modules || []);

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
