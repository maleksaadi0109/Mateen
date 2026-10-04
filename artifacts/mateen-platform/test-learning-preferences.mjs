import { build } from 'esbuild';
import { mkdtemp, rm } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = dirname(fileURLToPath(import.meta.url));
const temp = await mkdtemp(join(root, '.learning-preferences-tests-'));
try {
  const outfile = join(temp, 'settings.test.mjs');
  await build({
    entryPoints: [join(root, 'tests/learning-preferences.test.tsx')],
    bundle: true, platform: 'node', format: 'esm', outfile, jsx: 'automatic',
    external: ['react', 'react/*', 'react-dom', 'react-dom/*', 'jsdom', '@tanstack/react-query', '@radix-ui/*', 'lucide-react'],
  });
  const result = spawnSync(process.execPath, ['--import', join(root, 'tests/doubles/learning-preferences-dom.mjs'), '--test', outfile], { stdio: 'inherit', timeout: 30000 });
  if (result.status !== 0) throw new Error('Learning preferences UI regression failed');
} finally {
  await rm(temp, { recursive: true, force: true });
}