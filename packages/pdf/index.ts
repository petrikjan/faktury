import { readFile, mkdir, writeFile, rename, unlink } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { randomUUID, createHash } from 'node:crypto';
import { chromium, type Browser, type Page } from 'playwright';
import ejs from 'ejs';
import QRCode from 'qrcode';
import { Decimal, spayd } from '../domain/index.js';
import { paginateInvoice } from './paginate.js';
export class PdfLayoutError extends Error {
  constructor() {
    super(
      'Údaje dokladu se nevejdou do tiskové šablony. Zkontrolujte délku hlavičky, adres a patičky. Návrh zůstal uložený.',
    );
  }
}
export const TEMPLATE_VERSION = 'legacy-node-2';
const fmt = (s: string) => new Decimal(s).toDecimalPlaces(2).toString();
const date = (s: string) => {
  const [y, m, d] = s.slice(0, 10).split('-');
  return `${Number(d)}. ${Number(m)} ${y}`;
};
export async function invoiceHtml(invoice: any) {
  const root = resolve('packages/pdf'),
    assets = join(root, 'assets');
  const snap = invoice.snapshot;
  const [template, style, adaptation, font, bold, logo] = await Promise.all([
    readFile(join(root, 'invoice.ejs'), 'utf8'),
    readFile(join(root, 'legacy.css'), 'utf8'),
    readFile(join(root, 'chromium.css'), 'utf8'),
    readFile(join(assets, 'DejaVuSans.ttf')),
    readFile(join(assets, 'DejaVuSans-Bold.ttf')),
    readFile(join(assets, 'logo.jpg')),
  ]);
  const css = `@font-face{font-family:'DejaVu Sans';src:url(data:font/ttf;base64,${font.toString('base64')})} @font-face{font-family:'DejaVu Sans';font-weight:bold;src:url(data:font/ttf;base64,${bold.toString('base64')})} ${style.replace(/background-image:\s*url\([^)]*\);/g, '')} ${adaptation}`;
  const payload = spayd(
    snap.bank.account_number,
    snap.bank.bank_code,
    invoice.gross,
    invoice.invoice_number,
    snap.customer.payment_id,
  );
  const qr = await QRCode.toDataURL(payload, {
    errorCorrectionLevel: 'M',
    scale: 8,
    margin: 4,
    color: { dark: '#000000ff', light: '#ffffffff' },
  });
  const timestamp =
    date(invoice.issue_date) +
    ' ' +
    (invoice.source_created?.slice(11, 19) ??
      new Intl.DateTimeFormat('cs-CZ', {
        timeZone: 'Europe/Prague',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hourCycle: 'h23',
      }).format(
        invoice.created_at ? new Date(invoice.created_at.replace(' ', 'T') + 'Z') : new Date(),
      ));
  const footerLeft = (snap.supplier.footer_left ?? 'Vystavil: {{supplier}}\n{{issued_at}}')
    .replaceAll('{{supplier}}', snap.supplier.company)
    .replaceAll('{{issued_at}}', timestamp)
    .split(/\r\n|\r|\n/)
    .map((line: string) => ejs.escapeXML(line))
    .join('<br>');
  return ejs.render(template, {
    css,
    footerLeft,
    logo: 'data:image/jpeg;base64,' + logo.toString('base64'),
    qr,
    number: invoice.invoice_number,
    customer: {
      ...snap.customer,
      zip: snap.customer.zip.slice(0, 3) + ' ' + snap.customer.zip.slice(3),
    },
    supplier: snap.supplier,
    bank: snap.bank,
    items: invoice.items,
    net: invoice.net,
    vat: invoice.vat,
    gross: invoice.gross,
    issued: date(invoice.issue_date),
    due: date(invoice.due_date),
    taxable: date(invoice.tax_date),
    quantity: (value: string) => new Decimal(value).toFixed(),
    fmt,
  });
}
export async function renderInvoice(
  invoice: any,
  storageDir: string,
  options: { browser?: Browser } = {},
) {
  const html = await invoiceHtml(invoice);
  const browser =
    options.browser ??
    (await chromium.launch({
      channel: process.env.PDF_BROWSER_CHANNEL === 'chromium' ? undefined : 'chrome',
      headless: true,
    }));
  let page: Page | undefined;
  try {
    page = await browser.newPage({ viewport: { width: 794, height: 1123 } });
    await page.emulateMedia({ media: 'print' });
    await page.route('**/*', (route) => {
      if (route.request().url().startsWith('data:')) return route.continue();
      return route.abort();
    });
    await page.setContent(html, { waitUntil: 'load' });
    await page.evaluate(() => document.fonts.ready);
    const layout = await paginateInvoice(page);
    const bytes = await page.pdf({ format: 'A4', printBackground: true, preferCSSPageSize: true });
    const relative = 'generated/' + randomUUID() + '.pdf',
      path = join(storageDir, relative);
    await mkdir(join(storageDir, 'generated'), { recursive: true, mode: 0o700 });
    const tmp = path + '.tmp';
    try {
      await writeFile(tmp, bytes, { mode: 0o600, flag: 'wx' });
      await rename(tmp, path);
    } catch (e) {
      await unlink(tmp).catch(() => {});
      throw e;
    }
    return {
      path: relative,
      sha256: createHash('sha256').update(bytes).digest('hex'),
      version: TEMPLATE_VERSION,
      layout,
    };
  } catch (error) {
    if (
      error instanceof Error &&
      /PDF_(HEADER_TOO_TALL|PARTIES_TOO_TALL|ROW_CANNOT_FIT|SUMMARY_CANNOT_FIT|CONTENT_WIDTH|CONTENT_OVERLAP)/.test(
        error.message,
      )
    )
      throw new PdfLayoutError();
    throw error;
  } finally {
    await page?.close();
    if (!options.browser) await browser.close();
  }
}
