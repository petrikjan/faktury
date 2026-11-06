import { it, expect } from 'vitest';
import { readFile } from 'node:fs/promises';
import { PNG } from 'pngjs';
import jsQR from 'jsqr';
import { invoiceHtml } from '../packages/pdf/index.js';
import { spayd } from '../packages/domain/index.js';
const fixture = JSON.parse(await readFile('tests/fixtures/pdf-invoice.json', 'utf8'));
for (const bank of [
  { account_number: '123456789', bank_code: '0800' },
  { account_number: '19-987654321', bank_code: '0100' },
])
  for (const ks of [null, '', '0308'])
    it(`QR dekódování banky ${bank.bank_code}, KS ${ks === null ? 'NULL' : ks === '' ? 'empty' : 'set'}`, async () => {
      const f = structuredClone(fixture);
      f.snapshot.bank = bank;
      f.snapshot.customer.payment_id = ks;
      const html = await invoiceHtml(f);
      const encoded = html.match(/alt="QR Platba" src="data:image\/png;base64,([^"]+)/)![1];
      const png = PNG.sync.read(Buffer.from(encoded, 'base64'));
      const result = jsQR(new Uint8ClampedArray(png.data), png.width, png.height);
      expect(result?.data).toBe(
        spayd(bank.account_number, bank.bank_code, f.gross, f.invoice_number, ks),
      );
      expect([...png.data].filter((_, i) => i % 4 === 3).every((v) => v === 255)).toBe(true);
    });
it('šablona escapuje uživatelské HTML a označí koncového zákazníka', async () => {
  const f = structuredClone(fixture);
  f.items[0].description = '<script>PRIVATE_SYNTHETIC_CANARY</script>';
  f.snapshot.customer.company = '<img src="https://evil.example/private">';
  f.snapshot.customer.end_customer = true;
  f.snapshot.supplier.footer_left =
    'Vystavil: {{supplier}}\n{{issued_at}}\n<script>FOOTER_CANARY</script>';
  const html = await invoiceHtml(f);
  expect(html).not.toContain('<script>');
  expect(html).toContain('&lt;script&gt;');
  expect(html).toContain('Koncový zákazník');
  expect(html).not.toContain('<img src="https://evil.example');
  expect(html).toContain('&lt;script&gt;FOOTER_CANARY&lt;/script&gt;');
  expect(html).not.toContain('{{supplier}}');
});
