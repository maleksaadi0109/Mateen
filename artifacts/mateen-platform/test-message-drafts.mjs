import { build } from 'esbuild';
import { mkdtemp, rm } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = dirname(fileURLToPath(import.meta.url));
const temp = await mkdtemp(join(root, '.message-draft-tests-'));
try {
  const outfile = join(temp, 'messages.test.mjs');
  await build({
    entryPoints: [join(root, 'tests/message-drafts.test.tsx')],
    bundle: true, platform: 'node', format: 'esm', outfile, jsx: 'automatic',
    define: { 'import.meta.env.BASE_URL': '"/"' },
    alias: { '@assets': join(root, '../../attached_assets') },
    loader: { '.png': 'dataurl' },
    external: ['react', 'react/*', 'react-dom', 'react-dom/*', 'jsdom', '@tanstack/react-query', '@radix-ui/*', 'lucide-react', '@clerk/react', 'wouter'],
  });
  const result = spawnSync(process.execPath, ['--import', join(root, 'tests/doubles/learning-preferences-dom.mjs'), '--test', outfile], { stdio: 'inherit', timeout: 30000 });
  if (result.status !== 0) throw new Error('Message draft regressions failed');
} finally {
  await rm(temp, { recursive: true, force: true });
}