import { readFile, writeFile, mkdir, readdir, copyFile } from 'node:fs/promises';
import { resolve, join, sep } from 'node:path';
import type { Pool } from 'mysql2/promise';
import { rows, exec, transaction, hash } from '../../apps/api/src/db.js';
import { canonical } from './importer.js';
const idTables = [
  'users',
  'customers',
  'supplier_profiles',
  'bank_accounts',
  'catalog_items',
  'invoices',
  'invoice_items',
  'invoice_files',
  'audit_events',
  'record_history',
  'migration_runs',
] as const;
const copyTables = [
  'users',
  'sessions',
  'customers',
  'supplier_profiles',
  'bank_accounts',
  'catalog_items',
  'invoices',
  'invoice_vat_adjustments',
  'invoice_items',
  'invoice_files',
  'legacy_metadata',
  'idempotency_keys',
  'audit_events',
  'app_settings',
  'revoked_mcp_tokens',
  'record_history',
  'delete_confirmations',
  'released_invoice_numbers',
] as const;
function localOnly(dbName: string) {
  if (!/^faktury(?:_[a-z0-9_]+)?$/.test(dbName)) throw new Error('LOCAL_DATABASE_REQUIRED');
}
/** Reserve the previous app's IDs before importing legacy data, so existing links and drafts keep their IDs. */
export async function reserveCurrentIds(source: Pool, target: Pool) {
  for (const db of [source, target])
    localOnly(String((await rows(db, 'SELECT DATABASE() name'))[0].name));
  for (const table of idTables) {
    if ((await rows(target, `SELECT 1 FROM ${table} LIMIT 1`)).length)
      throw new Error('EMPTY_LOCAL_TARGET_REQUIRED');
    const [{ maximum }] = await rows(
      source,
      `SELECT CAST(COALESCE(MAX(id),0) AS CHAR) maximum FROM ${table}`,
    );
    const next = (BigInt(maximum) + 1n).toString();
    await target.query(`ALTER TABLE ${table} AUTO_INCREMENT = ${next}`);
  }
}
export async function mergeLocalState(
  source: Pool,
  target: Pool,
  baseline: Pool,
  options: { sourceStorage: string; targetStorage: string; reportDir: string },
) {
  for (const db of [source, target])
    localOnly(String((await rows(db, 'SELECT DATABASE() name'))[0].name));
  const data: Record<string, any[]> = {};
  for (const table of copyTables) data[table] = await rows(source, `SELECT * FROM ${table}`);
  if ((await rows(source, 'SELECT 1 FROM migration_runs LIMIT 1')).length)
    throw new Error('CURRENT_APP_ALREADY_MIGRATED');
  const invoiceNumbers = new Set(
    (
      await rows(target, 'SELECT invoice_number FROM invoices WHERE invoice_number IS NOT NULL')
    ).map((r) => r.invoice_number),
  );
  if (data.invoices.some((i) => i.invoice_number !== null && invoiceNumbers.has(i.invoice_number)))
    throw new Error('CURRENT_INVOICE_NUMBER_CONFLICT');
  const usedCustomers = new Set(data.invoices.map((i) => String(i.customer_id))),
    usedBanks = new Set(data.invoices.map((i) => String(i.bank_account_id)));
  const selected: Record<string, any[]> = { ...data };
  for (const table of [
    'customers',
    'supplier_profiles',
    'bank_accounts',
    'catalog_items',
  ] as const) {
    const demo = new Map(
      (await rows(baseline, `SELECT * FROM ${table}`)).map((r) => [String(r.id), canonical(r)]),
    );
    selected[table] = data[table].filter(
      (row) =>
        demo.get(String(row.id)) !== canonical(row) ||
        (table === 'customers' && usedCustomers.has(String(row.id))) ||
        (table === 'bank_accounts' && usedBanks.has(String(row.id))),
    );
  }
  // Keep every non-demo row exactly, including users, password hashes, sessions, snapshots and audit timestamps.
  const retained: Record<string, number> = {};
  await transaction(target, async (tx) => {
    const oldMarker = await rows(
      tx,
      "SELECT 1 FROM app_settings WHERE setting_key='local_import_bridge'",
    );
    if (oldMarker.length) throw new Error('LOCAL_BRIDGE_ALREADY_APPLIED');
    for (const table of copyTables) {
      const columns = (await rows(source, `SHOW COLUMNS FROM ${table}`)).map((r) =>
        String(r.Field),
      );
      if (columns.some((c) => !/^\w+$/.test(c))) throw new Error('LOCAL_COLUMN_NAME');
      retained[table] = selected[table].length;
      for (const row of selected[table]) {
        await exec(
          tx,
          `INSERT INTO ${table} (${columns.map((c) => '`' + c + '`').join(',')}) VALUES (${columns.map(() => '?').join(',')})`,
          columns.map((c) =>
            typeof row[c] === 'object' && row[c] !== null && !Buffer.isBuffer(row[c])
              ? JSON.stringify(row[c])
              : row[c],
          ),
        );
        const primary =
          table === 'released_invoice_numbers'
            ? 'invoice_number'
            : table === 'sessions' || table === 'delete_confirmations'
              ? 'token_hash'
              : table === 'legacy_metadata' || table === 'invoice_vat_adjustments'
                ? 'invoice_id'
                : table === 'app_settings'
                  ? 'setting_key'
                  : table === 'revoked_mcp_tokens'
                    ? 'jti_hash'
                    : 'id';
        const check =
          table === 'idempotency_keys'
            ? await rows(tx, 'SELECT * FROM idempotency_keys WHERE actor_id=? AND request_key=?', [
                row.actor_id,
                row.request_key,
              ])
            : await rows(tx, `SELECT * FROM ${table} WHERE ${primary}=?`, [row[primary]]);
        if (check.length !== 1 || canonical(check[0]) !== canonical(row))
          throw new Error('LOCAL_ROW_COPY_MISMATCH');
      }
    }
    for (const sequence of await rows(source, 'SELECT * FROM invoice_sequences'))
      await exec(
        tx,
        'INSERT INTO invoice_sequences(year,last_value) VALUES(?,?) ON DUPLICATE KEY UPDATE last_value=GREATEST(last_value,VALUES(last_value))',
        [sequence.year, sequence.last_value],
      );
    const sourceRoot = resolve(options.sourceStorage),
      targetRoot = resolve(options.targetStorage);
    async function copyTree(dir: string) {
      for (const item of await readdir(dir, { withFileTypes: true }).catch((e) => {
        if (e.code === 'ENOENT') return [];
        throw e;
      })) {
        if (item.isSymbolicLink()) throw new Error('LOCAL_STORAGE_SYMLINK');
        const full = join(dir, item.name),
          relative = full.slice(sourceRoot.length + 1),
          destination = resolve(targetRoot, relative);
        if (!destination.startsWith(targetRoot + sep)) throw new Error('LOCAL_STORAGE_PATH');
        if (item.isDirectory()) {
          await copyTree(full);
          continue;
        }
        if (!item.isFile()) throw new Error('LOCAL_STORAGE_TYPE');
        const bytes = await readFile(full);
        await mkdir(resolve(destination, '..'), { recursive: true, mode: 0o700 });
        try {
          if (hash(await readFile(destination)) !== hash(bytes))
            throw new Error('LOCAL_FILE_CONFLICT');
        } catch (e) {
          if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e;
          await copyFile(full, destination);
        }
      }
    }
    await copyTree(sourceRoot);
    for (const file of selected.invoice_files) {
      const path = resolve(targetRoot, file.relative_path);
      if (!path.startsWith(targetRoot + sep) || hash(await readFile(path)) !== file.sha256)
        throw new Error('LOCAL_FILE_COPY_MISMATCH');
    }
    await exec(
      tx,
      "INSERT INTO app_settings(setting_key,value_json) VALUES('local_import_bridge',?)",
      [JSON.stringify({ state: 'complete', created_at: new Date().toISOString(), retained })],
    );
  });
  await mkdir(options.reportDir, { recursive: true, mode: 0o700 });
  await writeFile(
    join(options.reportDir, 'previous-app-preservation.json'),
    JSON.stringify({ state: 'complete', retained }, null, 2),
    { mode: 0o600 },
  );
  return { state: 'complete' as const };
}
