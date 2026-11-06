import type { Pool } from 'mysql2/promise';
import { z } from 'zod';
import {
  calculate,
  invoiceSchema,
  period,
  averageDivisor,
  todayPrague,
  type InvoiceInput,
  Decimal,
} from '../../../packages/domain/index.js';
import { rows, exec, transaction, json, hash, audit, AppError, missing, type Db } from './db.js';
import { rememberRecord } from './records.js';
import { lockNumberSeries, claimReleasedNumber, numberedSeries } from './numbering.js';
const decode = (r: any) => ({
  ...r,
  vat: r.effective_vat ?? r.vat,
  gross: r.effective_gross ?? r.gross,
  id: String(r.id),
  customer_id: r.customer_id == null ? undefined : String(r.customer_id),
  bank_account_id: r.bank_account_id == null ? undefined : String(r.bank_account_id),
  snapshot: r.snapshot ? json(r.snapshot) : undefined,
});
export async function settings(db: Db) {
  const [supplier] = await rows(
    db,
    'SELECT * FROM supplier_profiles WHERE deleted_at IS NULL ORDER BY id LIMIT 1',
  );
  return {
    supplier: supplier
      ? {
          id: String(supplier.id),
          data: json(supplier.data_json),
          vat_rate: supplier.vat_rate,
          version: supplier.version,
        }
      : null,
    banks: (await rows(db, 'SELECT * FROM bank_accounts WHERE deleted_at IS NULL ORDER BY id')).map(
      (b) => ({
        ...b,
        id: String(b.id),
        active: !!b.active,
      }),
    ),
  };
}
async function snapshot(db: Db, input: InvoiceInput, previous?: any) {
  let [customer] = await rows(
    db,
    'SELECT * FROM customers WHERE id=? AND archived=0 AND deleted_at IS NULL',
    [input.customer_id],
  );
  const s = await settings(db);
  let bank = s.banks.find((b) => b.id === input.bank_account_id && b.active);
  if (!customer && previous?.customer?.id === input.customer_id) customer = previous.customer;
  if (!bank && String(previous?.bank?.id) === input.bank_account_id) bank = previous.bank;
  const supplier = s.supplier?.data ?? previous?.supplier;
  if (!customer || !supplier || !bank)
    throw new AppError(400, 'Vyberte aktivního odběratele, účet a vyplňte dodavatele.');
  return {
    customer: { ...customer, id: String(customer.id), end_customer: !!customer.end_customer },
    supplier,
    bank,
    currency: input.currency,
    origin: 'new_issue',
    vat_origin: 'explicit_item_rates',
  };
}
export async function detail(db: Db, id: string) {
  const [invoice] = await rows(
    db,
    `SELECT i.*,COALESCE(i.vat,va.vat) effective_vat,
    COALESCE(i.gross,va.gross) effective_gross,va.vat_rate confirmed_vat_rate
    FROM invoices i LEFT JOIN invoice_vat_adjustments va ON va.invoice_id=i.id AND va.net=i.net WHERE i.id=? AND i.deleted_at IS NULL`,
    [id],
  );
  if (!invoice) throw missing();
  return {
    ...decode(invoice),
    items: (
      await rows(db, 'SELECT * FROM invoice_items WHERE invoice_id=? ORDER BY position,id', [id])
    ).map((i) =>
      invoice.confirmed_vat_rate !== null && i.vat_rate === null
        ? {
            ...i,
            vat_rate: invoice.confirmed_vat_rate,
            vat: i.vat ?? new Decimal(i.net).mul(invoice.confirmed_vat_rate).div(100).toFixed(10),
            gross:
              i.gross ??
              new Decimal(i.net)
                .plus(i.vat ?? new Decimal(i.net).mul(invoice.confirmed_vat_rate).div(100))
                .toFixed(10),
          }
        : i,
    ),
    files: await rows(db, 'SELECT id,kind,template_version FROM invoice_files WHERE invoice_id=?', [
      id,
    ]),
  };
}
async function writeItems(db: Db, invoiceId: string, input: InvoiceInput) {
  const c = calculate(input.items);
  await exec(db, 'DELETE FROM invoice_items WHERE invoice_id=?', [invoiceId]);
  for (const [p, i] of c.items.entries())
    await exec(
      db,
      'INSERT INTO invoice_items(invoice_id,position,description,unit,price,quantity,vat_rate,net,vat,gross) VALUES(?,?,?,?,?,?,?,?,?,?)',
      [invoiceId, p, i.description, i.unit, i.price, i.quantity, i.vat_rate, i.net, i.vat, i.gross],
    );
  return c;
}
export async function ensureInvoicePdf(
  db: Pool,
  actor: string,
  id: string,
  render: (invoice: any) => Promise<{ path: string; sha256: string; version: string }>,
) {
  return transaction(db, async (tx) => {
    const [invoice] = await rows(
      tx,
      'SELECT * FROM invoices WHERE id=? AND deleted_at IS NULL FOR UPDATE',
      [id],
    );
    if (!invoice) throw missing();
    if (invoice.status === 'draft')
      throw new AppError(404, 'PDF bude dostupné po vystavení faktury.');
    const [existing] = await rows(
      tx,
      "SELECT * FROM invoice_files WHERE invoice_id=? ORDER BY kind='original' DESC LIMIT 1",
      [id],
    );
    if (existing) return { ...existing, invoice_number: invoice.invoice_number };
    const document = await detail(tx, id);
    if (
      document.vat === null ||
      document.gross === null ||
      document.items.some((item: any) => item.vat_rate === null)
    )
      throw new AppError(422, 'Před vytvořením PDF doplňte chybějící DPH v úpravě faktury.');
    const file = await render(document);
    await exec(
      tx,
      "INSERT INTO invoice_files(invoice_id,kind,relative_path,sha256,template_version) VALUES(?,'generated',?,?,?)",
      [id, file.path, file.sha256, 'reconstructed:' + file.version],
    );
    await audit(tx, actor, 'invoice.pdf_reconstructed', 'invoice', id);
    return {
      relative_path: file.path,
      sha256: file.sha256,
      invoice_number: invoice.invoice_number,
    };
  });
}
export async function saveDraft(db: Pool, actor: string, key: string, input: InvoiceInput) {
  return transaction(db, async (tx) => {
    const fingerprint = hash(JSON.stringify(input));
    await exec(
      tx,
      'INSERT INTO idempotency_keys(actor_id,request_key,content_hash) VALUES(?,?,?) ON DUPLICATE KEY UPDATE request_key=VALUES(request_key)',
      [actor, key, fingerprint],
    );
    const [idem] = await rows(
      tx,
      'SELECT * FROM idempotency_keys WHERE actor_id=? AND request_key=? FOR UPDATE',
      [actor, key],
    );
    if (idem.content_hash !== fingerprint)
      throw new AppError(409, 'Stejný požadavek má jiný obsah.');
    if (idem.invoice_id) return detail(tx, String(idem.invoice_id));
    const snap = await snapshot(tx, input),
      c = calculate(input.items),
      days = Math.round((Date.parse(input.due_date) - Date.parse(input.issue_date)) / 86400000);
    await exec(
      tx,
      'INSERT INTO invoices(customer_id,issue_date,tax_date,due_date,due_days,currency,bank_account_id,snapshot,net,vat,gross) VALUES(?,?,?,?,?,?,?,?,?,?,?)',
      [
        input.customer_id,
        input.issue_date,
        input.tax_date,
        input.due_date,
        days,
        input.currency,
        input.bank_account_id,
        JSON.stringify(snap),
        c.net,
        c.vat,
        c.gross,
      ],
    );
    const [{ id }] = await rows(tx, 'SELECT CAST(LAST_INSERT_ID() AS CHAR) id');
    await writeItems(tx, id, input);
    await exec(tx, 'UPDATE idempotency_keys SET invoice_id=? WHERE actor_id=? AND request_key=?', [
      id,
      actor,
      key,
    ]);
    await audit(tx, actor, 'draft.create', 'invoice', id);
    return detail(tx, id);
  });
}
export async function updateDraft(
  db: Pool,
  actor: string,
  id: string,
  version: number,
  input: InvoiceInput,
) {
  return transaction(db, async (tx) => {
    const [r] = await rows(
      tx,
      'SELECT * FROM invoices WHERE id=? AND deleted_at IS NULL FOR UPDATE',
      [id],
    );
    if (!r) throw missing();
    if (r.status !== 'draft' || r.version !== version)
      throw new AppError(409, 'Doklad se změnil nebo byl vystaven.');
    await rememberRecord(tx, actor, 'invoice', r, 'edit');
    const snap = await snapshot(tx, input),
      c = await writeItems(tx, id, input),
      days = Math.round((Date.parse(input.due_date) - Date.parse(input.issue_date)) / 86400000);
    await exec(
      tx,
      'UPDATE invoices SET customer_id=?,issue_date=?,tax_date=?,due_date=?,due_days=?,currency=?,bank_account_id=?,snapshot=?,net=?,vat=?,gross=?,version=version+1 WHERE id=?',
      [
        input.customer_id,
        input.issue_date,
        input.tax_date,
        input.due_date,
        days,
        input.currency,
        input.bank_account_id,
        JSON.stringify(snap),
        c.net,
        c.vat,
        c.gross,
        id,
      ],
    );
    await audit(tx, actor, 'draft.update', 'invoice', id);
    return detail(tx, id);
  });
}
export async function issue(
  db: Pool,
  actor: string,
  id: string,
  render: (invoice: any) => Promise<{ path: string; sha256: string; version: string }>,
  expectedVersion?: number,
) {
  return transaction(db, async (tx) => {
    const [r] = await rows(
      tx,
      'SELECT * FROM invoices WHERE id=? AND deleted_at IS NULL FOR UPDATE',
      [id],
    );
    if (!r) throw missing();
    if (r.status === 'issued') return detail(tx, id);
    if (r.status !== 'draft') throw new AppError(409, 'Tento doklad nelze vystavit.');
    if (expectedVersion !== undefined && r.version !== expectedVersion)
      throw new AppError(409, 'Návrh se od potvrzení změnil. Zkontrolujte aktuální verzi.');
    if (r.currency !== 'CZK') throw new AppError(422, 'Fakturace používá pouze CZK.');
    const d = await detail(tx, id);
    const input = invoiceSchema.parse({
      customer_id: String(r.customer_id),
      issue_date: r.issue_date,
      tax_date: r.tax_date,
      due_date: r.due_date,
      currency: r.currency,
      bank_account_id: String(r.bank_account_id),
      items: d.items.map((i: any) => ({
        description: i.description,
        unit: i.unit,
        price: i.price,
        quantity: i.quantity,
        vat_rate: i.vat_rate,
      })),
    });
    const snap = await snapshot(tx, input);
    const year = Number(r.issue_date.slice(0, 4));
    const highWater = await lockNumberSeries(tx, year);
    const released = await claimReleasedNumber(tx, year);
    const next = released ? BigInt(released.sequence_value) : BigInt(highWater) + 1n;
    if (next > 9999n) throw new AppError(409, 'Roční číselná řada je vyčerpána.');
    const number = released?.invoice_number ?? String(year) + next.toString().padStart(4, '0');
    const file = await render({ ...d, invoice_number: number, snapshot: snap });
    await exec(tx, 'UPDATE invoice_sequences SET last_value=GREATEST(last_value,?) WHERE year=?', [
      next.toString(),
      year,
    ]);
    await exec(
      tx,
      "UPDATE invoices SET invoice_number=?,status='issued',snapshot=?,payment_status='paid',payment_date=NULL,payment_action_at=UTC_TIMESTAMP(6),version=version+1 WHERE id=?",
      [number, JSON.stringify(snap), id],
    );
    await exec(
      tx,
      "INSERT INTO invoice_files(invoice_id,kind,relative_path,sha256,template_version) VALUES(?,'generated',?,?,?)",
      [id, file.path, file.sha256, file.version],
    );
    await audit(tx, actor, 'invoice.issue', 'invoice', id);
    await audit(tx, actor, 'invoice.auto_paid', 'invoice', id);
    return detail(tx, id);
  });
}
export async function reviseInvoice(
  db: Pool,
  actor: string,
  id: string,
  version: number,
  input: InvoiceInput,
  number: string,
  render: (invoice: any) => Promise<{ path: string; sha256: string; version: string }>,
) {
  try {
    return await transaction(db, async (tx) => {
      const [old] = await rows(
        tx,
        'SELECT * FROM invoices WHERE id=? AND deleted_at IS NULL FOR UPDATE',
        [id],
      );
      if (!old) throw missing();
      if (old.status === 'draft' || old.version !== version)
        throw new AppError(409, 'Doklad se změnil. Obnovte jej a zkontrolujte úpravy.');
      if (
        (await rows(tx, 'SELECT 1 FROM invoices WHERE invoice_number=? AND id<>?', [number, id]))
          .length
      )
        throw new AppError(409, 'Číslo faktury už existuje.');
      const series = numberedSeries(number);
      if (series) await lockNumberSeries(tx, series.year);
      await exec(tx, 'DELETE FROM released_invoice_numbers WHERE invoice_number=?', [number]);
      const previous = await detail(tx, id);
      const snap = await snapshot(tx, input, previous.snapshot);
      await rememberRecord(tx, actor, 'invoice', old, 'edit');
      const c = await writeItems(tx, id, input);
      const file = await render({
        ...previous,
        ...input,
        ...c,
        invoice_number: number,
        snapshot: snap,
      });
      await exec(tx, 'DELETE FROM invoice_vat_adjustments WHERE invoice_id=?', [id]);
      await exec(
        tx,
        `UPDATE invoices SET invoice_number=?,customer_id=?,issue_date=?,tax_date=?,due_date=?,due_days=?,currency=?,bank_account_id=?,snapshot=?,snapshot_origin='owner_revision',net=?,vat=?,gross=?,historical_vat_uncertain=0,version=version+1 WHERE id=?`,
        [
          number,
          input.customer_id,
          input.issue_date,
          input.tax_date,
          input.due_date,
          Math.round((Date.parse(input.due_date) - Date.parse(input.issue_date)) / 86400000),
          input.currency,
          input.bank_account_id,
          JSON.stringify(snap),
          c.net,
          c.vat,
          c.gross,
          id,
        ],
      );
      await exec(tx, 'DELETE FROM invoice_files WHERE invoice_id=?', [id]);
      await exec(
        tx,
        "INSERT INTO invoice_files(invoice_id,kind,relative_path,sha256,template_version) VALUES(?,'generated',?,?,?)",
        [id, file.path, file.sha256, file.version],
      );
      if (series)
        await exec(
          tx,
          'UPDATE invoice_sequences SET last_value=GREATEST(last_value,?) WHERE year=?',
          [series.sequence, series.year],
        );
      await audit(tx, actor, 'invoice.revise', 'invoice', id);
      return detail(tx, id);
    });
  } catch (e) {
    if ((e as any).code === 'ER_DUP_ENTRY') throw new AppError(409, 'Číslo faktury už existuje.');
    throw e;
  }
}
export async function payment(
  db: Pool,
  actor: string,
  id: string,
  paid: boolean,
  date: string | null,
) {
  return transaction(db, async (tx) => {
    const [r] = await rows(
      tx,
      'SELECT status FROM invoices WHERE id=? AND deleted_at IS NULL FOR UPDATE',
      [id],
    );
    if (!r) throw missing();
    if (r.status !== 'issued')
      throw new AppError(409, 'Platbu lze měnit jen na vystaveném dokladu.');
    await exec(
      tx,
      'UPDATE invoices SET payment_status=?,payment_date=?,payment_action_at=UTC_TIMESTAMP(6),version=version+1 WHERE id=?',
      [paid ? 'paid' : 'unpaid', paid ? date : null, id],
    );
    await audit(tx, actor, paid ? 'invoice.paid' : 'invoice.unpaid', 'invoice', id);
    return detail(tx, id);
  });
}
export const filtersSchema = z
  .object({
    year: z.coerce.number().int().min(1900).max(2199).optional(),
    quarter: z.coerce.number().int().min(1).max(4).optional(),
    month: z.coerce.number().int().min(1).max(12).optional(),
    q: z.string().max(200).default(''),
    status: z.enum(['all', 'paid', 'unpaid', 'overdue', 'draft']).default('all'),
    amount_group: z.enum(['all', 'under', 'upper']).default('all'),
    sort: z.enum(['date', 'number', 'customer', 'net', 'vat', 'gross']).default('date'),
    direction: z.enum(['asc', 'desc']).default('desc'),
    page: z.coerce.number().int().min(1).max(100000).default(1),
    size: z.coerce
      .number()
      .refine((n) => [20, 50, 100].includes(n))
      .default(20),
  })
  .strict()
  .refine((x) => !(x.month && x.quarter), 'Vyberte měsíc nebo kvartál.');
const invoiceSource = `(SELECT source.*,COALESCE(source.vat,va.vat) effective_vat,
  COALESCE(source.gross,va.gross) effective_gross,va.vat_rate confirmed_vat_rate
  FROM invoices source LEFT JOIN invoice_vat_adjustments va ON va.invoice_id=source.id AND va.net=source.net WHERE source.deleted_at IS NULL)`;
export async function listInvoices(db: Db, input: unknown) {
  const f = filtersSchema.parse(input),
    where = ['1=1'],
    args: any[] = [];
  if (f.year) {
    const p = period(f.year, f.quarter, f.month);
    where.push('i.issue_date>=? AND i.issue_date<?');
    args.push(p.from, p.to);
  } else if (f.month || f.quarter) throw new AppError(400, 'Vyberte také rok.');
  if (f.q) {
    where.push(
      "(i.invoice_number LIKE ? OR JSON_UNQUOTE(JSON_EXTRACT(i.snapshot,'$.customer.company')) LIKE ? OR JSON_UNQUOTE(JSON_EXTRACT(i.snapshot,'$.customer.ico')) LIKE ? OR JSON_UNQUOTE(JSON_EXTRACT(i.snapshot,'$.customer.dic')) LIKE ?)",
    );
    args.push(...Array(4).fill('%' + f.q + '%'));
  }
  if (f.status === 'draft') where.push("i.status='draft'");
  else if (f.status !== 'all') {
    where.push("i.status='issued'");
    if (f.status === 'overdue') {
      where.push("i.payment_status='unpaid' AND i.due_date<?");
      args.push(todayPrague());
    } else {
      where.push('i.payment_status=?');
      args.push(f.status);
    }
  }
  const baseClause = where.join(' AND ');
  const amountGroups = await rows(
    db,
    `SELECT currency,
    CASE WHEN effective_gross<10000 THEN 'under' ELSE 'upper' END amount_group,
    COUNT(*) count,SUM(net) net,SUM(effective_vat) vat,SUM(effective_gross) gross
    FROM ${invoiceSource} i WHERE ${baseClause} AND i.status='issued'
    AND effective_gross IS NOT NULL GROUP BY currency,amount_group`,
    args,
  );
  if (f.amount_group !== 'all')
    where.push(
      `i.status='issued' AND i.effective_gross${f.amount_group === 'under' ? '<' : '>='}10000`,
    );
  const clause = where.join(' AND '),
    sort = {
      date: 'i.issue_date',
      number: 'i.invoice_number',
      customer: "JSON_UNQUOTE(JSON_EXTRACT(i.snapshot,'$.customer.company'))",
      net: 'i.net',
      vat: 'i.effective_vat',
      gross: 'i.effective_gross',
    }[f.sort];
  const [{ count }] = await rows(
    db,
    `SELECT COUNT(*) count FROM ${invoiceSource} i WHERE ${clause}`,
    args,
  );
  const records = await rows(
    db,
    `SELECT i.* FROM ${invoiceSource} i WHERE ${clause} ORDER BY ${sort} ${f.direction},i.id ${f.direction} LIMIT ? OFFSET ?`,
    [...args, f.size, (f.page - 1) * f.size],
  );
  const summary = await rows(
    db,
    `SELECT currency,COUNT(*) count,SUM(net) net,SUM(effective_vat) vat,SUM(effective_gross) gross,SUM(effective_vat IS NULL OR effective_gross IS NULL) uncertain,SUM(CASE WHEN payment_status='paid' THEN effective_gross ELSE 0 END) paid,SUM(CASE WHEN payment_status='unpaid' THEN effective_gross ELSE 0 END) unpaid,SUM(CASE WHEN payment_status='unpaid' AND due_date<? THEN effective_gross ELSE 0 END) overdue,SUM(CASE WHEN effective_gross<10000 THEN net ELSE 0 END) under_net,SUM(CASE WHEN effective_gross>=10000 THEN net ELSE 0 END) upper_net FROM ${invoiceSource} i WHERE ${clause} AND i.status='issued' GROUP BY currency`,
    [todayPrague(), ...args],
  );
  const months = await rows(
    db,
    `SELECT currency,MONTH(issue_date) month,SUM(net) net FROM ${invoiceSource} i WHERE ${clause} AND i.status='issued' GROUP BY currency,MONTH(issue_date) ORDER BY month`,
    args,
  );
  const annual = f.year
    ? await rows(
        db,
        `SELECT currency,COUNT(*) count,SUM(net) net,SUM(effective_vat) vat,SUM(effective_gross) gross,SUM(effective_vat IS NULL OR effective_gross IS NULL) uncertain FROM ${invoiceSource} i WHERE status='issued' AND issue_date>=? AND issue_date<? GROUP BY currency`,
        [String(f.year) + '-01-01', String(f.year + 1) + '-01-01'],
      )
    : [];
  const years = (
    await rows(db, 'SELECT DISTINCT YEAR(issue_date) year FROM invoices WHERE deleted_at IS NULL')
  ).map((x) => Number(x.year));
  years.push(Number(todayPrague().slice(0, 4)));
  return {
    items: records.map(decode),
    total: Number(count),
    page: f.page,
    size: f.size,
    summary: summary.map((x) => ({
      ...x,
      monthly_average: f.year
        ? new Decimal(x.net ?? 0).div(averageDivisor(f.year)).toFixed(2)
        : null,
    })),
    months,
    amount_groups: amountGroups,
    annual_summary: annual.map((x) => ({
      ...x,
      monthly_average: new Decimal(x.net ?? 0).div(averageDivisor(f.year!)).toFixed(2),
    })),
    years: [...new Set(years)].sort((a, b) => b - a),
    average_divisor: f.year ? averageDivisor(f.year) : null,
  };
}
