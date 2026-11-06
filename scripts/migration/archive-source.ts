import { resolve, join, relative, sep } from 'node:path';
import { mkdir, readdir, readFile, writeFile, copyFile, stat } from 'node:fs/promises';
import { hash } from '../../apps/api/src/db.js';
const source = resolve(process.argv[2] ?? 'legacy'),
  destination = resolve(process.argv[3] ?? '.private/source-archive');
async function main() {
  if (
    process.env.REAL_MIGRATION_APPROVAL !== 'explicitly-approved-by-owner' &&
    !source.startsWith(resolve('tests/fixtures') + sep)
  )
    throw new Error('APPROVAL_REQUIRED');
  if (destination.startsWith(source + sep) || source === destination)
    throw new Error('RECURSIVE_DESTINATION');
  await mkdir(destination, { recursive: false, mode: 0o700 });
  const manifest: any[] = [];
  async function walk(dir: string) {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      if (entry.isSymbolicLink()) throw new Error('SOURCE_SYMLINK_REQUIRES_REVIEW');
      const full = join(dir, entry.name);
      if (entry.isDirectory()) await walk(full);
      else if (entry.isFile()) {
        const path = relative(source, full),
          dest = join(destination, path),
          bytes = await readFile(full);
        await mkdir(resolve(dest, '..'), { recursive: true, mode: 0o700 });
        await copyFile(full, dest);
        const after = await readFile(dest);
        if (hash(bytes) !== hash(after)) throw new Error('COPY_INTEGRITY');
        manifest.push({ path, size: (await stat(full)).size, sha256: hash(bytes) });
      }
    }
  }
  await walk(source);
  await writeFile(
    join(destination, 'manifest.json'),
    JSON.stringify({ version: 1, files: manifest }, null, 2),
    { mode: 0o600 },
  );
  console.info(JSON.stringify({ state: 'complete' }));
}
main().catch(() => {
  console.error(
    JSON.stringify({ state: 'failed', message: 'Archivace zastavena bez výpisu hodnot.' }),
  );
  process.exitCode = 1;
});
