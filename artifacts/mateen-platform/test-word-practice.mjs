import { build } from 'esbuild';
import { mkdtemp, rm } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = dirname(fileURLToPath(import.meta.url));
const temp = await mkdtemp(join(root, '.word-practice-tests-'));
try {
  await build({ entryPoints: [join(root, 'tests/word-practice-selection.test.ts'), join(root, 'tests/word-practice-summary.test.ts')], bundle: true, platform: 'node', format: 'esm', outdir: temp });
  const result = spawnSync(process.execPath, ['--test', join(temp, 'word-practice-selection.test.js'), join(temp, 'word-practice-summary.test.js')], { stdio: 'inherit', timeout: 30000 });
  if (result.status !== 0) throw new Error('Word practice selection tests failed');
} finally { await rm(temp, { recursive: true, force: true }); }
