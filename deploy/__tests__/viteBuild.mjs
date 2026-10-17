#!/usr/bin/env node
/**
 * Test helper: run the production build (the repo's own vite.config.js) into
 * <outDir> and print what it emitted as JSON: for every chunk, its static
 * imports and the modules inside it (ids relative to the repo, packages as
 * `pkg:<name>/<path>`). Vite and Rollup are ESM-only, so the Jest suite runs
 * this as a child process.
 *
 * `--tune` first changes one game constant, as a tuning edit would.
 *
 * Usage: node deploy/__tests__/viteBuild.mjs <outDir> [--tune]
 */
import path from 'path';
import { fileURLToPath } from 'url';
import { build } from 'vite';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const [outDir, flag] = process.argv.slice(2);

// A tuning edit: one constant both entries use, nudged
const tuningEdit = {
  name: 'tuning-edit',
  transform(code, id) {
    if (!id.endsWith('/src/core/constants.js')) return null;
    return code.replace(/TAPE_SLOT_CAP = (\d+)/, (_, cap) => `TAPE_SLOT_CAP = ${Number(cap) + 1}`);
  },
};

const moduleName = (id) =>
  id
    .replace(/^.*\/node_modules\//, 'pkg:')
    .replace(/^.*\/(resound-(?:notation|sound))\//, 'pkg:$1/')
    .replace(`${ROOT}/`, '');

const chunks = {};
await build({
  root: ROOT,
  configFile: path.join(ROOT, 'vite.config.js'),
  logLevel: 'silent',
  build: { outDir: path.resolve(outDir), emptyOutDir: true },
  plugins: [
    ...(flag === '--tune' ? [tuningEdit] : []),
    {
      name: 'report-chunks',
      generateBundle(_, bundle) {
        Object.values(bundle)
          .filter((file) => file.type === 'chunk')
          .forEach((chunk) => {
            chunks[chunk.fileName] = {
              imports: chunk.imports,
              css: [...(chunk.viteMetadata?.importedCss || [])],
              modules: Object.keys(chunk.modules).map(moduleName),
            };
          });
      },
    },
  ],
});

process.stdout.write(JSON.stringify(chunks));
