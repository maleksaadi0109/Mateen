import { build } from 'esbuild';
import { mkdtemp, rm } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = dirname(fileURLToPath(import.meta.url));
const temp = await mkdtemp(join(root, '.source-card-tests-'));
try {
  await build({
    entryPoints: [join(root, 'tests/source-card.test.tsx'), join(root, 'tests/chat-request.test.ts')],
    bundle: true, platform: 'node', format: 'esm', outdir: temp, jsx: 'automatic',
    define: { 'import.meta.env.BASE_URL': '"/"' },
    external: ['react', 'react/*', 'react-dom', 'react-dom/*', 'jsdom', '@tanstack/react-query', 'lucide-react', '@clerk/react'],
  });
  const result = spawnSync(process.execPath, ['--import', join(root, 'tests/doubles/learning-preferences-dom.mjs'), '--test',
    join(temp, 'source-card.test.js'), join(temp, 'chat-request.test.js')], { stdio: 'inherit', timeout: 30000 });
  if (result.status !== 0) throw new Error('Source card regressions failed');
} finally { await rm(temp, { recursive: true, force: true }); }
