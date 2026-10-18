/**
 * deploy/upload.sh, run against a local web root (rsync treats one like the
 * Pi's): a deploy never takes away a file the page before it still needs.
 * New assets and puzzles land before index.html changes, the previous
 * deploy's assets stay, and only older ones are pruned. Re-running a deploy
 * is harmless, and unchanged files keep their ETags.
 */
import { execFileSync } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';

const UPLOAD = path.join(__dirname, 'upload.sh');
const LONG_AGO = new Date('2020-01-01T00:00:00Z');

let tmp;
let root; // The web root

/** A staged build as build-poc.mjs leaves one: assets, puzzles, index.html, the asset list. */
function stage(name, { assets, puzzles = { 'poc-a.json': '{"id":"poc-a"}' } }) {
  const dir = path.join(tmp, name);
  fs.mkdirSync(path.join(dir, 'assets'), { recursive: true });
  fs.mkdirSync(path.join(dir, 'puzzles'));
  assets.forEach((file) => fs.writeFileSync(path.join(dir, 'assets', file), `// ${file}`));
  Object.entries(puzzles).forEach(([file, json]) => {
    fs.writeFileSync(path.join(dir, 'puzzles', file), json);
  });
  const scripts = assets.map((file) => `<script src="/assets/${file}"></script>`);
  fs.writeFileSync(path.join(dir, 'index.html'), scripts.join('\n'));
  fs.writeFileSync(path.join(dir, '.deploy-assets'), `${[...assets].sort().join('\n')}\n`);
  return dir;
}

const deploy = (dir) => execFileSync('bash', [UPLOAD, dir, root], { stdio: 'pipe' });
const served = (dir) => fs.readdirSync(path.join(root, dir)).sort();
const servedFile = (file) => path.join(root, file);

const V1 = { assets: ['main-1.js', 'three-a.js'] };
const V2 = { assets: ['main-2.js', 'three-a.js'] };
const V3 = { assets: ['main-3.js', 'three-a.js'] };

beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'resound-upload-'));
  root = path.join(tmp, 'www');
  fs.mkdirSync(root);
});

afterEach(() => {
  fs.rmSync(tmp, { recursive: true, force: true });
});

describe('Uploading a deploy', () => {
  it('serves the new build', () => {
    deploy(stage('v1', V1));

    expect(fs.readFileSync(servedFile('index.html'), 'utf8')).toContain('/assets/main-1.js');
    expect(served('assets')).toEqual(['main-1.js', 'three-a.js']);
  });

  it('puts the new assets and puzzles in place before index.html changes', () => {
    deploy(stage('v1', V1));
    deploy(stage('v2', { ...V2, puzzles: { 'poc-a.json': '{"id":"poc-a","v":2}' } }));

    const changed = (file) => fs.statSync(servedFile(file)).ctimeMs;
    const index = changed('index.html');
    expect(changed('assets/main-2.js')).toBeLessThan(index);
    expect(changed('puzzles/poc-a.json')).toBeLessThan(index);
  });

  it("keeps the previous deploy's assets", () => {
    deploy(stage('v1', V1));
    deploy(stage('v2', V2));

    expect(served('assets')).toEqual(['main-1.js', 'main-2.js', 'three-a.js']);
  });

  it('prunes the assets of deploys older than the previous one', () => {
    deploy(stage('v1', V1));
    deploy(stage('v2', V2));
    deploy(stage('v3', V3));

    expect(served('assets')).toEqual(['main-2.js', 'main-3.js', 'three-a.js']);
  });

  it('prunes nothing more when the live build is uploaded again', () => {
    deploy(stage('v1', V1));
    deploy(stage('v2', V2));
    deploy(stage('v2-again', V2));

    expect(served('assets')).toEqual(['main-1.js', 'main-2.js', 'three-a.js']);
  });

  it('prunes nothing on a web root with no record of its last deploy', () => {
    fs.mkdirSync(path.join(root, 'assets'));
    fs.writeFileSync(servedFile('assets/main-0.js'), '// before the asset record existed');

    deploy(stage('v1', V1));

    expect(served('assets')).toEqual(['main-0.js', 'main-1.js', 'three-a.js']);
  });

  it('removes puzzles the new build dropped', () => {
    deploy(stage('v1', { ...V1, puzzles: { 'poc-a.json': '{}', 'poc-b.json': '{}' } }));
    deploy(stage('v2', { ...V2, puzzles: { 'poc-a.json': '{}' } }));

    expect(served('puzzles')).toEqual(['poc-a.json']);
  });

  it('leaves an unchanged file untouched, so its ETag survives', () => {
    deploy(stage('v1', V1));
    fs.utimesSync(servedFile('puzzles/poc-a.json'), LONG_AGO, LONG_AGO);

    deploy(stage('v2', V2));

    expect(fs.statSync(servedFile('puzzles/poc-a.json')).mtime).toEqual(LONG_AGO);
  });
});
