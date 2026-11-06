import process from 'node:process';
import console from 'node:console';
import { spawn, execFileSync } from 'node:child_process';
import { mkdtemp, copyFile, mkdir, readFile, writeFile, open } from 'node:fs/promises';
import { join, dirname } from 'node:path';
const root = process.cwd(),
  destination = await mkdtemp('/private/tmp/faktury-clean-');
const files = execFileSync(
  'git',
  ['ls-files', '--cached', '--others', '--exclude-standard', '-z'],
  { encoding: 'utf8' },
)
  .split('\0')
  .filter(Boolean);
for (const file of files) {
  if (/^(legacy|\.private|node_modules|dist|\.git)\//.test(file) || file === '.env')
    throw new Error('PRIVATE_SOURCE_REJECTED');
  const target = join(destination, file);
  await mkdir(dirname(target), { recursive: true });
  await copyFile(join(root, file), target);
}
const local = JSON.parse(await readFile('.private/test-env.json', 'utf8'));
const env = {
  ...process.env,
  DATABASE_URL: local.DATABASE_URL,
  TEST_DATABASE_URL: local.DATABASE_URL,
  SOURCE_TEST_DATABASE_URL: local.SOURCE_TEST_DATABASE_URL,
  E2E_DATABASE_URL: local.E2E_DATABASE_URL,
};
delete env.NODE_ENV;
const log = await open('.private/clean-install.log', 'w', 0o600);
async function run(args) {
  await new Promise((res, rej) => {
    const child = spawn('npm', args, { cwd: destination, env, stdio: ['ignore', log.fd, log.fd] });
    child.once('error', rej);
    child.once('exit', (code) =>
      code === 0 ? res() : rej(new Error('CLEAN_VERIFICATION_FAILED')),
    );
  });
}
try {
  await run(['ci']);
  await run(['run', 'check']);
  await run(['run', 'test:e2e']);
  await writeFile(
    '.private/clean-verification.json',
    JSON.stringify({
      state: 'complete',
      without_legacy: true,
      files: files.length,
      node: process.version,
      path: destination,
    }),
  );
  console.info('Čistá instalace bez legacy: npm ci, kontroly, testy, build a E2E prošly.');
} catch {
  console.error('Ověření čisté kopie selhalo; lokální diagnostika zůstala soukromá.');
  process.exitCode = 1;
} finally {
  await log.close();
}
