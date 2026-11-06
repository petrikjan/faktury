import { rows, exec, type Db } from './db.js';

export async function lockNumberSeries(db: Db, year: number, minimum = '0') {
  await exec(
    db,
    'INSERT INTO invoice_sequences(year,last_value) VALUES(?,?) ON DUPLICATE KEY UPDATE last_value=GREATEST(last_value,VALUES(last_value))',
    [year, minimum],
  );
  return (
    await rows(
      db,
      'SELECT CAST(last_value AS CHAR) value FROM invoice_sequences WHERE year=? FOR UPDATE',
      [year],
    )
  )[0].value as string;
}
export function numberedSeries(number: string | null) {
  const match = number?.match(/^(\d{4})(\d{4})$/);
  if (!match || Number(match[1]) < 1900 || Number(match[1]) > 2199 || BigInt(match[2]) === 0n)
    return null;
  return { year: Number(match[1]), sequence: BigInt(match[2]).toString() };
}
export async function claimReleasedNumber(db: Db, year: number) {
  for (;;) {
    const [candidate] = await rows(
      db,
      'SELECT invoice_number,sequence_value FROM released_invoice_numbers WHERE year=? ORDER BY sequence_value,invoice_number LIMIT 1 FOR UPDATE',
      [year],
    );
    if (!candidate) return null;
    await exec(db, 'DELETE FROM released_invoice_numbers WHERE invoice_number=?', [
      candidate.invoice_number,
    ]);
    if (
      !(
        await rows(db, 'SELECT 1 FROM invoices WHERE invoice_number=? AND deleted_at IS NULL', [
          candidate.invoice_number,
        ])
      ).length
    )
      return candidate;
  }
}
export async function releaseInvoiceNumber(db: Db, invoice: any) {
  if (invoice.invoice_number === null) return;
  const series = numberedSeries(invoice.invoice_number);
  if (series) {
    await lockNumberSeries(db, series.year, series.sequence);
    await exec(
      db,
      'INSERT INTO released_invoice_numbers(invoice_number,year,sequence_value) VALUES(?,?,?) ON DUPLICATE KEY UPDATE year=VALUES(year),sequence_value=VALUES(sequence_value)',
      [invoice.invoice_number, series.year, series.sequence],
    );
  }
  await exec(
    db,
    'UPDATE invoices SET deleted_invoice_number=invoice_number,invoice_number=NULL WHERE id=?',
    [invoice.id],
  );
}
