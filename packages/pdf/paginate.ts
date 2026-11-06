import type { Page } from 'playwright';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
export interface PaginationReport {
  pages: number;
  sourceItems: number;
  printedRows: number;
  splitItems: number;
  descriptions: {
    item: number;
    page: number;
    left: number;
    top: number;
    right: number;
    bottom: number;
    continuation: boolean;
  }[];
}
/** This trusted browser program is kept outside the TS transpiler to avoid injected runtime helpers. */
export async function paginateInvoice(page: Page): Promise<PaginationReport> {
  return page.evaluate(await readFile(resolve('packages/pdf/paginate.browser.js'), 'utf8'));
}
