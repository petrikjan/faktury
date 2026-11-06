import 'dotenv/config';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { randomBytes, randomUUID } from 'node:crypto';
import argon2 from 'argon2';
import { poolFor, exec, rows } from '../apps/api/src/db.js';
import { migrate, seed } from '../scripts/db.js';
import { clear } from './helpers.js';
const local = JSON.parse(
  await readFile('.private/test-env.json', 'utf8').catch(() => '{"DATABASE_URL":""}'),
);
process.env.DATABASE_URL = process.env.E2E_DATABASE_URL ?? local.E2E_DATABASE_URL;
process.env.NODE_ENV = 'test';
process.env.APP_ORIGIN = 'http://127.0.0.1:3199';
process.env.STORAGE_DIR = '.private/e2e-storage';
if (!new URL(process.env.DATABASE_URL!).pathname.endsWith('_test')) throw new Error('TEST_DB_ONLY');
const { buildApp } = await import('../apps/api/src/app.js');
const service = await import('../apps/api/src/services.js');
const db = poolFor(process.env.DATABASE_URL!);
await migrate(db);
await clear(db);
await seed(db);
const password = randomBytes(24).toString('base64url');
await exec(db, 'INSERT INTO users(username,password_hash) VALUES(?,?)', [
  'synthetic-owner',
  await argon2.hash(password, { type: argon2.argon2id }),
]);
const actor = String((await rows(db, 'SELECT id FROM users'))[0].id);
await mkdir('.private', { recursive: true });
await writeFile(
  '.private/e2e-login.json',
  JSON.stringify({ username: 'synthetic-owner', password }),
  { mode: 0o600 },
);
for (let n = 0; n < 7; n++) {
  const issue_date = '2026-' + String(n + 1).padStart(2, '0') + '-12';
  const d = await service.saveDraft(db, actor, randomUUID(), {
    customer_id: n % 2 ? '2' : '3',
    issue_date,
    tax_date: issue_date,
    due_date: issue_date.slice(0, 8) + '26',
    currency: 'CZK',
    bank_account_id: n % 2 ? '1' : '2',
    items: [
      {
        description: 'Syntetická kreativní služba',
        price: String(1500 + n * 750),
        quantity: '2',
        vat_rate: '21',
        unit: 'hod',
      },
    ],
  });
  await service.issue(db, actor, d.id, async () => ({
    path: 'synthetic-' + randomUUID() + '.pdf',
    sha256: '0'.repeat(64),
    version: 'synthetic-ui-test',
  }));
  if (n < 4) await service.payment(db, actor, d.id, true, null);
  else await service.payment(db, actor, d.id, false, null);
  if (n === 0) await exec(db, 'DELETE FROM invoice_files WHERE invoice_id=?', [d.id]);
}
const app = await buildApp(db, { staticRoot: resolve('dist/web'), testRateLimitMax: 1000 });
await app.listen({ host: '127.0.0.1', port: 3199 });
for (const signal of ['SIGINT', 'SIGTERM'])
  process.on(signal, async () => {
    await app.close();
    await db.end();
    process.exit(0);
  });
