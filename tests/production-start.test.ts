import { it, expect } from 'vitest';
import { mkdtemp, mkdir, copyFile, writeFile, rm, realpath } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { execFileSync } from 'node:child_process';

it('spustí skutečný release z jiné pracovní cesty a ověří jeho SHA před importem aplikace', async () => {
  const root = await mkdtemp(join(tmpdir(), 'faktury-production-start-'));
  const sha = 'a'.repeat(40);
  try {
    await mkdir(join(root, 'scripts'));
    await mkdir(join(root, 'dist/api'), { recursive: true });
    await copyFile('scripts/start-production.mjs', join(root, 'scripts/start-production.mjs'));
    await writeFile(join(root, 'package.json'), '{"type":"module"}');
    await writeFile(join(root, '.env'), 'NODE_ENV=development\nDEPLOY_SHA=old\n');
    await writeFile(join(root, '.release.env'), 'DEPLOY_SHA=' + sha + '\n');
    await writeFile(
      join(root, 'dist/api/main.js'),
      'console.log(JSON.stringify({cwd:process.cwd(),sha:process.env.DEPLOY_SHA,mode:process.env.NODE_ENV}))',
    );
    const run = () =>
      execFileSync(process.execPath, [join(root, 'scripts/start-production.mjs')], {
        cwd: resolve('apps'),
        encoding: 'utf8',
        env: { PATH: process.env.PATH },
        stdio: ['ignore', 'pipe', 'pipe'],
      });
    expect(JSON.parse(run())).toEqual({
      cwd: await realpath(root),
      sha,
      mode: 'production',
    });
    await writeFile(join(root, '.release.env'), 'DEPLOY_SHA=wrong\n');
    expect(run).toThrow();
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
