import { build } from 'esbuild';
import { mkdtemp, rm } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
const root = dirname(fileURLToPath(import.meta.url));
const temp = await mkdtemp(join(root, '.review-tests-'));
try {
  const outfile = join(temp, 'review.test.mjs');
  await build({
    entryPoints: [join(root, 'tests/review-access.test.tsx')], bundle: true, platform: 'node', format: 'esm', outfile, jsx: 'automatic',
    define: { 'import.meta.env.BASE_URL': '"/"' },
    external: ['react', 'react/*', 'react-dom/*', '@tanstack/react-query', 'jsdom', 'wouter', 'lucide-react'],
    plugins: [{ name: 'review-test-boundaries', setup(builder) {
      for (const [filter, path] of [
        [/^@clerk\/react(?:\/errors)?$/, 'tests/doubles/review-auth.tsx'],
        [/^@\/components\/mateen\/bits$/, 'tests/doubles/review-bits.tsx'],
        [/^@\/components\/ui\/dialog$/, 'tests/doubles/review-dialog.tsx'],
        [/^@\/components\/admin\/DocPreview$/, 'tests/doubles/review-pdf.tsx'],
      ]) builder.onResolve({ filter }, () => ({ path: join(root, path) }));
    } }],
  });
  const result = spawnSync(process.execPath, ['--test', '--test-timeout=20000', outfile], { stdio: 'inherit' });
  process.exitCode = result.status ?? 1;
} finally { await rm(temp, { recursive: true, force: true }); }
