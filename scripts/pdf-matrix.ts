import { readFile, writeFile, mkdir, copyFile, readdir, unlink } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { chromium } from 'playwright';
import { PNG } from 'pngjs';
import jsQR from 'jsqr';
import { renderInvoice } from '../packages/pdf/index.js';
import { spayd } from '../packages/domain/index.js';
import { pdfCases } from '../tests/fixtures/pdf-cases.js';
const directory = resolve('.private/pdf/matrix');
await mkdir(directory, { recursive: true, mode: 0o700 });
const normalize = (s: string) => s.normalize('NFC').replace(/\s+/gu, '');
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const report: any = { state: 'complete', browser: browser.version(), cases: [] };
try {
  for (const test of pdfCases()) {
    const generated = await renderInvoice(test.invoice, directory, { browser });
    const pdf = join(directory, test.name + '.pdf');
    await copyFile(join(directory, generated.path), pdf);
    const info = execFileSync('pdfinfo', [pdf], { encoding: 'utf8' });
    const pages = Number(info.match(/Pages:\s+(\d+)/)![1]);
    if (
      pages !== generated.layout.pages ||
      pages < (test.multiple ? 2 : 1) ||
      (!test.multiple && test.name !== 'long-address' && pages !== 1)
    )
      throw new Error('PDF_PAGE_COUNT_' + test.name);
    const textPages: { x: number; y: number; right: number; bottom: number; text: string }[][] =
      JSON.parse(
        execFileSync(process.env.PDF_QA_PYTHON ?? 'python3', ['scripts/pdf-words.py', pdf], {
          encoding: 'utf8',
          maxBuffer: 20 * 1024 * 1024,
        }),
      );
    const visibleText = normalize(
      textPages
        .flat()
        .map((word) => word.text)
        .join(' '),
    );
    for (const value of [test.invoice.invoice_number, test.invoice.snapshot.bank.account_number])
      if (!visibleText.includes(normalize(value)))
        throw new Error('PDF_REQUIRED_FIELD_' + test.name);
    if (test.name === 'separate-tax-date' && !visibleText.includes('14.12026'))
      throw new Error('PDF_TAX_DATE');
    if (textPages.some((words) => words.length < 10))
      throw new Error('PDF_EMPTY_PAGE_' + test.name);
    test.invoice.items.forEach((item: any, index: number) => {
      const descriptions = generated.layout.descriptions
        .filter((d) => d.item === index)
        .map((d) => {
          const x = 28.346 + d.left * 0.75,
            y = 28.346 + d.top * 0.75,
            right = 28.346 + d.right * 0.75,
            bottom = 28.346 + d.bottom * 0.75;
          const text = textPages[d.page]
            .filter(
              (w) => w.x >= x - 1 && w.right <= right + 1 && w.y >= y - 1 && w.bottom <= bottom + 1,
            )
            .map((w) => w.text)
            .join('');
          return normalize(text).replace(d.continuation ? /^Pokračovánípoložky:/u : /^$/u, '');
        })
        .join('');
      if (descriptions !== normalize(item.description))
        throw new Error('PDF_EXTRACTED_DESCRIPTION_' + test.name + '_' + index);
    });
    const prefix = join(directory, test.name);
    for (const name of await readdir(directory))
      if (name.startsWith(test.name + '-') && name.endsWith('.png'))
        await unlink(join(directory, name));
    execFileSync('pdftoppm', ['-r', '120', '-png', pdf, prefix], { stdio: 'pipe' });
    const final = PNG.sync.read(await readFile(prefix + '-' + pages + '.png'));
    const qr = jsQR(new Uint8ClampedArray(final.data), final.width, final.height);
    const expected = spayd(
      test.invoice.snapshot.bank.account_number,
      test.invoice.snapshot.bank.bank_code,
      test.invoice.gross,
      test.invoice.invoice_number,
      test.invoice.snapshot.customer.payment_id,
    );
    if (qr?.data !== expected) throw new Error('PDF_QR_' + test.name);
    report.cases.push({
      name: test.name,
      pages,
      sourceItems: generated.layout.sourceItems,
      printedRows: generated.layout.printedRows,
      splitItems: generated.layout.splitItems,
      allDescriptions: true,
      qrDecoded: true,
      noBlankPages: true,
    });
  }
  await writeFile(join(directory, 'report.json'), JSON.stringify(report, null, 2), { mode: 0o600 });
  console.info(JSON.stringify({ state: 'complete', cases: report.cases }));
} finally {
  await browser.close();
}
