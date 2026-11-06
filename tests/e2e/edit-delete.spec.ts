import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';

async function login(page: any) {
  const saved = JSON.parse(await readFile('.private/e2e-session.json', 'utf8').catch(() => 'null'));
  if (saved?.cookies) await page.context().addCookies(saved.cookies);
  await page.goto('/invoices');
  if ((await (await page.request.get('/api/session')).json()).user) {
    await expect(page.getByRole('heading', { name: 'Faktury', exact: true })).toBeVisible();
    return;
  }
  const credentials = JSON.parse(await readFile('.private/e2e-login.json', 'utf8'));
  await page.getByLabel('Přihlašovací jméno').fill(credentials.username);
  await page.getByLabel('Heslo', { exact: true }).fill(credentials.password);
  await page.getByRole('button', { name: 'Přihlásit se', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Faktury', exact: true })).toBeVisible();
  await page.context().storageState({ path: '.private/e2e-session.json' });
}
async function send(page: any, path: string, method: string, body: any) {
  const session = await (await page.request.get('/api/session')).json();
  const response = await page.request.fetch('/api' + path, {
    method,
    data: body,
    headers: { origin: 'http://127.0.0.1:3199', 'x-csrf-token': session.csrf },
  });
  expect(response.ok()).toBe(true);
  return response.json();
}
async function confirmDeletion(page: any) {
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Ano, pokračovat', exact: true })
    .click();
  await expect(
    page.getByRole('dialog').getByText('POTVRZENÍ 2 ZE 2', { exact: true }),
  ).toBeVisible();
  await page.getByRole('dialog').getByRole('button', { name: 'Ano, smazat', exact: true }).click();
  await expect(page.getByRole('dialog')).not.toBeVisible();
}

test('upraví a smaže ceník, kontakt, účet a dodavatele až po obou potvrzeních', async ({
  page,
}) => {
  await login(page);
  const name = 'Syntetická položka pro editaci';
  const item = await send(page, '/catalog', 'POST', {
    name,
    description: 'Syntetický popis',
    unit: 'ks',
    price: '10',
    vat_rate: '21',
    currency: 'CZK',
    active: true,
  });
  await page.goto('/catalog');
  const card = page.locator('.catalog-card').filter({ hasText: name });
  await expect(card).toBeVisible();
  await page.screenshot({ path: '.private/record-actions-desktop.png', fullPage: true });
  await page.setViewportSize({ width: 390, height: 1000 });
  await expect(page.locator('.sidebar')).not.toBeInViewport();
  expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
  await page.screenshot({ path: '.private/record-actions-mobile.png', fullPage: true });
  await card.getByRole('button', { name: 'Upravit', exact: true }).click();
  await page.getByRole('dialog').getByLabel('Cena bez DPH').fill('12,5');
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Uložit položku', exact: true })
    .click();
  await expect(card).toContainText('12,50');
  await card.getByRole('button', { name: 'Smazat', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Zrušit', exact: true }).click();
  await expect(card).toBeVisible();
  await card.getByRole('button', { name: 'Smazat', exact: true }).click();
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Ano, pokračovat', exact: true })
    .click();
  await expect(
    page.getByRole('dialog').getByText('POTVRZENÍ 2 ZE 2', { exact: true }),
  ).toBeVisible();
  expect(
    (await (await page.request.get('/api/catalog')).json()).some((r: any) => r.id === item.id),
  ).toBe(true);
  await page.getByRole('dialog').getByRole('button', { name: 'Zrušit', exact: true }).click();
  await expect(card).toBeVisible();
  await card.getByRole('button', { name: 'Smazat', exact: true }).click();
  await confirmDeletion(page);
  await expect(card).toHaveCount(0);
  await page.goto('/invoices/new');
  await expect(
    page.getByLabel('Přidat z ceníku').locator('option[value="' + item.id + '"]'),
  ).toHaveCount(0);

  const customer = await send(page, '/customers', 'POST', {
    company: 'Syntetický kontakt pro editaci',
    street: '',
    street_number: '',
    city: '',
    zip: '',
    country: 'Česká republika',
    ico: '',
    dic: '',
    payment_id: null,
    end_customer: true,
    archived: false,
  });
  await page.goto('/customers');
  await page
    .locator('.contact-card')
    .filter({ hasText: customer.company })
    .getByRole('button', { name: 'Upravit', exact: true })
    .click();
  await page.getByRole('dialog').getByLabel('Firma / jméno').fill('Syntetický upravený kontakt');
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Uložit kontakt', exact: true })
    .click();
  const contact = page.locator('.contact-card').filter({ hasText: 'Syntetický upravený kontakt' });
  await expect(contact).toBeVisible();
  await contact.getByRole('button', { name: 'Smazat', exact: true }).click();
  await confirmDeletion(page);
  await expect(contact).toHaveCount(0);

  const settings = await send(page, '/settings/banks', 'POST', {
    label: 'Syntetický účet pro editaci',
    account_number: '123456789',
    bank_code: '0800',
    variant: 'standard',
    active: true,
  });
  await page.goto('/settings');
  await page
    .locator('.bank-card')
    .filter({ hasText: 'Syntetický účet pro editaci' })
    .getByRole('button', { name: 'Upravit', exact: true })
    .click();
  await page.getByRole('dialog').getByLabel('Název účtu').fill('Syntetický upravený účet');
  await page.getByRole('dialog').getByRole('button', { name: 'Uložit účet', exact: true }).click();
  const bank = page.locator('.bank-card').filter({ hasText: 'Syntetický upravený účet' });
  await expect(bank).toBeVisible();
  await bank.getByRole('button', { name: 'Smazat', exact: true }).click();
  await confirmDeletion(page);
  await expect(bank).toHaveCount(0);

  await page.getByRole('button', { name: 'Smazat dodavatele', exact: true }).click();
  await confirmDeletion(page);
  await expect(page.getByRole('button', { name: 'Smazat dodavatele', exact: true })).toHaveCount(0);
  expect((await (await page.request.get('/api/settings')).json()).supplier).toBeNull();
  await send(page, '/settings/supplier', 'PUT', {
    data: settings.supplier.data,
    vat_rate: settings.supplier.vat_rate,
    version: 0,
  });
});

test('upraví vystavenou fakturu s novým PDF, zachová staré PDF a smaže po dvojím potvrzení', async ({
  page,
}) => {
  await login(page);
  await page.goto('/invoices/new');
  await page.getByLabel('Kontakt', { exact: false }).selectOption('2');
  await page.getByLabel('Přidat z ceníku').selectOption('1');
  await expect(page.locator('.invoice-item')).toHaveCount(1);
  await page.getByRole('button', { name: 'Zkontrolovat a vystavit', exact: true }).click();
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Vystavit fakturu', exact: true })
    .click();
  await expect(page.getByRole('heading', { name: /^20\d{6}$/ })).toBeVisible({ timeout: 20000 });
  const id = page.url().split('/').pop();
  const before = await (await page.request.get('/api/invoices/' + id)).json();
  const original = await (await page.request.get('/api/invoices/' + id + '/pdf')).body();
  await page.getByRole('link', { name: 'Upravit fakturu', exact: true }).click();
  await page.getByLabel(/^Cena bez DPH/).fill('1750');
  await page.getByRole('button', { name: 'Zkontrolovat úpravy', exact: true }).click();
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Uložit novou verzi', exact: true })
    .click();
  await expect(page.getByRole('heading', { name: before.invoice_number, exact: true })).toBeVisible(
    { timeout: 20000 },
  );
  const revised = await (await page.request.get('/api/invoices/' + id)).json();
  expect(revised.net).toBe('1750.00');
  expect(revised.gross).toBe('2117.50');
  expect(
    (await (await page.request.get('/api/invoices/' + id + '/pdf')).body()).equals(original),
  ).toBe(false);
  const historicalLink = page.getByRole('link', {
    name: 'PDF verze ' + before.version,
    exact: true,
  });
  await expect(historicalLink).toBeVisible();
  expect(
    (await (await page.request.get((await historicalLink.getAttribute('href'))!)).body()).equals(
      original,
    ),
  ).toBe(true);
  await page.screenshot({ path: '.private/invoice-history-review.png', fullPage: true });
  await page.getByRole('button', { name: 'Smazat fakturu', exact: true }).click();
  await confirmDeletion(page);
  await expect(page).toHaveURL(/\/invoices$/);
  expect((await page.request.get('/api/invoices/' + id)).status()).toBe(404);
  expect((await page.request.get('/api/invoices/' + id + '/pdf')).status()).toBe(404);
  const filtered = await (
    await page.request.get('/api/invoices?q=' + before.invoice_number)
  ).json();
  expect(filtered.total).toBe(0);
});

test('z chybějící původní přílohy vytvoří PDF při náhledu a stáhne je pod číslem faktury', async ({
  page,
}) => {
  await login(page);
  await page.goto('/invoices');
  await page.getByRole('link', { name: '20260001', exact: true }).click();
  const id = page.url().split('/').pop();
  const before = await (await page.request.get('/api/invoices/' + id)).json();
  expect(before.files).toHaveLength(0);
  await expect(page.getByText('Původní PDF chybí.', { exact: false })).toBeVisible();
  const generated = page.waitForResponse(
    (r) => new URL(r.url()).pathname === '/api/invoices/' + id + '/pdf',
  );
  await page.getByRole('button', { name: 'Náhled PDF', exact: true }).click();
  expect((await generated).status()).toBe(200);
  await expect(
    page.getByRole('dialog').getByRole('heading', { name: 'PDF z uložených údajů', exact: true }),
  ).toBeVisible();
  await page.getByRole('dialog').getByRole('button', { name: 'Zavřít', exact: true }).click();
  await expect(page.getByText('PDF bylo nově vytvořeno', { exact: false })).toBeVisible();
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('link', { name: 'Stáhnout PDF', exact: true }).click(),
  ]);
  expect(download.suggestedFilename()).toBe('20260001.pdf');
  const after = await (await page.request.get('/api/invoices/' + id)).json();
  expect(after.files).toHaveLength(1);
  for (const key of ['net', 'vat', 'gross', 'version', 'snapshot'])
    expect(after[key]).toEqual(before[key]);
});
