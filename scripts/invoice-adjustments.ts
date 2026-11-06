import 'dotenv/config';
import type { Pool } from 'mysql2/promise';
import { Decimal, rateInput, standardVatRate } from '../packages/domain/index.js';
import { poolFor, rows, exec, transaction, audit } from '../apps/api/src/db.js';

/** Explicit owner correction; archived source, invoice snapshots and files remain unchanged. */
export async function applyInvoicePreferences(db: Pool, actor: string, vatRate?: string) {
  const byDate = vatRate === 'standard-by-date';
  const fixedRate = vatRate === undefined || byDate ? undefined : rateInput.parse(vatRate);
  await transaction(db, async (tx) => {
    if (!(await rows(tx, 'SELECT 1 FROM users WHERE id=?', [actor])).length)
      throw new Error('LOCAL_ACTOR_REQUIRED');
    const invoices = await rows(
      tx,
      "SELECT * FROM invoices WHERE status IN('issued','void') AND deleted_at IS NULL FOR UPDATE",
    );
    for (const invoice of invoices) {
      if (invoice.status === 'issued' && invoice.payment_status !== 'paid') {
        await exec(
          tx,
          "UPDATE invoices SET payment_status='paid',payment_action_at=UTC_TIMESTAMP(6),version=version+1 WHERE id=?",
          [invoice.id],
        );
        await audit(tx, actor, 'invoice.bulk_paid', 'invoice', String(invoice.id));
      }
      if (
        vatRate === undefined ||
        !invoice.historical_vat_uncertain ||
        (invoice.vat !== null && invoice.gross !== null)
      )
        continue;
      const rate = byDate ? standardVatRate(invoice.tax_date) : fixedRate!;
      const [existing] = await rows(
        tx,
        'SELECT * FROM invoice_vat_adjustments WHERE invoice_id=?',
        [invoice.id],
      );
      if (existing) {
        if (!new Decimal(existing.vat_rate).eq(rate) || !new Decimal(existing.net).eq(invoice.net))
          throw new Error('CONFIRMED_VAT_CONFLICT');
        continue;
      }
      const net = new Decimal(invoice.net);
      let tax = net.mul(rate).div(100);
      for (const item of await rows(
        tx,
        'SELECT net,vat,vat_rate FROM invoice_items WHERE invoice_id=?',
        [invoice.id],
      )) {
        if (item.vat !== null || item.vat_rate !== null) {
          const storedTax = item.vat ?? new Decimal(item.net).mul(item.vat_rate).div(100);
          tax = tax.minus(new Decimal(item.net).mul(rate).div(100)).plus(storedTax);
        }
      }
      const vat =
        invoice.vat ??
        (invoice.gross !== null
          ? new Decimal(invoice.gross).minus(net).toFixed(2)
          : tax.toFixed(2));
      const gross = invoice.gross ?? net.plus(vat).toFixed(2);
      await exec(
        tx,
        'INSERT INTO invoice_vat_adjustments(invoice_id,net,vat_rate,vat,gross,reason,approved_by) VALUES(?,?,?,?,?,?,?)',
        [
          invoice.id,
          invoice.net,
          rate,
          vat,
          gross,
          byDate ? 'owner_confirmed_standard_by_tax_date' : 'owner_confirmed_rate',
          actor,
        ],
      );
      await audit(tx, actor, 'invoice.vat_confirmed', 'invoice', String(invoice.id));
    }
  });
  return { state: 'complete' as const };
}

if (process.argv[1]?.endsWith('/invoice-adjustments.ts')) {
  let db: Pool | undefined;
  try {
    if (process.env.REAL_UPDATE_APPROVAL !== 'explicitly-approved-by-owner')
      throw new Error('OWNER_APPROVAL_REQUIRED');
    const url = new URL(process.env.DATABASE_URL!);
    if (!['localhost', '127.0.0.1'].includes(url.hostname))
      throw new Error('LOCAL_DATABASE_REQUIRED');
    const actor = process.env.LOCAL_UPDATE_ACTOR;
    if (!actor || !/^\d+$/.test(actor)) throw new Error('LOCAL_ACTOR_REQUIRED');
    const rate = process.argv[2];
    db = poolFor(url.toString());
    console.info(JSON.stringify(await applyInvoicePreferences(db, actor, rate)));
  } catch {
    console.error(
      JSON.stringify({
        state: 'failed',
        message: 'Místní úprava byla zastavena bez výpisu hodnot.',
      }),
    );
    process.exitCode = 1;
  } finally {
    await db?.end();
  }
}
