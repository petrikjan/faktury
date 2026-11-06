import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import process from 'node:process';
import console from 'node:console';

try {
  // aaPanel's Git checkout and the running release have separate directories.
  const root = dirname(dirname(fileURLToPath(import.meta.url)));
  process.chdir(root);
  process.loadEnvFile(resolve(root, '.env'));
  const release = /^DEPLOY_SHA=([a-f0-9]{40})\n?$/.exec(
    readFileSync(resolve(root, '.release.env'), 'utf8'),
  );
  if (!release) throw new Error('INVALID_RELEASE');
  process.env.DEPLOY_SHA = release[1];
  process.env.NODE_ENV = 'production';
  await import('../dist/api/main.js');
} catch {
  console.error('Produkční start selhal. Zkontrolujte soukromou konfiguraci a sestavení.');
  process.exitCode = 1;
}
