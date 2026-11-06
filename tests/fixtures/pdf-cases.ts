import { readFile } from 'node:fs/promises';
import { calculate } from '../../packages/domain/index.js';
const original = JSON.parse(await readFile('tests/fixtures/pdf-invoice.json', 'utf8'));
export function pdfCases() {
  const result: { name: string; invoice: any; multiple?: boolean }[] = [];
  const add = (name: string, edit: (f: any) => void = () => {}, multiple = false) => {
    const invoice = structuredClone(original);
    edit(invoice);
    const calculation = calculate(invoice.items);
    Object.assign(invoice, calculation);
    result.push({ name, invoice, multiple });
  };
  add('standard');
  add('end-customer-null-ks', (f) => {
    f.snapshot.customer.end_customer = true;
    f.snapshot.customer.payment_id = null;
  });
  add('alto-empty-ks', (f) => {
    f.snapshot.bank = { account_number: '19-987654321', bank_code: '0100' };
    f.snapshot.customer.payment_id = '';
  });
  add('alto-set-ks', (f) => {
    f.snapshot.bank = { account_number: '19-987654321', bank_code: '0100' };
  });
  add('fractional', (f) => {
    f.items[0].price = '12.3456789';
    f.items[0].quantity = '2.125';
    f.items[1].price = '0.0123456789';
    f.items[1].quantity = '10.5';
  });
  add('zero-vat', (f) => {
    f.items.forEach((i: any) => (i.vat_rate = '0'));
  });
  add('long-address', (f) => {
    f.snapshot.customer.company =
      'Syntetické společenství pro tvůrčí práce a společné projekty s dlouhým názvem';
    f.snapshot.customer.street = 'Dlouhá ukázková ulice pro test zalamování adresních údajů';
    f.snapshot.customer.street_number = '12345/678';
    f.snapshot.customer.city = 'Syntetické Město nad Zkušební Řekou';
  });
  add(
    'many-items',
    (f) => {
      f.items = Array.from({ length: 60 }, (_, i) => ({
        description: `Syntetická položka ${String(i + 1).padStart(3, '0')} — příprava podkladů, kontrola a předání. Konec ${String(i + 1).padStart(3, '0')}.`,
        price: '123.4567',
        quantity: '1.25',
        vat_rate: '21',
        unit: '',
      }));
    },
    true,
  );
  add(
    'long-description',
    (f) => {
      f.items = [
        {
          description:
            'ZAČÁTEK_DLOUHÉ_POLOŽKY ' +
            Array.from({ length: 500 }, (_, i) => `Žluťoučký text číslo ${i + 1}.`).join(' ') +
            ' KONEC_DLOUHÉ_POLOŽKY',
          price: '123.456789',
          quantity: '2.5',
          vat_rate: '21',
          unit: '',
        },
      ];
    },
    true,
  );
  add(
    'unbroken-description',
    (f) => {
      f.items = [
        {
          description: 'ZAČÁTEK_' + 'AbcČřž123'.repeat(220) + '_KONEC',
          price: '250',
          quantity: '3.5',
          vat_rate: '21',
          unit: '',
        },
      ];
    },
    true,
  );
  add('separate-tax-date', (f) => {
    f.tax_date = '2026-01-14';
  });
  return result;
}
