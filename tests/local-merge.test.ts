import { beforeAll, beforeEach, afterAll, it, expect } from 'vitest';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { config } from '../apps/api/src/config.js';
import { poolFor, rows, exec, hash } from '../apps/api/src/db.js';
import { migrate, seed } from '../scripts/db.js';
import { clear } from './helpers.js';
import { importLegacy, verifyLegacy } from '../scripts/migration/importer.js';
import { reserveCurrentIds, mergeLocalState } from '../scripts/migration/merge-local.js';

function testUrl(name: string) {
  const url = new URL(config.DATABASE_URL);
  url.pathname = '/' + name;
  return url.toString();
}
const source = poolFor(
  process.env.LOCAL_MERGE_SOURCE_TEST_URL ?? testUrl('faktury_merge_source_test'),
);
const baseline = poolFor(
  process.env.LOCAL_MERGE_BASELINE_TEST_URL ?? testUrl('faktury_merge_baseline_test'),
);
const target = poolFor(config.DATABASE_URL);
const pdf = Buffer.from('%PDF-1.4 SYNTHETIC CURRENT FILE\n');
let options: { sourceStorage: string; targetStorage: string; reportDir: string };
let imported: any;
let fixture: any;
beforeAll(async () => {
  for (const db of [source, baseline, target]) {
    const [r] = await rows(db, 'SELECT DATABASE() name');
    if (!r.name.endsWith('_test')) throw new Error('TEST_DB_ONLY');
    await migrate(db);
  }
  fixture = JSON.parse(await readFile('tests/fixtures/legacy.json', 'utf8'));
});
beforeEach(async () => {
  for (const db of [source, baseline, target]) await clear(db);
  await seed(source);
  await seed(baseline);
  const dir = resolve('.private/local-merge-tests', randomUUID());
  options = {
    sourceStorage: dir + '/old',
    targetStorage: dir + '/new',
    reportDir: dir + '/report',
  };
  await mkdir(options.sourceStorage + '/generated', { recursive: true });
  await writeFile(options.sourceStorage + '/generated/current.pdf', pdf);
  await exec(
    source,
    "INSERT INTO users(id,username,password_hash) VALUES(1,'synthetic-admin','SYNTHETIC_HASH')",
  );
  await exec(source, 'INSERT INTO sessions VALUES(?,?,?,?)', [
    'a'.repeat(64),
    1,
    'b'.repeat(64),
    '2027-01-01',
  ]);
  await exec(
    source,
    "UPDATE customers SET company='Upravený syntetický kontakt', version=2 WHERE id=3",
  );
  await exec(
    source,
    `INSERT INTO invoices(id,customer_id,issue_date,tax_date,due_date,due_days,currency,bank_account_id,snapshot,net,vat,gross)
    VALUES(1,2,'2026-01-01','2026-01-01','2026-01-15',14,'CZK',1,'{}',100,21,121)`,
  );
  await exec(
    source,
    "INSERT INTO invoice_items(invoice_id,position,description,unit,price,quantity,vat_rate,net,vat,gross) VALUES(1,0,'Původní koncept','hod',100,1,21,100,21,121)",
  );
  await exec(
    source,
    "INSERT INTO invoice_files(invoice_id,kind,relative_path,sha256,template_version) VALUES(1,'generated',?,?,'synthetic')",
    ['generated/current.pdf', hash(pdf)],
  );
  await exec(source, "INSERT INTO idempotency_keys VALUES(1,'synthetic-request',?,1)", [
    'c'.repeat(64),
  ]);
  await exec(
    source,
    "INSERT INTO audit_events(actor_id,action,entity_type,entity_id) VALUES(1,'synthetic','invoice','1')",
  );
  imported = {
    sourceId: 'synthetic-' + randomUUID(),
    sourceTimezone: 'Europe/Prague',
    archiveDir: dir + '/archive',
    storageDir: options.targetStorage,
  };
  await reserveCurrentIds(source, target);
  await importLegacy(target, fixture, imported);
});
afterAll(async () => {
  for (const db of [source, baseline, target]) await db.end();
});

it('zachová současné účty, relace, koncepty, odkazy a PDF bez kolizí s importem', async () => {
  const old = (await rows(source, 'SELECT * FROM invoices WHERE id=1'))[0];
  await mergeLocalState(source, target, baseline, options);
  expect((await rows(target, 'SELECT * FROM invoices WHERE id=1'))[0]).toEqual(old);
  expect(await rows(target, 'SELECT * FROM sessions')).toEqual(
    await rows(source, 'SELECT * FROM sessions'),
  );
  expect(await rows(target, 'SELECT * FROM idempotency_keys')).toEqual(
    await rows(source, 'SELECT * FROM idempotency_keys'),
  );
  expect((await rows(target, 'SELECT * FROM customers WHERE id=1')).length).toBe(0);
  expect((await rows(target, 'SELECT * FROM customers WHERE id IN(2,3)')).length).toBe(2);
  expect(
    BigInt(
      (
        await rows(target, 'SELECT MIN(id) id FROM customers WHERE legacy_contact_id IS NOT NULL')
      )[0].id,
    ),
  ).toBeGreaterThan(3n);
  expect(await readFile(options.targetStorage + '/generated/current.pdf')).toEqual(pdf);
  expect((await verifyLegacy(target, fixture, imported)).issues).toEqual([]);
  await expect(mergeLocalState(source, target, baseline, options)).rejects.toThrow(
    'LOCAL_BRIDGE_ALREADY_APPLIED',
  );
});

it('odmítne duplicitní číslo dokladu před kopírováním a nic nepřepíše', async () => {
  const [{ invoice_number }] = await rows(
    target,
    'SELECT invoice_number FROM invoices WHERE invoice_number IS NOT NULL LIMIT 1',
  );
  await exec(source, "UPDATE invoices SET invoice_number=?,status='issued' WHERE id=1", [
    invoice_number,
  ]);
  await expect(mergeLocalState(source, target, baseline, options)).rejects.toThrow(
    'CURRENT_INVOICE_NUMBER_CONFLICT',
  );
  expect((await rows(target, 'SELECT * FROM users')).length).toBe(0);
});
