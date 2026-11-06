import Decimal from 'decimal.js';
import { z } from 'zod';
Decimal.set({ precision: 60, rounding: Decimal.ROUND_HALF_UP });
export { Decimal };
export const decimalInput = (scale = 10, positive = false) =>
  z
    .string()
    .trim()
    .regex(
      new RegExp(`^\\d{1,18}(?:[.,]\\d{1,${scale}})?$`),
      'Zadejte číslo bez oddělovačů tisíců.',
    )
    .transform((s) => s.replace(',', '.'))
    .refine((s) => !positive || new Decimal(s).gt(0), 'Hodnota musí být větší než nula.');
export const rateInput = decimalInput(4).refine(
  (s) => new Decimal(s).lte(100),
  'Sazba musí být 0–100 %.',
);
export const id = z.string().regex(/^\d{1,20}$/);
export const dateInput = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((s) => {
    const d = new Date(s + 'T12:00:00Z');
    return (
      !isNaN(d.valueOf()) &&
      d.toISOString().slice(0, 10) === s &&
      s >= '1900-01-01' &&
      s <= '2199-12-31'
    );
  }, 'Neplatné datum.');
// Standard rates only; explicitly stored or reduced rates take precedence.
export function standardVatRate(date: string) {
  dateInput.parse(date);
  const rates = [
    ['2013-01-01', '21'],
    ['2010-01-01', '20'],
    ['2004-05-01', '19'],
    ['1995-01-01', '22'],
    ['1993-01-01', '23'],
  ] as const;
  const match = rates.find(([from]) => date >= from);
  if (!match) throw new Error('VAT_DATE_UNSUPPORTED');
  return match[1];
}
export const customerSchema = z
  .object({
    company: z.string().trim().min(1).max(200),
    street: z.string().max(200),
    street_number: z.string().max(25),
    city: z.string().max(200),
    zip: z.string().max(25),
    country: z.string().max(100),
    ico: z.string().max(25),
    dic: z.string().max(25),
    payment_id: z.string().max(255).nullable(),
    end_customer: z.boolean(),
    archived: z.boolean().default(false),
  })
  .strict()
  .superRefine((v, c) => {
    if (!v.end_customer)
      for (const key of ['street', 'street_number', 'city', 'zip', 'country', 'ico'] as const)
        if (!v[key].trim()) c.addIssue({ code: 'custom', path: [key], message: 'Vyplňte pole.' });
  });
export type CustomerInput = z.infer<typeof customerSchema>;
export const itemSchema = z
  .object({
    description: z.string().trim().min(1).max(60000),
    unit: z.string().max(30).default(''),
    price: decimalInput(),
    quantity: decimalInput(10, true),
    vat_rate: rateInput,
  })
  .strict();
export const invoiceSchema = z
  .object({
    customer_id: id,
    issue_date: dateInput,
    tax_date: dateInput,
    due_date: dateInput,
    currency: z.literal('CZK').default('CZK'),
    bank_account_id: id,
    items: z.array(itemSchema).min(1).max(300),
  })
  .strict()
  .refine((v) => v.due_date >= v.issue_date, {
    path: ['due_date'],
    message: 'Splatnost nemůže předcházet vystavení.',
  });
export type InvoiceInput = z.infer<typeof invoiceSchema>;
export const catalogSchema = z
  .object({
    name: z.string().trim().min(1).max(200),
    description: z.string().max(60000),
    unit: z.string().max(30),
    price: decimalInput(),
    vat_rate: rateInput,
    currency: z.literal('CZK').default('CZK'),
    active: z.boolean(),
  })
  .strict();
export const supplierSchema = z
  .object({
    company: z.string().min(1).max(200),
    street: z.string().max(200),
    city: z.string().max(200),
    zip: z.string().max(25),
    country: z.string().max(100),
    ico: z.string().max(25),
    dic: z.string().max(25),
    phone: z.string().max(40),
    email: z.string().max(150),
    website: z.string().max(150),
    footer: z.string().max(3000),
    footer_left: z.string().max(3000).optional(),
  })
  .strict();
export const bankSchema = z
  .object({
    label: z.string().min(1).max(100),
    account_number: z.string().regex(/^(?:\d{1,6}-)?\d{1,10}$/),
    bank_code: z.string().regex(/^\d{4}$/),
    variant: z.enum(['standard', 'alto']),
    active: z.boolean(),
  })
  .strict();
export function calculate(items: z.infer<typeof itemSchema>[]) {
  const rows = items.map((item) => {
    const net = new Decimal(item.price).mul(item.quantity),
      vat = net.mul(item.vat_rate).div(100);
    return {
      ...item,
      net: net.toFixed(10),
      vat: vat.toFixed(10),
      gross: net.plus(vat).toFixed(10),
    };
  });
  const sum = (key: 'net' | 'vat' | 'gross') =>
    rows.reduce((a, i) => a.plus(i[key]), new Decimal(0)).toFixed(2);
  const totals = { net: sum('net'), vat: sum('vat'), gross: sum('gross') };
  for (const v of [...Object.values(totals), ...rows.flatMap((r) => [r.net, r.vat, r.gross])])
    if (new Decimal(v).abs().gte('100000000000000000000'))
      throw new Error('Překročena přesnost částky.');
  return { items: rows, ...totals };
}
export function addDays(date: string, days: number) {
  const d = new Date(date + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
export function todayPrague(now = new Date()) {
  return new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Europe/Prague',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}
export function iban(account: string, bank: string) {
  if (!/^(?:\d{1,6}-)?\d{1,10}$/.test(account) || !/^\d{4}$/.test(bank))
    throw new Error('Neplatný účet.');
  const parts = account.split('-');
  const main = parts.pop()!;
  const bban = bank + (parts[0] ?? '').padStart(6, '0') + main.padStart(10, '0');
  return 'CZ' + (98n - (BigInt(bban + '123500') % 97n)).toString().padStart(2, '0') + bban;
}
export function spayd(
  account: string,
  bank: string,
  gross: string,
  number: string,
  ks: string | null,
) {
  if (!/^\d{1,10}$/.test(number) || new Decimal(gross).gt('9999999.99') || new Decimal(gross).lt(0))
    throw new Error('Doklad nelze zapsat do původního QR formátu.');
  const base = `SPD*1.0*ACC:${iban(account, bank)}*AM:${new Decimal(gross).toFixed(2)}*CC:CZK*X-VS:${number}`;
  if (ks !== null && ks.trim() !== '') {
    if (!/^\d{1,10}$/.test(ks.trim())) throw new Error('Neplatný konstantní symbol.');
    return base + '*X-KS:' + ks.trim();
  }
  return base;
}
export function period(year: number, quarter?: number, month?: number) {
  const first = month ?? (quarter ? (quarter - 1) * 3 + 1 : 1),
    next = month ? first + 1 : quarter ? first + 3 : 13;
  return {
    from: `${year}-${String(first).padStart(2, '0')}-01`,
    to: next > 12 ? `${year + 1}-01-01` : `${year}-${String(next).padStart(2, '0')}-01`,
  };
}
export function averageDivisor(year: number, now = todayPrague()) {
  const current = Number(now.slice(0, 4));
  return year < current ? 12 : year === current ? Number(now.slice(5, 7)) : 12;
}
