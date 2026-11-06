import { beforeAll, beforeEach, afterAll, it, expect } from 'vitest';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { config } from '../apps/api/src/config.js';
import { poolFor, rows, exec, hash } from '../apps/api/src/db.js';
import { migrate } from '../scripts/db.js';
import { clear } from './helpers.js';
import { importLegacy, verifyLegacy, validateSource } from '../scripts/migration/importer.js';
import { parseDump, type LegacyData } from '../scripts/migration/dump.js';
const db = poolFor(config.DATABASE_URL);
let fixture: LegacyData;
let options: any;
beforeAll(async () => {
  await migrate(db);
  fixture = JSON.parse(await readFile('tests/fixtures/legacy.json', 'utf8'));
});
beforeEach(async () => {
  await clear(db);
  options = {
    sourceId: 'synthetic-' + randomUUID(),
    archiveDir: resolve('.private/test-migrations'),
    storageDir: config.STORAGE_DIR,
    pdfDir: resolve('.private/test-pdf'),
    sourceTimezone: 'Europe/Prague',
  };
  await mkdir(options.pdfDir, { recursive: true });
  await writeFile(options.pdfDir + '/20260001.pdf', Buffer.from('%PDF-1.4 SYNTHETIC ORIGINAL\n'));
});
afterAll(async () => {
  await db.end();
});
it('importuje každou fakturu i položku, zachová NULL/prázdno, diakritiku, FLOAT originál a vazby', async () => {
  const r = await importLegacy(db, fixture, options);
  expect(r.state).toBe('complete');
  expect((await verifyLegacy(db, fixture, options)).issues).toEqual([]);
  const invoices = await rows(db, 'SELECT * FROM invoices ORDER BY legacy_invoice_id');
  expect(invoices.map((i) => i.invoice_number)).toContain('9007199254740993');
  expect(invoices.every((i) => i.vat === null && i.gross === null && i.payment_date === null)).toBe(
    true,
  );
  const customers = await rows(db, 'SELECT * FROM customers ORDER BY legacy_contact_id');
  expect(customers[0].payment_id).toBeNull();
  expect(customers[1].payment_id).toBe('');
  expect(customers[1].zip).toBe('00123');
  expect(customers[1].company).toContain('Žluťoučká');
  const item = (await rows(db, 'SELECT * FROM invoice_items WHERE legacy_item_id=2'))[0];
  expect(item.legacy_product_id).toBe('99');
  expect(item.description.length).toBe(fixture.tables.bbs_invoices_details[1].description!.length);
  const difference = invoices.find((i) => i.invoice_number === '9007199254740993');
  expect(difference.original_net).toBe('0.300000012');
  expect(difference.difference).toBe('-0.0000000120');
  const meta = (
    await rows(db, 'SELECT data_json FROM legacy_metadata WHERE invoice_id=?', [invoices[1].id])
  )[0];
  expect(JSON.stringify(meta)).toContain('related_purchase_ids');
});
it('opakuje se bez duplicit a dokončí přerušenou dávku', async () => {
  await expect(importLegacy(db, fixture, { ...options, failAfter: 1 })).rejects.toThrow(
    'SYNTHETIC_INTERRUPTION',
  );
  expect((await rows(db, 'SELECT * FROM invoices')).length).toBe(1);
  await importLegacy(db, fixture, options);
  await importLegacy(db, fixture, options);
  expect((await rows(db, 'SELECT * FROM invoices')).length).toBe(3);
  expect((await rows(db, 'SELECT * FROM invoice_items')).length).toBe(3);
});
it('odmítne změnu zdroje a poškození cíle místo přepsání', async () => {
  await importLegacy(db, fixture, options);
  const changed = structuredClone(fixture);
  changed.tables.bbs_contacts[1].company = 'Změněný syntetický zdroj';
  await expect(importLegacy(db, changed, options)).rejects.toThrow('CONTENT_CONFLICT');
  await exec(db, "UPDATE invoice_items SET description='Změněný cíl' WHERE legacy_item_id=2");
  expect(
    (await verifyLegacy(db, fixture, options)).issues.some(
      (i) => i.code === 'ROW_CONTENT_MISMATCH',
    ),
  ).toBe(true);
  await expect(importLegacy(db, fixture, options)).rejects.toThrow('TARGET_CONFLICT');
});
it('detekuje sirotky, duplicity a chybějící vazbu produktu', () => {
  for (const mutate of [
    (f: LegacyData) => (f.tables.bbs_invoices_details[0].invoice_id = '99'),
    (f: LegacyData) => (f.tables.bbs_invoices[1].invoice_id = f.tables.bbs_invoices[0].invoice_id),
    (f: LegacyData) => (f.tables.bbs_invoices_details[1].product_id = '666'),
  ]) {
    const changed = structuredClone(fixture);
    mutate(changed);
    expect(validateSource(changed).issues.length).toBeGreaterThan(0);
  }
});
it('uchová původní PDF bitově a validátor odhalí jeho změnu', async () => {
  await importLegacy(db, fixture, options);
  const [file] = await rows(db, "SELECT * FROM invoice_files WHERE kind='original'");
  const original = await readFile(options.pdfDir + '/20260001.pdf');
  expect(hash(await readFile(resolve(options.storageDir, file.relative_path)))).toBe(
    hash(original),
  );
  await writeFile(resolve(options.storageDir, file.relative_path), 'CORRUPTED SYNTHETIC PDF');
  expect(
    (await verifyLegacy(db, fixture, options)).issues.some((i) => i.code === 'FILE_INTEGRITY'),
  ).toBe(true);
});
it('neznámý příznak úhrady zachová jako výjimku bez vymyšleného data', async () => {
  const f = structuredClone(fixture);
  f.tables.bbs_invoices[0].payed = '2';
  const r = await importLegacy(db, f, options);
  expect(r.issues.some((i) => i.code === 'UNKNOWN_PAID_FLAG')).toBe(true);
  expect(
    (
      await rows(
        db,
        "SELECT payment_status,payment_date FROM invoices WHERE legacy_invoice_id='11'",
      )
    )[0],
  ).toMatchObject({ payment_status: 'unknown', payment_date: null });
});
it('parser nikdy nespouští SQL a nepoškodí apostrof, nové řádky ani BIGINT', () => {
  const s =
    "CREATE TABLE `bbs_test` (\n`id` bigint NOT NULL,\n`name` text NOT NULL\n) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3;\nINSERT INTO `bbs_test` (`id`,`name`) VALUES (9007199254740993,'Žluťoučký \\'test\\'\\n-- stále text; /* text */'),(2,'');";
  const d = parseDump(s);
  expect(d.tables.bbs_test[0].id).toBe('9007199254740993');
  expect(d.tables.bbs_test[0].name).toBe("Žluťoučký 'test'\n-- stále text; /* text */");
  expect(d.tables.bbs_test[1].name).toBe('');
  expect(() => parseDump(s + ' DROP DATABASE production;')).toThrow('UNEXPECTED_SQL_OPERATION');
  expect(() => parseDump(s + " SELECT 1 INTO OUTFILE '/tmp/a';")).toThrow(
    'UNEXPECTED_SQL_OPERATION',
  );
});

it('zpracuje komentářové SET hlavičky a prázdné středníky, ale odmítne skryté operace', () => {
  const ddl =
    'CREATE TABLE `bbs_test` (\n`id` int NOT NULL,\n`name` text NOT NULL\n) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3;';
  const source =
    '/*!40101 SET NAMES utf8mb4 */;\n/* harmless */;\n' +
    ddl +
    "INSERT INTO `bbs_test` (`id`,`name`) VALUES (1,'Syntetická položka');";
  expect(parseDump(source).tables.bbs_test[0].name).toBe('Syntetická položka');
  expect(() =>
    parseDump('/*!50003 CREATE TRIGGER hidden BEFORE INSERT ON x FOR EACH ROW SET @x=1 */;' + ddl),
  ).toThrow('UNEXPECTED_EXECUTABLE_COMMENT');
});
