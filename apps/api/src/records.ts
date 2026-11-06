import { randomBytes } from 'node:crypto';
import { z } from 'zod';
import type { Pool } from 'mysql2/promise';
import { id } from '../../../packages/domain/index.js';
import { releaseInvoiceNumber } from './numbering.js';
import { rows, exec, transaction, json, hash, audit, AppError, missing, type Db } from './db.js';

const tables = {
  invoice: 'invoices',
  customer: 'customers',
  catalog: 'catalog_items',
  bank: 'bank_accounts',
  supplier: 'supplier_profiles',
} as const;
export const entitySchema = z.enum(['invoice', 'customer', 'catalog', 'bank', 'supplier']);
export type RecordEntity = z.infer<typeof entitySchema>;
export const deletionStartSchema = z
  .object({ entity: entitySchema, id, version: z.number().int().min(1) })
  .strict();
export const deletionFinishSchema = z
  .object({ version: z.number().int().min(1), token: z.string().regex(/^[\w-]{43}$/) })
  .strict();

export async function captureInvoice(db: Db, invoice: any) {
  return {
    invoice,
    items: await rows(db, 'SELECT * FROM invoice_items WHERE invoice_id=? ORDER BY position,id', [
      invoice.id,
    ]),
    files: await rows(db, 'SELECT * FROM invoice_files WHERE invoice_id=? ORDER BY id', [
      invoice.id,
    ]),
    vat_adjustments: await rows(db, 'SELECT * FROM invoice_vat_adjustments WHERE invoice_id=?', [
      invoice.id,
    ]),
  };
}
export async function rememberRecord(
  db: Db,
  actor: string,
  entity: RecordEntity,
  record: any,
  action: 'edit' | 'delete',
) {
  const data = entity === 'invoice' ? await captureInvoice(db, record) : record;
  await exec(
    db,
    'INSERT INTO record_history(entity_type,entity_id,version,action,data_json,actor_id) VALUES(?,?,?,?,?,?)',
    [entity, String(record.id), record.version, action, JSON.stringify(data), actor],
  );
}
export async function rememberEdit(
  db: Db,
  actor: string,
  entity: RecordEntity,
  recordId: string,
  version: number,
) {
  const [record] = await rows(
    db,
    `SELECT * FROM ${tables[entity]} WHERE id=? AND deleted_at IS NULL FOR UPDATE`,
    [recordId],
  );
  if (!record) throw missing();
  if (record.version !== version)
    throw new AppError(409, 'Záznam se změnil. Obnovte jej a zkontrolujte úpravy.');
  await rememberRecord(db, actor, entity, record, 'edit');
}
export async function prepareDeletion(
  db: Pool,
  actor: string,
  input: z.infer<typeof deletionStartSchema>,
) {
  const [record] = await rows(
    db,
    `SELECT id,version FROM ${tables[input.entity]} WHERE id=? AND deleted_at IS NULL`,
    [input.id],
  );
  if (!record) throw missing();
  if (record.version !== input.version)
    throw new AppError(409, 'Záznam se změnil. Obnovte jej a potvrďte smazání znovu.');
  const token = randomBytes(32).toString('base64url');
  await exec(db, 'DELETE FROM delete_confirmations WHERE expires_at<=UTC_TIMESTAMP(6)');
  await exec(
    db,
    'INSERT INTO delete_confirmations(token_hash,actor_id,entity_type,entity_id,record_version,expires_at) VALUES(?,?,?,?,?,DATE_ADD(UTC_TIMESTAMP(6),INTERVAL 5 MINUTE))',
    [hash(token), actor, input.entity, input.id, input.version],
  );
  return { token };
}
export async function deleteRecord(
  db: Pool,
  actor: string,
  entity: RecordEntity,
  recordId: string,
  input: z.infer<typeof deletionFinishSchema>,
) {
  return transaction(db, async (tx) => {
    const [confirmation] = await rows(
      tx,
      'SELECT * FROM delete_confirmations WHERE token_hash=? AND actor_id=? AND entity_type=? AND entity_id=? AND record_version=? AND expires_at>UTC_TIMESTAMP(6) FOR UPDATE',
      [hash(input.token), actor, entity, recordId, input.version],
    );
    if (!confirmation)
      throw new AppError(409, 'Potvrzení smazání chybí nebo vypršelo. Potvrďte oba kroky znovu.');
    const [record] = await rows(
      tx,
      `SELECT * FROM ${tables[entity]} WHERE id=? AND deleted_at IS NULL FOR UPDATE`,
      [recordId],
    );
    if (!record) throw missing();
    if (record.version !== input.version)
      throw new AppError(409, 'Záznam se změnil. Obnovte jej a potvrďte smazání znovu.');
    await rememberRecord(tx, actor, entity, record, 'delete');
    if (entity === 'invoice') await releaseInvoiceNumber(tx, record);
    await exec(
      tx,
      `UPDATE ${tables[entity]} SET deleted_at=UTC_TIMESTAMP(6),version=version+1 WHERE id=?`,
      [recordId],
    );
    await exec(tx, 'DELETE FROM delete_confirmations WHERE token_hash=?', [hash(input.token)]);
    await audit(tx, actor, entity + '.delete', entity, recordId);
    return { ok: true };
  });
}
export async function invoiceHistory(db: Db, invoiceId: string) {
  return (
    await rows(
      db,
      "SELECT id,version,action,created_at,data_json FROM record_history WHERE entity_type='invoice' AND entity_id=? ORDER BY id DESC",
      [invoiceId],
    )
  ).map((r) => ({
    id: String(r.id),
    version: r.version,
    action: r.action,
    created_at: r.created_at,
    has_pdf: (json(r.data_json).files ?? []).length > 0,
  }));
}
export async function historicalInvoiceFile(db: Db, invoiceId: string, historyId: string) {
  const [record] = await rows(
    db,
    "SELECT data_json FROM record_history WHERE id=? AND entity_type='invoice' AND entity_id=?",
    [historyId, invoiceId],
  );
  if (!record) throw missing();
  const data = json(record.data_json);
  const files = data.files ?? [];
  const file = files.find((f: any) => f.kind === 'original') ?? files[0];
  if (!file) throw new AppError(404, 'Tato verze nemá uložené PDF.');
  return { ...file, invoice_number: data.invoice.invoice_number };
}
