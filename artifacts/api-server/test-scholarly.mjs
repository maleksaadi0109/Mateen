import { build } from 'esbuild';
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';

const temp = await mkdtemp(join(tmpdir(), 'mateen-scholarly-tests-'));
try {
  const entries = (await readdir(new URL('./src/lib/', import.meta.url)))
    .filter((name) => (name.startsWith('scholarly') || name === 'citation-provenance.test.ts') && name.endsWith('.test.ts'))
    .map((name) => new URL(`./src/lib/${name}`, import.meta.url).pathname);
  if (!entries.length) throw new Error('No scholarly regression tests found');
  await build({ entryPoints: entries, bundle: true, platform: 'node', format: 'esm', outdir: temp });
  const result = spawnSync(process.execPath, ['--test', ...entries.map((path) => join(temp, path.split('/').at(-1).replace(/\.ts$/, '.js')))], { stdio: 'inherit' });
  process.exitCode = result.status ?? 1;
} finally {
  await rm(temp, { recursive: true, force: true });
}