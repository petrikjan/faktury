import { readFile, writeFile, mkdir, copyFile, stat } from 'node:fs/promises';
import { resolve, join, sep } from 'node:path';
import type { Pool } from 'mysql2/promise';
import { Decimal, addDays, dateInput } from '../../packages/domain/index.js';
import { rows, exec, transaction, json, hash, type Db } from '../../apps/api/src/db.js';
import type { LegacyData, LegacyRow } from './dump.js';
import type { LegacyTemplateText } from './template-text.js';
import constraints from '../../docs/legacy-constraints.json' with { type: 'json' };
export const IMPORTER_VERSION = '1.0.0';
export interface ImportOptions {
  sourceId: string;
  archiveDir: string;
  storageDir: string;
  pdfDir?: string;
  sourceTimezone: string;
  sourceDump?: string;
  failAfter?: number;
  templateText?: LegacyTemplateText;
}
export interface PrivateReport {
  issues: { code: string; table: string; id: string }[];
  counts: Record<string, number>;
  state: string;
}
export const canonical = (v: any): string =>
  JSON.stringify(v, (_k, value) =>
    value && typeof value === 'object' && !Array.isArray(value)
      ? Object.fromEntries(
          Object.keys(value)
            .sort()
            .map((k) => [k, value[k]]),
        )
      : value,
  );
const fingerprint = (v: any) => hash(canonical(v));
const sourceRows = (d: LegacyData, t: string) => d.tables[t] ?? [];
function primary(data: LegacyData, table: string) {
  const preferred: Record<string, string> = {
    bbs_invoices: 'id',
    bbs_invoices_details: 'id',
    bbs_contacts: 'id',
    bbs_settings: 'uniq_id',
    bbs_currencies: 'cur_id',
    bbs_products: 'prod_id',
    bbs_credit_orders: 'id',
    bbs_purchase: 'pur_id',
  };
  return preferred[table] ?? data.schema.find((t) => t.table === table)?.columns[0]?.column ?? 'id';
}
export function validateSource(d: LegacyData): PrivateReport {
  const report: PrivateReport = {
    issues: [],
    counts: Object.fromEntries(Object.entries(d.tables).map(([t, r]) => [t, r.length])),
    state: 'checked',
  };
  const issue = (code: string, table: string, id: string) =>
    report.issues.push({ code, table, id });
  for (const [t, r] of Object.entries(d.tables)) {
    const seen = new Set();
    for (const row of r) {
      const p = row[primary(d, t)];
      if (p === null || p === undefined || seen.has(p))
        issue('DUPLICATE_OR_MISSING_SOURCE_ID', t, String(p ?? ''));
      seen.add(p);
    }
  }
  for (const constraint of constraints) {
    for (const match of constraint.definition.matchAll(
      /FOREIGN KEY \(`([^`]+)`\) REFERENCES `([^`]+)` \(`([^`]+)`\)/g,
    )) {
      const [, column, target, key] = match;
      const referenced = new Set(sourceRows(d, target).map((row) => row[key]));
      for (const row of sourceRows(d, constraint.table))
        if (row[column] !== null && !referenced.has(row[column]))
          issue('SOURCE_FK_MISSING', constraint.table, row[primary(d, constraint.table)] ?? '');
    }
  }
  const inv = sourceRows(d, 'bbs_invoices'),
    contacts = new Set(sourceRows(d, 'bbs_contacts').map((c) => c.id)),
    currencies = new Map(sourceRows(d, 'bbs_currencies').map((c) => [c.cur_id, c.cur_code])),
    products = new Set(sourceRows(d, 'bbs_products').map((p) => p.prod_id));
  const numbers = new Set<string>();
  for (const i of inv) {
    const key = i.id!;
    if (!/^\d{1,20}$/.test(i.invoice_id ?? '') || numbers.has(i.invoice_id!))
      issue('DUPLICATE_OR_INVALID_INVOICE_NUMBER', 'bbs_invoices', key);
    numbers.add(i.invoice_id!);
    if (!contacts.has(i.contact_id)) issue('MISSING_CONTACT', 'bbs_invoices', key);
    if (!currencies.has(i.currency_id)) issue('MISSING_CURRENCY', 'bbs_invoices', key);
    if (
      !/^\d{4}-\d\d-\d\d (?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d$/.test(i.created ?? '') ||
      !dateInput.safeParse((i.created ?? '').slice(0, 10)).success
    )
      issue('INVALID_TIMESTAMP', 'bbs_invoices', key);
    if (!['0', '1'].includes(i.payed!)) issue('UNKNOWN_PAID_FLAG', 'bbs_invoices', key);
    if (!['0', '1'].includes(i.alto!)) issue('UNKNOWN_BANK_FLAG', 'bbs_invoices', key);
    if (currencies.get(i.currency_id) !== 'CZK')
      issue('LEGACY_TEMPLATE_CURRENCY_MISMATCH', 'bbs_invoices', key);
    try {
      if (!new Decimal(i.total!).isFinite()) throw new Error();
    } catch {
      issue('INVALID_TOTAL', 'bbs_invoices', key);
    }
  }
  for (const r of sourceRows(d, 'bbs_invoices_details')) {
    if (!numbers.has(r.invoice_id!)) issue('ORPHAN_ITEM', 'bbs_invoices_details', r.id!);
    if (r.product_id !== null && !products.has(r.product_id))
      issue('MISSING_PRODUCT', 'bbs_invoices_details', r.id!);
    try {
      if (!new Decimal(r.price!).isFinite() || !new Decimal(r.amount!).isFinite())
        throw new Error();
    } catch {
      issue('INVALID_ITEM_DECIMAL', 'bbs_invoices_details', r.id!);
    }
  }
  for (const [table, column] of [
    ['bbs_credit_orders', 'invoice_id'],
    ['bbs_purchase', 'pur_invoice_id'],
  ])
    for (const r of sourceRows(d, table))
      if (r[column] !== null && !numbers.has(r[column]!))
        issue('ARCHIVE_INVOICE_REFERENCE_MISSING', table, r[primary(d, table)]!);
  return report;
}
const blocking = new Set([
  'DUPLICATE_OR_MISSING_SOURCE_ID',
  'DUPLICATE_OR_INVALID_INVOICE_NUMBER',
  'MISSING_CONTACT',
  'MISSING_CURRENCY',
  'INVALID_TIMESTAMP',
  'INVALID_TOTAL',
  'ORPHAN_ITEM',
  'MISSING_PRODUCT',
  'INVALID_ITEM_DECIMAL',
  'UNKNOWN_BANK_FLAG',
  'ARCHIVE_INVOICE_REFERENCE_MISSING',
  'SOURCE_FK_MISSING',
]);
async function getTarget(db: Db, table: string, id: string) {
  if (
    !['customers', 'invoices', 'invoice_items', 'supplier_profiles', 'bank_accounts'].includes(
      table,
    )
  )
    throw new Error('TARGET_TABLE');
  const [r] = await rows(db, `SELECT * FROM ${table} WHERE id=?`, [id]);
  return r;
}
async function remember(
  db: Db,
  o: ImportOptions,
  table: string,
  source: LegacyRow,
  targetTable: string,
  targetId: string,
  key = 'id',
) {
  const target = await getTarget(db, targetTable, targetId);
  await exec(
    db,
    'INSERT INTO legacy_id_map(source_id,source_table,source_id_value,target_table,target_id,source_hash,target_hash) VALUES(?,?,?,?,?,?,?)',
    [
      o.sourceId,
      table,
      source[key]!,
      targetTable,
      targetId,
      fingerprint(source),
      fingerprint(target),
    ],
  );
}
async function existing(db: Db, o: ImportOptions, table: string, row: LegacyRow, key = 'id') {
  const [map] = await rows(
    db,
    'SELECT * FROM legacy_id_map WHERE source_id=? AND source_table=? AND source_id_value=?',
    [o.sourceId, table, row[key]!],
  );
  if (!map) return null;
  if (map.source_hash !== fingerprint(row)) throw new Error('SOURCE_CONFLICT');
  const target = await getTarget(db, map.target_table, map.target_id);
  if (!target || map.target_hash !== fingerprint(target)) throw new Error('TARGET_CONFLICT');
  return String(map.target_id);
}
const lastId = async (db: Db) =>
  (await rows(db, 'SELECT CAST(LAST_INSERT_ID() AS CHAR) id'))[0].id as string;
async function setup(db: Pool, d: LegacyData, o: ImportOptions) {
  return transaction(db, async (tx) => {
    const settings = new Map(sourceRows(d, 'bbs_settings').map((s) => [s.key_text, s.value_text]));
    const val = (k: string) => settings.get(k) ?? '';
    const supplierSource: LegacyRow = {
      id: 'supplier',
      ...(o.templateText
        ? {
            template_website: o.templateText.website,
            template_footer: o.templateText.footer,
            template_footer_left: o.templateText.footer_left,
          }
        : {}),
      ...(Object.fromEntries(
        [...settings].filter(([k]) =>
          [
            'vat',
            'siteauthor_text',
            'invoiceaddress_text',
            'invoicecity_text',
            'invoicecountry_text',
            'invoicezip_text',
            'invoicestoreid_text',
            'invoicestorevat_text',
            'sitephone_text',
            'siteemail_text',
          ].includes(k!),
        ),
      ) as LegacyRow),
    };
    let supplierId = await existing(tx, o, 'derived_supplier', supplierSource);
    if (!supplierId) {
      const [{ n }] = await rows(tx, 'SELECT COUNT(*) n FROM supplier_profiles');
      if (Number(n)) throw new Error('NONEMPTY_TARGET_SUPPLIER');
      const supplier = {
        company: val('siteauthor_text'),
        street: val('invoiceaddress_text'),
        city: val('invoicecity_text'),
        zip: val('invoicezip_text'),
        country: val('invoicecountry_text'),
        ico: val('invoicestoreid_text'),
        dic: val('invoicestorevat_text'),
        phone: val('sitephone_text'),
        email: val('siteemail_text'),
        website: o.templateText?.website ?? '',
        footer: o.templateText?.footer ?? '',
        ...(o.templateText ? { footer_left: o.templateText.footer_left } : {}),
      };
      await exec(tx, 'INSERT INTO supplier_profiles(data_json,vat_rate) VALUES(?,?)', [
        JSON.stringify(supplier),
        val('vat') || '0',
      ]);
      supplierId = await lastId(tx);
      await remember(tx, o, 'derived_supplier', supplierSource, 'supplier_profiles', supplierId);
    }
    const banks: Record<string, string> = {};
    for (const variant of ['standard', 'alto']) {
      const suffix = variant === 'alto' ? '_alto_text' : '_text';
      const source = {
        id: variant,
        account_number: val('invoicebankaccountnumber' + suffix),
        bank_code: val('invoicebankcode' + suffix),
      };
      let bankId = await existing(tx, o, 'derived_bank', source);
      if (!bankId) {
        await exec(
          tx,
          'INSERT INTO bank_accounts(label,account_number,bank_code,variant) VALUES(?,?,?,?)',
          [variant, source.account_number, source.bank_code, variant],
        );
        bankId = await lastId(tx);
        await remember(tx, o, 'derived_bank', source, 'bank_accounts', bankId);
      }
      banks[variant] = bankId;
    }
    for (const c of sourceRows(d, 'bbs_contacts')) {
      if (await existing(tx, o, 'bbs_contacts', c)) continue;
      await exec(
        tx,
        'INSERT INTO customers(legacy_contact_id,company,street,street_number,city,zip,country,ico,dic,payment_id,end_customer) VALUES(?,?,?,?,?,?,?,?,?,?,?)',
        [
          c.id,
          c.company,
          c.street,
          c.street_number,
          c.city,
          c.zip,
          c.country,
          c.ico,
          c.dic,
          c.payment_id,
          c.id === '1',
        ],
      );
      const target = await lastId(tx);
      await remember(tx, o, 'bbs_contacts', c, 'customers', target);
    }
    return { banks, supplierId };
  });
}
async function writeOnce(path: string, bytes: string | Buffer) {
  try {
    const previous = await readFile(path);
    if (hash(previous) !== hash(bytes)) throw new Error('ARCHIVE_CONTENT_CONFLICT');
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT')
      await writeFile(path, bytes, { mode: 0o600, flag: 'wx' });
    else throw e;
  }
}
async function archive(d: LegacyData, o: ImportOptions) {
  const dir = join(o.archiveDir, o.sourceId);
  await mkdir(join(dir, 'tables'), { recursive: true, mode: 0o700 });
  const manifest: Record<string, any> = {
    version: IMPORTER_VERSION,
    tables: {},
    files: [],
    source_timezone: o.sourceTimezone,
  };
  for (const [name, data] of Object.entries(d.tables)) {
    if (!/^bbs_[\p{L}\p{N}_]+$/u.test(name)) throw new Error('ARCHIVE_TABLE_NAME');
    const file = join(dir, 'tables', name + '.json'),
      bytes = canonical(data);
    await writeOnce(file, bytes);
    manifest.tables[name] = {
      rows: data.length,
      sha256: hash(bytes),
      columns: d.schema.find((t) => t.table === name)?.columns,
    };
  }
  if (o.sourceDump) {
    const original = await readFile(o.sourceDump);
    const dest = join(dir, 'original.sql');
    try {
      const old = await readFile(dest);
      if (hash(old) !== hash(original)) throw new Error('SOURCE_ARCHIVE_CONFLICT');
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === 'ENOENT')
        await writeFile(dest, original, { mode: 0o600, flag: 'wx' });
      else throw e;
    }
    manifest.original_dump = { sha256: hash(original) };
  }
  for (const i of sourceRows(d, 'bbs_invoices')) {
    const candidates = [i.invoice_id + '.pdf', i.filename].filter(
      (f): f is string => f !== null && f !== '' && /^[\w.-]+\.pdf$/.test(f),
    );
    let found = false;
    for (const name of [...new Set(candidates)]) {
      if (!o.pdfDir) break;
      const path = resolve(o.pdfDir, name);
      if (!path.startsWith(resolve(o.pdfDir) + sep)) throw new Error('PATH_TRAVERSAL');
      try {
        const bytes = await readFile(path);
        const dest = join(dir, 'original-pdf', hash(i.invoice_id!) + '.pdf');
        await mkdir(join(dir, 'original-pdf'), { recursive: true, mode: 0o700 });
        await writeOnce(dest, bytes);
        manifest.files.push({ number: i.invoice_id, path: dest, sha256: hash(bytes) });
        found = true;
        break;
      } catch (e) {
        if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e;
      }
    }
    if (!found) manifest.files.push({ number: i.invoice_id, missing: true });
  }
  await writeOnce(join(dir, 'manifest.json'), canonical(manifest));
  return manifest;
}
export async function importLegacy(db: Pool, d: LegacyData, o: ImportOptions) {
  if (
    !/^[a-zA-Z0-9_-]{1,80}$/.test(o.sourceId) ||
    !['Europe/Prague', 'UTC'].includes(o.sourceTimezone)
  )
    throw new Error('IMPORT_OPTIONS');
  const report = validateSource(d);
  if (report.issues.some((i) => blocking.has(i.code))) throw new Error('SOURCE_VALIDATION_FAILED');
  const content = fingerprint({
    data: d,
    source_timezone: o.sourceTimezone,
    ...(o.templateText ? { template_text: o.templateText } : {}),
  });
  const connection = await db.getConnection();
  const lock = 'migration-' + hash(o.sourceId).slice(0, 30);
  try {
    if ((await rows(connection, 'SELECT GET_LOCK(?,10) acquired', [lock]))[0].acquired !== 1)
      throw new Error('IMPORT_LOCK');
    const [run] = await rows(connection, 'SELECT * FROM migration_runs WHERE source_id=?', [
      o.sourceId,
    ]);
    if (run && (run.manifest_hash !== content || run.importer_version !== IMPORTER_VERSION))
      throw new Error('IMPORT_VERSION_OR_CONTENT_CONFLICT');
    if (!run)
      await exec(
        connection,
        "INSERT INTO migration_runs(source_id,importer_version,state,manifest_hash) VALUES(?,?,'running',?)",
        [o.sourceId, IMPORTER_VERSION, content],
      );
    else
      await exec(connection, "UPDATE migration_runs SET state='running' WHERE source_id=?", [
        o.sourceId,
      ]);
    const manifest = await archive(d, o),
      { banks, supplierId } = await setup(db, d, o);
    let imported = 0;
    const currencyMap = new Map(
      sourceRows(d, 'bbs_currencies').map((c) => [c.cur_id, c.cur_code!]),
    );
    for (const source of sourceRows(d, 'bbs_invoices')) {
      await transaction(db, async (tx) => {
        const existingId = await existing(tx, o, 'bbs_invoices', source);
        const items = sourceRows(d, 'bbs_invoices_details')
          .filter((r) => r.invoice_id === source.invoice_id)
          .sort((a, b) => (BigInt(a.id!) < BigInt(b.id!) ? -1 : 1));
        if (existingId) {
          for (const item of items)
            if (!(await existing(tx, o, 'bbs_invoices_details', item)))
              throw new Error('INCOMPLETE_ITEM_MAP');
          return;
        }
        const contact = sourceRows(d, 'bbs_contacts').find((c) => c.id === source.contact_id)!;
        const customerId = await existing(tx, o, 'bbs_contacts', contact);
        const bankId = banks[source.alto === '1' ? 'alto' : 'standard'];
        const [bank] = await rows(tx, 'SELECT * FROM bank_accounts WHERE id=?', [bankId]);
        const [supplier] = await rows(tx, 'SELECT * FROM supplier_profiles WHERE id=?', [
          supplierId,
        ]);
        const issueDate = source.created!.slice(0, 10);
        const dueDate = addDays(issueDate, Number(source.due_days));
        if (!/^\d{4}-/.test(dueDate)) throw new Error('DUE_DATE_RANGE');
        const total = new Decimal(source.total!),
          recalc = items.reduce(
            (n, i) => n.plus(new Decimal(i.price!).mul(i.amount!)),
            new Decimal(0),
          );
        const snapshot = {
          customer: { ...contact, id: customerId, end_customer: contact.id === '1' },
          supplier: json(supplier.data_json),
          bank: { ...bank, id: String(bank.id) },
          currency: currencyMap.get(source.currency_id!),
          origin: 'legacy_current_state_reconstruction',
          vat_origin: 'unknown_historical',
        };
        await exec(
          tx,
          "INSERT INTO invoices(legacy_invoice_id,invoice_number,status,customer_id,issue_date,tax_date,due_date,due_days,source_created,source_timezone,currency,bank_account_id,snapshot,snapshot_origin,net,vat,gross,original_net,recalculated_net,difference,payment_status,legacy_alto,historical_vat_uncertain) VALUES(?,?,'issued',?,?,?,?,?,?,?,?,?,?,'legacy_current_state_reconstruction',?,NULL,NULL,?,?,?,?,?,TRUE)",
          [
            source.id,
            source.invoice_id,
            customerId,
            issueDate,
            issueDate,
            dueDate,
            source.due_days,
            source.created,
            o.sourceTimezone,
            currencyMap.get(source.currency_id!),
            bankId,
            JSON.stringify(snapshot),
            total.toFixed(2),
            source.total,
            recalc.toFixed(10),
            recalc.minus(total).toFixed(10),
            source.payed === '1' ? 'paid' : source.payed === '0' ? 'unpaid' : 'unknown',
            source.alto,
          ],
        );
        const targetId = await lastId(tx);
        for (const [position, i] of items.entries()) {
          const net = new Decimal(i.price!).mul(i.amount!).toFixed(10);
          await exec(
            tx,
            'INSERT INTO invoice_items(invoice_id,legacy_item_id,legacy_product_id,position,description,unit,price,quantity,vat_rate,net,vat,gross) VALUES(?,?,?,?,?,?,?,?,NULL,?,NULL,NULL)',
            [
              targetId,
              i.id,
              i.product_id,
              position,
              i.description,
              '',
              new Decimal(i.price!).toFixed(10),
              new Decimal(i.amount!).toFixed(10),
              net,
            ],
          );
          await remember(tx, o, 'bbs_invoices_details', i, 'invoice_items', await lastId(tx));
        }
        const original = manifest.files.find((f: any) => f.number === source.invoice_id);
        const metadata = {
          source_row: source,
          item_order: 'legacy_id_ascending_inferred',
          historical_vat: 'unknown',
          original_pdf_missing: !original || !!original.missing,
          source_float_representations: items.map((i) => ({
            id: i.id,
            price: i.price,
            amount: i.amount,
          })),
          related_credit_order_ids: sourceRows(d, 'bbs_credit_orders')
            .filter((r) => r.invoice_id === source.invoice_id)
            .map((r) => r.id),
          related_purchase_ids: sourceRows(d, 'bbs_purchase')
            .filter((r) => r.pur_invoice_id === source.invoice_id)
            .map((r) => r.pur_id),
        };
        await exec(tx, 'INSERT INTO legacy_metadata(invoice_id,data_json) VALUES(?,?)', [
          targetId,
          JSON.stringify(metadata),
        ]);
        if (original && !original.missing) {
          const relative = 'original/' + hash(o.sourceId + ':' + source.invoice_id) + '.pdf',
            target = join(o.storageDir, relative);
          await mkdir(join(o.storageDir, 'original'), { recursive: true, mode: 0o700 });
          try {
            const prev = await readFile(target);
            if (hash(prev) !== original.sha256) throw new Error('ORIGINAL_FILE_CONFLICT');
          } catch (e) {
            if ((e as NodeJS.ErrnoException).code === 'ENOENT')
              await copyFile(original.path, target);
            else throw e;
          }
          await exec(
            tx,
            "INSERT INTO invoice_files(invoice_id,kind,relative_path,sha256,template_version) VALUES(?,'original',?,?,'legacy-original')",
            [targetId, relative, original.sha256],
          );
        }
        const seq = source.invoice_id!.match(/^(\d{4})(\d{4})$/);
        if (seq && (seq[1] !== issueDate.slice(0, 4) || BigInt(seq[2]) === 0n))
          report.issues.push({
            code: 'NUMBER_SERIES_DATE_ANOMALY',
            table: 'bbs_invoices',
            id: source.id!,
          });
        if (seq) {
          await exec(
            tx,
            'INSERT INTO invoice_sequences(year,last_value) VALUES(?,?) ON DUPLICATE KEY UPDATE last_value=GREATEST(last_value,VALUES(last_value))',
            [seq[1], BigInt(seq[2]).toString()],
          );
        } else
          report.issues.push({
            code: 'NUMBER_SERIES_ANOMALY',
            table: 'bbs_invoices',
            id: source.id!,
          });
        if (!recalc.eq(total))
          report.issues.push({
            code: 'STORED_TOTAL_DIFFERS',
            table: 'bbs_invoices',
            id: source.id!,
          });
        if (!original || original.missing)
          report.issues.push({
            code: 'ORIGINAL_PDF_MISSING',
            table: 'bbs_invoices',
            id: source.id!,
          });
        await remember(tx, o, 'bbs_invoices', source, 'invoices', targetId);
      });
      imported++;
      if (o.failAfter && imported >= o.failAfter) throw new Error('SYNTHETIC_INTERRUPTION');
    }
    const verified = await verifyLegacy(db, d, o);
    report.issues.push(...verified.issues);
    report.state = verified.issues.length ? 'failed' : 'complete';
    await exec(connection, 'UPDATE migration_runs SET state=? WHERE source_id=?', [
      report.state,
      o.sourceId,
    ]);
    await writeFile(join(o.archiveDir, o.sourceId, 'report.json'), canonical(report), {
      mode: 0o600,
    });
    return report;
  } catch (e) {
    await exec(connection, "UPDATE migration_runs SET state='failed' WHERE source_id=?", [
      o.sourceId,
    ]).catch(() => {});
    throw e;
  } finally {
    await rows(connection, 'SELECT RELEASE_LOCK(?)', [lock]);
    connection.release();
  }
}
export async function verifyLegacy(
  db: Pool,
  d: LegacyData,
  o: ImportOptions,
): Promise<PrivateReport> {
  const issues: PrivateReport['issues'] = [],
    counts: Record<string, number> = {};
  const issue = (code: string, table: string, id: string) => issues.push({ code, table, id });
  for (const table of ['bbs_contacts', 'bbs_invoices', 'bbs_invoices_details']) {
    counts[table] = sourceRows(d, table).length;
    const [count] = await rows(
      db,
      'SELECT COUNT(*) n FROM legacy_id_map WHERE source_id=? AND source_table=?',
      [o.sourceId, table],
    );
    if (Number(count.n) !== counts[table]) issue('COUNT_MISMATCH', table, '');
    for (const row of sourceRows(d, table))
      try {
        if (!(await existing(db, o, table, row))) issue('MISSING_MAP', table, row.id!);
      } catch {
        issue('ROW_CONTENT_MISMATCH', table, row.id!);
      }
  }
  for (const source of sourceRows(d, 'bbs_invoices')) {
    const [map] = await rows(
      db,
      "SELECT target_id FROM legacy_id_map WHERE source_id=? AND source_table='bbs_invoices' AND source_id_value=?",
      [o.sourceId, source.id],
    );
    if (!map) continue;
    const [r] = await rows(db, 'SELECT * FROM invoices WHERE id=?', [map.target_id]);
    const items = await rows(
      db,
      'SELECT * FROM invoice_items WHERE invoice_id=? ORDER BY position,id',
      [map.target_id],
    );
    const expected = sourceRows(d, 'bbs_invoices_details').filter(
      (i) => i.invoice_id === source.invoice_id,
    );
    if (
      items.length !== expected.length ||
      items.some((i) => !expected.some((e) => e.id === i.legacy_item_id))
    )
      issue('ITEM_RELATION_MISMATCH', 'bbs_invoices', source.id!);
    if (
      r.source_created !== source.created ||
      r.invoice_number !== source.invoice_id ||
      r.payment_date !== null ||
      r.legacy_alto !== source.alto ||
      r.original_net !== source.total
    )
      issue('INVOICE_MAPPING_MISMATCH', 'bbs_invoices', source.id!);
    if (
      json(r.snapshot).customer.payment_id !==
      sourceRows(d, 'bbs_contacts').find((c) => c.id === source.contact_id)?.payment_id
    )
      issue('NULL_OR_EMPTY_MISMATCH', 'bbs_invoices', source.id!);
    const files = await rows(db, 'SELECT * FROM invoice_files WHERE invoice_id=?', [map.target_id]);
    for (const file of files)
      try {
        if (hash(await readFile(join(o.storageDir, file.relative_path))) !== file.sha256)
          issue('FILE_INTEGRITY', 'bbs_invoices', source.id!);
      } catch {
        issue('FILE_MISSING', 'bbs_invoices', source.id!);
      }
  }
  const manifestPath = join(o.archiveDir, o.sourceId, 'manifest.json');
  try {
    const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
    for (const [table, data] of Object.entries(d.tables)) {
      const bytes = await readFile(
        join(o.archiveDir, o.sourceId, 'tables', table + '.json'),
        'utf8',
      );
      if (
        hash(bytes) !== manifest.tables[table].sha256 ||
        fingerprint(JSON.parse(bytes)) !== fingerprint(data)
      )
        issue('ARCHIVE_CONTENT_MISMATCH', table, '');
    }
    if (o.sourceDump && hash(await readFile(o.sourceDump)) !== manifest.original_dump.sha256)
      issue('SOURCE_DUMP_CHANGED', 'archive', '');
    await stat(manifestPath);
  } catch {
    issue('ARCHIVE_MISSING', 'archive', '');
  }
  return { issues, counts, state: issues.length ? 'failed' : 'complete' };
}
