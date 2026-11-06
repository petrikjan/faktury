import 'dotenv/config';
import { mkdir, readFile, writeFile, readdir, copyFile, mkdtemp, rm } from 'node:fs/promises';
import { resolve, join, relative, sep } from 'node:path';
import { tmpdir } from 'node:os';
import { spawn } from 'node:child_process';
import { createReadStream, createWriteStream } from 'node:fs';
import { pipeline } from 'node:stream/promises';
import { poolFor, rows, hash } from '../apps/api/src/db.js';
async function files(root: string): Promise<string[]> {
  const output: string[] = [];
  for (const item of await readdir(root, { withFileTypes: true })) {
    const full = join(root, item.name);
    if (item.isSymbolicLink()) throw new Error('SYMLINK');
    if (item.isDirectory()) output.push(...(await files(full)));
    else if (item.isFile()) output.push(full);
  }
  return output;
}
const mode = process.argv[2],
  dest = resolve(
    process.argv[3] ?? '.private/backups/' + new Date().toISOString().replace(/[:.]/g, '-'),
  );
async function main() {
  if (!process.argv.includes('--offline-confirm')) throw new Error('OFFLINE_CONFIRM_REQUIRED');
  const url = new URL(process.env.DATABASE_URL!),
    database = url.pathname.slice(1);
  if (!/^[a-zA-Z0-9_]+$/.test(database)) throw new Error('DB_NAME');
  const temp = await mkdtemp(join(tmpdir(), 'faktury-backup-'));
  const defaults = join(temp, 'client.cnf');
  const quote = (s: string) =>
    '"' + s.replaceAll('\\', '\\\\').replaceAll('"', '\\"').replaceAll('\n', '\\n') + '"';
  await writeFile(
    defaults,
    `[client]\nhost=${quote(url.hostname)}\nport=${url.port || 3306}\nuser=${quote(decodeURIComponent(url.username))}\npassword=${quote(decodeURIComponent(url.password))}\n`,
    { mode: 0o600 },
  );
  const binary = process.env.MARIADB_BIN_DIR ?? '';
  const run = async (name: string, args: string[], input?: string, output?: string) => {
    const child = spawn(
      binary ? join(binary, name) : name,
      ['--defaults-extra-file=' + defaults, ...args],
      { stdio: ['pipe', 'pipe', 'ignore'] },
    );
    const done = new Promise<void>((res, rej) => {
      child.once('error', rej);
      child.once('exit', (code) => (code === 0 ? res() : rej(new Error('DATABASE_TOOL_FAILED'))));
    });
    const streams = [];
    if (input) streams.push(pipeline(createReadStream(input), child.stdin));
    else child.stdin.end();
    if (output)
      streams.push(pipeline(child.stdout, createWriteStream(output, { mode: 0o600, flags: 'wx' })));
    else child.stdout.resume();
    await Promise.all([done, ...streams]);
  };
  try {
    if (mode === 'create') {
      await mkdir(resolve(dest, '..'), { recursive: true, mode: 0o700 });
      await mkdir(dest, { recursive: false, mode: 0o700 });
      const sql = join(dest, 'database.sql');
      await run(
        'mariadb-dump',
        ['--single-transaction', '--hex-blob', '--skip-comments', '--skip-lock-tables', database],
        undefined,
        sql,
      );
      const storage = resolve(process.env.STORAGE_DIR ?? '.private/storage'),
        manifest: any = { version: 1, database_sha256: hash(await readFile(sql)), files: [] };
      await mkdir(join(dest, 'files'), { mode: 0o700 });
      await mkdir(storage, { recursive: true, mode: 0o700 });
      for (const path of await files(storage)) {
        const name = relative(storage, path);
        const out = join(dest, 'files', name);
        await mkdir(resolve(out, '..'), { recursive: true, mode: 0o700 });
        await copyFile(path, out);
        manifest.files.push({ path: name, sha256: hash(await readFile(out)) });
      }
      const db = poolFor(process.env.DATABASE_URL!);
      try {
        for (const f of await rows(db, 'SELECT relative_path,sha256 FROM invoice_files')) {
          if (!manifest.files.some((b: any) => b.path === f.relative_path && b.sha256 === f.sha256))
            throw new Error('DB_FILE_MISMATCH');
        }
      } finally {
        await db.end();
      }
      await writeFile(join(dest, 'manifest.json'), JSON.stringify(manifest, null, 2), {
        mode: 0o600,
      });
    } else if (mode === 'restore') {
      if (process.env.NODE_ENV === 'production' || !database.endsWith('_restore_test'))
        throw new Error('FRESH_RESTORE_TEST_DATABASE_REQUIRED');
      const db = poolFor(process.env.DATABASE_URL!);
      try {
        if ((await rows(db, 'SHOW TABLES')).length) throw new Error('RESTORE_TARGET_NOT_EMPTY');
      } finally {
        await db.end();
      }
      const m = JSON.parse(await readFile(join(dest, 'manifest.json'), 'utf8')),
        sql = join(dest, 'database.sql');
      if (hash(await readFile(sql)) !== m.database_sha256) throw new Error('BACKUP_HASH');
      for (const f of m.files) {
        const source = resolve(dest, 'files', f.path);
        if (
          !source.startsWith(resolve(dest, 'files') + sep) ||
          hash(await readFile(source)) !== f.sha256
        )
          throw new Error('FILE_HASH');
      }
      await run('mariadb', [database], sql);
      const storage = resolve(process.env.STORAGE_DIR ?? '.private/restored-storage');
      await mkdir(storage, { recursive: true, mode: 0o700 });
      if ((await readdir(storage)).length) throw new Error('RESTORE_STORAGE_NOT_EMPTY');
      for (const f of m.files) {
        const out = resolve(storage, f.path);
        if (!out.startsWith(storage + sep)) throw new Error('PATH');
        await mkdir(resolve(out, '..'), { recursive: true, mode: 0o700 });
        await copyFile(resolve(dest, 'files', f.path), out);
        if (hash(await readFile(out)) !== f.sha256) throw new Error('RESTORE_FILE_HASH');
      }
    } else throw new Error('MODE');
    console.info(JSON.stringify({ state: 'complete', mode }));
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
}
main().catch((e) => {
  console.error(
    JSON.stringify({
      state: 'failed',
      code: /^[A-Z_]+$/.test(e.message) ? e.message : 'UNEXPECTED',
      message: 'Záloha/obnova byla zastavena; žádné hodnoty ani přístupy se nevypisují.',
    }),
  );
  process.exitCode = 1;
});
