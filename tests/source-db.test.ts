import { it, expect } from 'vitest';
import { readFile } from 'node:fs/promises';
import { poolFor, rows, exec } from '../apps/api/src/db.js';
import { config } from '../apps/api/src/config.js';
import { validateSource, importLegacy, verifyLegacy } from '../scripts/migration/importer.js';
import { migrate } from '../scripts/db.js';
import { clear } from './helpers.js';
import type { LegacyData } from '../scripts/migration/dump.js';
import { randomUUID } from 'node:crypto';
it('migruje ze skutečné MariaDB se zdrojovým DDL včetně utf8mb3/latin1 sloupců', async () => {
  const local = JSON.parse(await readFile('.private/test-env.json', 'utf8').catch(() => '{ }'));
  const sourceUrl =
    process.env.SOURCE_TEST_DATABASE_URL ??
    local.SOURCE_TEST_DATABASE_URL ??
    config.DATABASE_URL.replace(/\/[^/]+$/, '/faktury_source_test');
  if (!new URL(sourceUrl).pathname.endsWith('_source_test')) throw new Error('SOURCE_TEST_ONLY');
  const source = poolFor(sourceUrl),
    target = poolFor(config.DATABASE_URL);
  const tx = await source.getConnection();
  try {
    await tx.query("SET SESSION sql_mode=CONCAT(@@sql_mode,',NO_AUTO_VALUE_ON_ZERO')");
    await tx.query('SET FOREIGN_KEY_CHECKS=0');
    const previous = await rows(tx, 'SHOW TABLES');
    for (const t of previous) {
      const name = String(Object.values(t)[0]);
      if (!/^bbs_[\p{L}\p{N}_]+$/u.test(name)) throw new Error('SOURCE_TABLE');
      await tx.query('DROP TABLE `' + name + '`');
    }
    const ddl = await readFile('tests/fixtures/legacy-schema.sql', 'utf8');
    for (const statement of ddl
      .replace(/^--.*$/gm, '')
      .split(';')
      .map((s) => s.trim())
      .filter(Boolean))
      await tx.query(statement);
    const fixture: LegacyData = JSON.parse(await readFile('tests/fixtures/legacy.json', 'utf8'));
    fixture.tables.bbs_contacts[2].payment_id = 'é';
    for (const table of fixture.schema) {
      for (const row of fixture.tables[table.table]) {
        const cols = Object.keys(row);
        const vals = cols.map((c) => {
          const type = table.columns.find((x) => x.column === c)!.type;
          const v = row[c];
          if (v === '0' && /date|timestamp/.test(type))
            return /datetime|timestamp/.test(type) ? '2026-01-01 12:00:00' : '2026-01-01';
          return v;
        });
        await exec(
          tx,
          'INSERT INTO `' +
            table.table +
            '` (' +
            cols.map((c) => '`' + c + '`').join(',') +
            ') VALUES(' +
            cols.map(() => '?').join(',') +
            ')',
          vals,
        );
      }
    }
    const data: LegacyData = { schema: fixture.schema, tables: {} };
    for (const table of fixture.schema)
      data.tables[table.table] = await rows(
        tx,
        'SELECT ' +
          table.columns
            .map((c) => 'CAST(`' + c.column + '` AS CHAR) AS `' + c.column + '`')
            .join(',') +
          ' FROM `' +
          table.table +
          '`',
      );
    expect(data.tables.bbs_contacts[2].payment_id).toBe('é');
    expect(data.tables.bbs_contacts[1].company).toContain('Žluťoučká');
    expect(validateSource(data).issues.some((i) => i.code === 'MISSING_CONTACT')).toBe(false);
    await migrate(target);
    await clear(target);
    const o = {
      sourceId: 'source-db-' + randomUUID(),
      sourceTimezone: 'Europe/Prague',
      archiveDir: '.private/source-db-archives',
      storageDir: '.private/source-db-files',
    };
    expect((await importLegacy(target, data, o)).state).toBe('complete');
    expect((await verifyLegacy(target, data, o)).state).toBe('complete');
  } finally {
    await tx.query('SET FOREIGN_KEY_CHECKS=1');
    tx.release();
    await source.end();
    await target.end();
  }
});
