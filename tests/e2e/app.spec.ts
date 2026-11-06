import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
async function login(page: any) {
  const credentials = JSON.parse(await readFile('.private/e2e-login.json', 'utf8'));
  await page.goto('/invoices');
  await page.getByLabel('Přihlašovací jméno').fill(credentials.username);
  await page.getByLabel('Heslo', { exact: true }).fill(credentials.password);
  await page.getByRole('button', { name: 'Přihlásit se', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Faktury', exact: true })).toBeVisible();
  await page.context().storageState({ path: '.private/e2e-session.json' });
}
test('přihlášení, URL filtry, detail, návrh s ruční položkou, kontakt bez ztráty formuláře a odhlášení', async ({
  page,
}) => {
  await login(page);
  await page.getByLabel('Rok', { exact: true }).selectOption('2026');
  await page.getByLabel('Kvartál').selectOption('1');
  await expect(page).toHaveURL(/quarter=1/);
  await expect(
    page.getByRole('region', { name: 'Rozdělení faktur podle částky s DPH' }),
  ).toBeVisible();
  await page.getByRole('button', { name: /Pod 10 000 Kč s DPH/ }).click();
  await expect(page).toHaveURL(/amount_group=under/);
  await page.screenshot({ path: '.private/quarter-view.png', fullPage: true });
  await page.getByRole('link', { name: '20260003', exact: true }).click();
  await expect(page.getByRole('heading', { name: '20260003', exact: true })).toBeVisible();
  await page.getByRole('link', { name: 'Zpět na přehled' }).click();
  await expect(page).toHaveURL(/quarter=1/);
  await page.getByRole('link', { name: 'Nová faktura', exact: true }).click();
  const issued = page.getByLabel('Datum vystavení');
  const taxable = page.getByLabel('DUZP');
  const due = page.getByLabel('Datum splatnosti');
  const days = page.getByLabel('Splatnost ve dnech');
  await expect(due).not.toBeEditable();
  await issued.fill('2026-01-31');
  await expect(taxable).toHaveValue('2026-01-31');
  await expect(due).toHaveValue('2026-02-14');
  await taxable.fill('2026-01-30');
  await expect(issued).toHaveValue('2026-01-31');
  await expect(due).toHaveValue('2026-02-14');
  await days.fill('30');
  await expect(due).toHaveValue('2026-03-02');
  await issued.fill('2026-02-28');
  await expect(taxable).toHaveValue('2026-02-28');
  await expect(days).toHaveValue('30');
  await expect(due).toHaveValue('2026-03-30');
  await days.fill('0');
  await expect(due).toHaveValue('2026-02-28');
  await days.fill('');
  await expect(due).toHaveValue('');
  await days.fill('14');
  await issued.fill('2026-03-31');
  await expect(taxable).toHaveValue('2026-03-31');
  await expect(due).toHaveValue('2026-04-14');
  await taxable.fill('2026-03-30');
  await page.getByLabel('Popis položky').fill('Syntetická ruční položka Žluťoučký kůň');
  await page.getByLabel(/^Cena bez DPH/).fill('12,345');
  await page.getByLabel(/^Množství/).fill('2,5');
  await page.goBack();
  await expect(page.getByRole('heading', { name: 'Neuložené změny' })).toBeVisible();
  await page.getByRole('button', { name: 'Zůstat u faktury' }).click();
  await expect(page.getByLabel('Popis položky')).toHaveValue(
    'Syntetická ruční položka Žluťoučký kůň',
  );
  await page.getByRole('button', { name: 'Nový kontakt', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Firma / jméno').fill('Syntetický E2E odběratel');
  await dialog.getByLabel(/^Ulice/).fill('Ukázková');
  await dialog.getByLabel('Číslo domu').fill('001');
  await dialog.getByLabel('Město').fill('Praha');
  await dialog.getByLabel('PSČ').fill('00123');
  await dialog.getByLabel('IČO', { exact: true }).fill('00000009');
  await dialog.getByRole('button', { name: 'Uložit kontakt' }).click();
  await expect(dialog).not.toBeVisible();
  await expect(page.getByLabel('Popis položky')).toHaveValue(
    'Syntetická ruční položka Žluťoučký kůň',
  );
  await page.getByRole('button', { name: 'Uložit návrh', exact: true }).click();
  await expect(page.getByRole('heading', { name: /Návrh #/ })).toBeVisible();
  await expect(
    page.getByText('Syntetická ruční položka Žluťoučký kůň', { exact: true }),
  ).toBeVisible();
  await page.getByRole('link', { name: 'Upravit návrh' }).click();
  await expect(taxable).toHaveValue('2026-03-30');
  await expect(issued).toHaveValue('2026-03-31');
  await expect(days).toHaveValue('14');
  await expect(due).toHaveValue('2026-04-14');
  await expect(page.getByLabel('Popis položky')).toHaveValue(
    'Syntetická ruční položka Žluťoučký kůň',
  );
  await page.getByRole('button', { name: 'Zkontrolovat a vystavit' }).click();
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Vystavit fakturu', exact: true })
    .click();
  await expect(page.getByRole('heading', { name: /^20\d{6}$/ })).toBeVisible();
  const invoiceId = page.url().split('/').pop();
  const invoiceNumber = await page.getByRole('heading', { name: /^20\d{6}$/ }).innerText();
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('link', { name: 'Stáhnout PDF', exact: true }).click(),
  ]);
  expect(download.suggestedFilename()).toBe(invoiceNumber + '.pdf');
  await page.getByRole('button', { name: 'Náhled PDF' }).click();
  await expect(page.getByTitle('Náhled faktury PDF')).toBeVisible();
  await page.getByRole('dialog').getByRole('button', { name: 'Zavřít' }).click();
  const first = await page.request.get('/api/invoices/' + invoiceId + '/pdf');
  expect(first.ok()).toBe(true);
  expect(first.headers()['content-type']).toContain('application/pdf');
  const original = await first.body();
  expect(original.subarray(0, 5).toString()).toBe('%PDF-');
  await expect(page.getByText('Zaplaceno', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Označit nezaplaceno', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Označit zaplaceno', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Označit zaplaceno', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Potvrdit úhradu' }).click();
  await expect(page.getByText('Zaplaceno', { exact: true })).toBeVisible();
  const after = await page.request.get('/api/invoices/' + invoiceId + '/pdf');
  expect((await after.body()).equals(original)).toBe(true);
  await page.getByRole('button', { name: 'Odhlásit se' }).click();
  await expect(page.getByRole('heading', { name: 'Vítejte zpátky' })).toBeVisible();
});
for (const width of [360, 390, 768, 1280])
  test('responzivní rozhraní ' + width, async ({ page }) => {
    await page.setViewportSize({ width, height: 1000 });
    await login(page);
    await expect(page.locator('.invoice-table')).toBeVisible();
    expect(
      await page
        .locator('.filters select')
        .evaluateAll((elements) =>
          elements.every((el) => parseFloat(getComputedStyle(el).paddingRight) >= 34),
        ),
    ).toBe(true);
    await expect(page.getByLabel('Měna', { exact: true })).toHaveCount(0);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth);
    expect(overflow).toBe(false);
    await page.screenshot({ path: '.private/ui-' + width + '.png', fullPage: true });
    await page.getByRole('link', { name: 'Nová faktura', exact: true }).click();
    expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(
      false,
    );
    await expect(page.getByLabel('Popis položky')).toBeVisible();
    await page.screenshot({ path: '.private/form-' + width + '.png', fullPage: true });
  });
