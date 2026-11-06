import { describe, it, expect } from 'vitest';
import {
  calculate,
  decimalInput,
  invoiceSchema,
  addDays,
  period,
  averageDivisor,
  spayd,
  iban,
  standardVatRate,
} from '../packages/domain/index.js';
describe('Desetinné výpočty a období', () => {
  it('vybere historickou základní sazbu přesně na hranicích účinnosti', () => {
    for (const [date, rate] of [
      ['1993-01-01', '23'],
      ['1994-12-31', '23'],
      ['1995-01-01', '22'],
      ['2004-04-30', '22'],
      ['2004-05-01', '19'],
      ['2009-12-31', '19'],
      ['2010-01-01', '20'],
      ['2012-12-31', '20'],
      ['2013-01-01', '21'],
      ['2026-11-06', '21'],
    ])
      expect(standardVatRate(date)).toBe(rate);
    expect(() => standardVatRate('1992-12-31')).toThrow('VAT_DATE_UNSUPPORTED');
    expect(() => standardVatRate('2012-02-30')).toThrow();
  });
  it('zachová přesné desetinné součty bez binárních chyb', () => {
    const c = calculate([
      { description: 'Test', unit: '', price: '0.1234567890', quantity: '3.5', vat_rate: '21' },
    ]);
    expect(c.items[0].net).toBe('0.4320987615');
    expect(c.net).toBe('0.43');
    expect(c.vat).toBe('0.09');
    expect(c.gross).toBe('0.52');
  });
  it('přijme čárku i tečku a odmítne oddělovače tisíců / nečíselný vstup', () => {
    expect(decimalInput().parse('1,234')).toBe('1.234');
    for (const v of ['1 000', '1,000.20', '', 'NaN', '1e4', '-1'])
      expect(decimalInput().safeParse(v).success).toBe(false);
  });
  it('ověří data, přestupný den a půlotevřené kvartály', () => {
    expect(addDays('2024-02-28', 1)).toBe('2024-02-29');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(period(2026, 4)).toEqual({ from: '2026-10-01', to: '2027-01-01' });
    expect(period(2026, 1)).toEqual({ from: '2026-01-01', to: '2026-04-01' });
    expect(averageDivisor(2025, '2026-11-05')).toBe(12);
    expect(averageDivisor(2026, '2026-11-05')).toBe(11);
    expect(invoiceSchema.safeParse({}).success).toBe(false);
  });
  it('generuje český IBAN a původní SPAYD s nezaměněným KS a VS', () => {
    expect(iban('19-2000145399', '0800')).toBe('CZ6508000000192000145399');
    const p = spayd('123456789', '0800', '121', '20260001', '0308');
    expect(p).toContain('*AM:121.00*CC:CZK*X-VS:20260001*X-KS:0308');
    expect(spayd('123456789', '0800', '0', '20260001', '')).not.toContain('X-KS');
    expect(spayd('123456789', '0800', '0', '20260001', null)).not.toContain('X-KS');
  });
});
