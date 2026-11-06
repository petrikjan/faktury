import { beforeAll, beforeEach, afterAll, describe, it, expect } from 'vitest';
import { randomBytes, randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import argon2 from 'argon2';
import { buildApp } from '../apps/api/src/app.js';
import { config } from '../apps/api/src/config.js';
import { poolFor, rows, exec, hash, json } from '../apps/api/src/db.js';
import { migrate, seed, createFirstAdmin } from '../scripts/db.js';
import { clear } from './helpers.js';
import * as service from '../apps/api/src/services.js';
import { applyInvoicePreferences } from '../scripts/invoice-adjustments.js';
const db = poolFor(config.DATABASE_URL);
let app: Awaited<ReturnType<typeof buildApp>>, cookie: string, csrf: string, actor: string;
const password = randomBytes(24).toString('hex');
const fakeRender = async () => {
  const bytes = Buffer.from('%PDF-SYNTHETIC-FIXTURE');
  const path = 'generated/' + randomUUID() + '.pdf';
  await mkdir(config.STORAGE_DIR + '/generated', { recursive: true });
  await writeFile(config.STORAGE_DIR + '/' + path, bytes);
  return { path, sha256: hash(bytes), version: 'synthetic-test' };
};
const draft = (price = '100') => ({
  customer_id: '2',
  issue_date: '2026-03-31',
  tax_date: '2026-03-31',
  due_date: '2026-04-14',
  currency: 'CZK' as const,
  bank_account_id: '1',
  items: [{ description: 'Syntetická služba', unit: 'hod', price, quantity: '1', vat_rate: '21' }],
});
const request = (method: any, url: string, body?: any, extra: any = {}) =>
  app.inject({
    method,
    url,
    headers: { origin: config.APP_ORIGIN, cookie, 'x-csrf-token': csrf, ...extra },
    ...(body !== undefined ? { payload: body } : {}),
  });
const deletePaths: Record<string, string> = {
  invoice: 'invoices',
  customer: 'customers',
  catalog: 'catalog',
  bank: 'settings/banks',
  supplier: 'settings/supplier',
};
async function removeRecord(entity: string, id: string, version: number) {
  const first = await request('POST', '/api/deletions/prepare', { entity, id, version });
  expect(first.statusCode).toBe(200);
  return request('DELETE', '/api/' + deletePaths[entity] + '/' + id, {
    version,
    token: first.json().token,
  });
}
beforeAll(async () => {
  await migrate(db);
});
beforeEach(async () => {
  if (app) await app.close();
  await clear(db);
  await seed(db);
  await exec(db, 'INSERT INTO users(username,password_hash) VALUES(?,?)', [
    'synthetic-admin',
    await argon2.hash(password, { type: argon2.argon2id }),
  ]);
  actor = String((await rows(db, 'SELECT id FROM users'))[0].id);
  app = await buildApp(db, { render: fakeRender });
  const login = await app.inject({
    method: 'POST',
    url: '/api/login',
    headers: { origin: config.APP_ORIGIN },
    payload: { username: 'synthetic-admin', password },
  });
  expect(login.statusCode).toBe(200);
  csrf = login.json().csrf;
  cookie = login.cookies.map((c) => c.name + '=' + c.value).join('; ');
});
afterAll(async () => {
  await app?.close();
  await db.end();
});
describe('Serverové hranice', () => {
  it('chrání všechny obchodní cesty a session se po odhlášení zneplatní', async () => {
    for (const url of [
      '/api/invoices',
      '/api/invoices/1',
      '/api/invoices/1/pdf',
      '/api/customers',
      '/api/catalog',
      '/api/settings',
    ])
      expect((await app.inject(url)).statusCode).toBe(401);
    expect((await app.inject({ method: 'POST', url: '/mcp', payload: {} })).statusCode).toBe(404);
    expect((await request('POST', '/api/logout')).statusCode).toBe(200);
    expect((await request('GET', '/api/invoices')).statusCode).toBe(401);
  });
  it('odmítne CSRF a cizí Origin', async () => {
    expect(
      (
        await request('POST', '/api/invoices', draft(), {
          'x-csrf-token': 'bad',
          'idempotency-key': randomUUID(),
        })
      ).statusCode,
    ).toBe(403);
    expect(
      (await request('GET', '/api/invoices', undefined, { origin: 'https://other.example' }))
        .statusCode,
    ).toBe(403);
  });
  it('omezuje pokusy o přihlášení a neprozradí účet', async () => {
    const bodies = [];
    let last = 0;
    for (let n = 0; n < 6; n++) {
      const r = await app.inject({
        method: 'POST',
        url: '/api/login',
        headers: { origin: config.APP_ORIGIN },
        payload: { username: n % 2 ? 'unknown' : 'synthetic-admin', password: 'wrong' },
      });
      last = r.statusCode;
      if (last === 401) bodies.push(r.json().message);
    }
    expect(last).toBe(429);
    expect(new Set(bodies).size).toBe(1);
  });
  it('po změně hesla revokuje všechny relace', async () => {
    expect(
      (
        await request('POST', '/api/password', {
          current: password,
          next: randomBytes(24).toString('hex'),
        })
      ).statusCode,
    ).toBe(200);
    expect((await request('GET', '/api/invoices')).statusCode).toBe(401);
  });
});
describe('Transakce a neměnné doklady', () => {
  it('dvojité souběžné vytvoření vytvoří právě jeden návrh a odmítne jiné tělo', async () => {
    const key = randomUUID();
    const result = await Promise.all(
      Array.from({ length: 5 }, () => service.saveDraft(db, actor, key, draft())),
    );
    expect(new Set(result.map((d) => d.id)).size).toBe(1);
    expect((await rows(db, 'SELECT * FROM invoices')).length).toBe(1);
    await expect(service.saveDraft(db, actor, key, draft('101'))).rejects.toThrow('jiný obsah');
  });
  it('souběžně přidělí jedinečná pořadová čísla a opakované vystavení je idempotentní', async () => {
    const drafts = await Promise.all(
      Array.from({ length: 8 }, () => service.saveDraft(db, actor, randomUUID(), draft())),
    );
    const result = await Promise.all(drafts.map((d) => service.issue(db, actor, d.id, fakeRender)));
    expect(result.every((r) => r.payment_status === 'paid' && r.payment_date === null)).toBe(true);
    expect(new Set(result.map((r) => r.invoice_number)).size).toBe(8);
    expect(result.map((r) => r.invoice_number).sort()).toEqual(
      Array.from({ length: 8 }, (_, i) => '2026' + String(i + 1).padStart(4, '0')),
    );
    const repeat = await service.issue(db, actor, result[0].id, fakeRender);
    expect(repeat.invoice_number).toBe(result[0].invoice_number);
    expect((await rows(db, 'SELECT * FROM invoice_files')).length).toBe(8);
  });
  it('při chybě PDF nevyčerpá číslo a nevystaví doklad', async () => {
    const d = await service.saveDraft(db, actor, randomUUID(), draft());
    await expect(
      service.issue(db, actor, d.id, async () => {
        throw new Error('SYNTHETIC_RENDER_FAIL');
      }),
    ).rejects.toThrow();
    expect((await service.detail(db, d.id)).status).toBe('draft');
    const issued = await service.issue(db, actor, d.id, fakeRender);
    expect(issued.invoice_number).toBe('20260001');
  });
  it('změny kontaktu, dodavatele, účtu a ceníku nezmění vystavený snímek ani soubor', async () => {
    const d = await service.saveDraft(db, actor, randomUUID(), draft());
    const issued = await service.issue(db, actor, d.id, fakeRender);
    await exec(db, "UPDATE customers SET company='Nový syntetický název' WHERE id=2");
    await exec(
      db,
      "UPDATE supplier_profiles SET vat_rate=12,data_json=JSON_SET(data_json,'$.company','Jiný dodavatel')",
    );
    await exec(db, "UPDATE bank_accounts SET account_number='111' WHERE id=1");
    await exec(db, 'UPDATE catalog_items SET price=99');
    const after = await service.detail(db, d.id);
    expect(after.snapshot).toEqual(issued.snapshot);
    expect(after.net).toBe('100.00');
    expect(
      (await request('PUT', '/api/invoices/' + d.id, { version: after.version, data: draft() }))
        .statusCode,
    ).toBe(409);
    const pdf = await request('GET', '/api/invoices/' + d.id + '/pdf');
    expect(pdf.statusCode).toBe(200);
    expect(pdf.headers['content-disposition']).toBe(
      'inline; filename="' + issued.invoice_number + '.pdf"',
    );
    const download = await request('GET', '/api/invoices/' + d.id + '/pdf?download=1');
    expect(download.headers['content-disposition']).toBe(
      'attachment; filename="' + issued.invoice_number + '.pdf"',
    );
    expect(pdf.headers['cache-control']).toContain('no-store');
    expect(pdf.headers['content-security-policy']).toContain("frame-ancestors 'self'");
    expect(pdf.rawPayload.equals(Buffer.from('%PDF-SYNTHETIC-FIXTURE'))).toBe(true);
  });
  it('změna úhrady má audit a nezaměňuje čas akce s datem platby', async () => {
    const d = await service.saveDraft(db, actor, randomUUID(), draft());
    await service.issue(db, actor, d.id, fakeRender);
    const paid = await service.payment(db, actor, d.id, true, null);
    expect(paid.payment_date).toBeNull();
    expect(paid.payment_action_at).not.toBeNull();
    expect((await rows(db, "SELECT * FROM audit_events WHERE action='invoice.paid'")).length).toBe(
      1,
    );
  });
  it('odmítne jinou měnu už při zadání faktury', async () => {
    expect(
      (
        await request(
          'POST',
          '/api/invoices',
          { ...draft(), currency: 'EUR' },
          { 'idempotency-key': randomUUID() },
        )
      ).statusCode,
    ).toBe(400);
    expect((await rows(db, 'SELECT * FROM invoices')).length).toBe(0);
  });
  it('stránkuje stabilně a souhrn zahrne celý výsledek kvartálu i hranici 10 000 s DPH', async () => {
    for (let n = 0; n < 23; n++) {
      const input = {
        ...draft(n === 0 ? '9999.99' : '10000'),
        issue_date: n === 22 ? '2026-04-01' : '2026-03-31',
        items: [{ ...draft().items[0], price: n === 0 ? '9999.99' : '10000', vat_rate: '0' }],
      };
      const d = await service.saveDraft(db, actor, randomUUID(), input);
      await service.issue(db, actor, d.id, fakeRender);
    }
    const result = await service.listInvoices(db, { year: 2026, quarter: 1, page: 1, size: 20 });
    expect(result.total).toBe(22);
    expect(result.items.length).toBe(20);
    expect(result.summary[0].under_net).toBe('9999.99');
    expect(result.summary[0].upper_net).toBe('210000.00');
    expect(result.summary[0].net).toBe('219999.99');
    const second = await service.listInvoices(db, { year: 2026, quarter: 1, page: 2, size: 20 });
    expect(second.items.length).toBe(2);
    expect(result.items.some((a) => second.items.some((b) => a.id === b.id))).toBe(false);
    expect((await service.listInvoices(db, { year: 2026, quarter: 2 })).total).toBe(1);
  });
  it('dělí podle zaokrouhlené částky s DPH, přesných 10 000 patří nahoru', async () => {
    for (const price of ['8264.45', '8264.46', '9999.99']) {
      const d = await service.saveDraft(db, actor, randomUUID(), draft(price));
      await service.issue(db, actor, d.id, fakeRender);
    }
    const lower = await service.listInvoices(db, { year: 2026, quarter: 1, amount_group: 'under' });
    const upper = await service.listInvoices(db, {
      year: 2026,
      quarter: 1,
      amount_group: 'upper',
      sort: 'gross',
      direction: 'asc',
    });
    expect(lower.items.map((i) => i.gross)).toEqual(['9999.98']);
    expect(upper.items.map((i) => i.gross)).toEqual(['10000.00', '12099.99']);
    expect(upper.summary[0].vat).toBe('3835.54');
    expect(upper.amount_groups.map((g) => Number(g.count)).sort()).toEqual([1, 2]);
  });
  it('dopočte historickou DPH podle DUZP a zachová již vyplněnou daň', async () => {
    for (const [date, vat] of [
      ['2004-04-30', '22.00'],
      ['2004-05-01', '19.00'],
      ['2012-12-31', '20.00'],
      ['2013-01-01', '21.00'],
    ]) {
      const input = { ...draft(), issue_date: date, tax_date: date, due_date: date };
      const d = await service.saveDraft(db, actor, randomUUID(), input);
      await service.issue(db, actor, d.id, fakeRender);
      await exec(
        db,
        'UPDATE invoices SET historical_vat_uncertain=1,vat=NULL,gross=NULL WHERE id=?',
        [d.id],
      );
      await exec(
        db,
        'UPDATE invoice_items SET vat_rate=NULL,vat=NULL,gross=NULL WHERE invoice_id=?',
        [d.id],
      );
      await applyInvoicePreferences(db, actor, 'standard-by-date');
      expect((await service.detail(db, d.id)).vat).toBe(vat);
    }
    const input = { ...draft(), items: [{ ...draft().items[0], vat_rate: '12' }] };
    const d = await service.saveDraft(db, actor, randomUUID(), input);
    await service.issue(db, actor, d.id, fakeRender);
    await exec(db, 'UPDATE invoices SET historical_vat_uncertain=1 WHERE id=?', [d.id]);
    await applyInvoicePreferences(db, actor, 'standard-by-date');
    expect((await service.detail(db, d.id)).vat).toBe('12.00');
    expect(
      (await rows(db, 'SELECT * FROM invoice_vat_adjustments WHERE invoice_id=?', [d.id])).length,
    ).toBe(0);
    const mixed = await service.saveDraft(db, actor, randomUUID(), {
      ...draft(),
      items: [
        { ...draft().items[0], vat_rate: '12' },
        { ...draft().items[0], vat_rate: '21' },
      ],
    });
    await service.issue(db, actor, mixed.id, fakeRender);
    await exec(
      db,
      'UPDATE invoices SET historical_vat_uncertain=1,vat=NULL,gross=NULL WHERE id=?',
      [mixed.id],
    );
    await exec(
      db,
      'UPDATE invoice_items SET vat_rate=NULL,vat=NULL,gross=NULL WHERE invoice_id=? AND position=1',
      [mixed.id],
    );
    await applyInvoicePreferences(db, actor, 'standard-by-date');
    const result = await service.detail(db, mixed.id);
    expect(result.vat).toBe('33.00');
    expect(result.items.map((i: any) => i.vat_rate)).toEqual(['12.0000', '21.0000']);
  });
  it('dopočte potvrzenou DPH odděleně a označí úhradu bez změny originálu či data platby', async () => {
    const d = await service.saveDraft(db, actor, randomUUID(), draft('8264.46'));
    await service.issue(db, actor, d.id, fakeRender);
    const untouchedDraft = await service.saveDraft(db, actor, randomUUID(), draft());
    await exec(
      db,
      "UPDATE invoices SET historical_vat_uncertain=1,vat=NULL,gross=NULL,payment_status='unknown' WHERE id=?",
      [d.id],
    );
    await exec(
      db,
      'UPDATE invoice_items SET vat_rate=NULL,vat=NULL,gross=NULL WHERE invoice_id=?',
      [d.id],
    );
    const before = (await rows(db, 'SELECT * FROM invoices WHERE id=?', [d.id]))[0];
    const fileBefore = await rows(db, 'SELECT * FROM invoice_files WHERE invoice_id=?', [d.id]);
    await applyInvoicePreferences(db, actor, '21');
    await applyInvoicePreferences(db, actor, '21');
    const result = await service.detail(db, d.id);
    expect(result).toMatchObject({
      vat: '1735.54',
      gross: '10000.00',
      payment_status: 'paid',
      payment_date: null,
    });
    expect(result.snapshot).toEqual(
      typeof before.snapshot === 'string' ? JSON.parse(before.snapshot) : before.snapshot,
    );
    expect((await rows(db, 'SELECT vat,gross FROM invoices WHERE id=?', [d.id]))[0]).toEqual({
      vat: null,
      gross: null,
    });
    expect(await rows(db, 'SELECT * FROM invoice_files WHERE invoice_id=?', [d.id])).toEqual(
      fileBefore,
    );
    expect((await service.detail(db, untouchedDraft.id)).payment_status).toBe('unpaid');
    const report = await service.listInvoices(db, {
      year: 2026,
      quarter: 1,
      amount_group: 'upper',
    });
    expect(report.summary[0]).toMatchObject({
      net: '8264.46',
      vat: '1735.54',
      gross: '10000.00',
      uncertain: '0',
    });
    expect(
      (await rows(db, "SELECT * FROM audit_events WHERE action='invoice.vat_confirmed'")).length,
    ).toBe(1);
    await expect(applyInvoicePreferences(db, actor, '12')).rejects.toThrow(
      'CONFIRMED_VAT_CONFLICT',
    );
  });
});

describe('Úpravy, historie a dvojí potvrzení smazání', () => {
  it('vyžaduje platný druhý krok pro stejný záznam, uživatele a verzi', async () => {
    expect((await request('DELETE', '/api/catalog/1', { version: 1 })).statusCode).toBe(400);
    const first = await request('POST', '/api/deletions/prepare', {
      entity: 'catalog',
      id: '1',
      version: 1,
    });
    expect(first.statusCode).toBe(200);
    const token = first.json().token;
    expect((await request('GET', '/api/catalog')).json().some((c: any) => c.id === '1')).toBe(true);
    expect(
      (await request('DELETE', '/api/settings/banks/1', { version: 1, token })).statusCode,
    ).toBe(409);
    await exec(db, 'UPDATE catalog_items SET version=2 WHERE id=1');
    expect((await request('DELETE', '/api/catalog/1', { version: 1, token })).statusCode).toBe(409);
    const newer = await request('POST', '/api/deletions/prepare', {
      entity: 'catalog',
      id: '1',
      version: 2,
    });
    await exec(
      db,
      'UPDATE delete_confirmations SET expires_at=DATE_SUB(UTC_TIMESTAMP(6),INTERVAL 1 SECOND)',
    );
    expect(
      (await request('DELETE', '/api/catalog/1', { version: 2, token: newer.json().token }))
        .statusCode,
    ).toBe(409);
    expect((await removeRecord('catalog', '1', 2)).statusCode).toBe(200);
    expect((await request('GET', '/api/catalog')).json().some((c: any) => c.id === '1')).toBe(
      false,
    );
    expect((await request('DELETE', '/api/catalog/1', { version: 1, token })).statusCode).toBe(409);
    const anonymous = await app.inject({
      method: 'POST',
      url: '/api/deletions/prepare',
      headers: { origin: config.APP_ORIGIN },
      payload: { entity: 'catalog', id: '2', version: 1 },
    });
    expect(anonymous.statusCode).toBe(401);
  });
  it.each(['invoice', 'customer', 'catalog', 'bank', 'supplier'])(
    'smaže %s z nabídek a zachová historii i navázané doklady',
    async (entity) => {
      const input = {
        ...draft(),
        issue_date: '2018-03-31',
        tax_date: '2018-03-31',
        due_date: '2018-04-14',
      };
      const draftRecord = await service.saveDraft(db, actor, randomUUID(), input);
      const invoice = await service.issue(db, actor, draftRecord.id, fakeRender);
      const recordId = entity === 'invoice' ? invoice.id : entity === 'customer' ? '2' : '1';
      expect(
        (await removeRecord(entity, recordId, entity === 'invoice' ? invoice.version : 1))
          .statusCode,
      ).toBe(200);
      const history = await rows(
        db,
        'SELECT * FROM record_history WHERE entity_type=? AND entity_id=?',
        [entity, recordId],
      );
      expect(history.length).toBe(1);
      expect(history[0].action).toBe('delete');
      expect(json(history[0].data_json)).toBeTruthy();
      if (entity === 'invoice') {
        expect((await request('GET', '/api/invoices/' + recordId)).statusCode).toBe(404);
        expect((await request('GET', '/api/invoices/' + recordId + '/pdf')).statusCode).toBe(404);
        const listing = await service.listInvoices(db, {});
        expect(listing.total).toBe(0);
        expect(listing.summary).toEqual([]);
        expect(listing.years).not.toContain(2018);
        const oldFile = await request(
          'GET',
          '/api/invoices/' + recordId + '/history/' + history[0].id + '/pdf',
        );
        expect(oldFile.rawPayload.equals(Buffer.from('%PDF-SYNTHETIC-FIXTURE'))).toBe(true);
        const next = await service.saveDraft(db, actor, randomUUID(), input);
        expect((await service.issue(db, actor, next.id, fakeRender)).invoice_number).toBe(
          '20180001',
        );
      } else {
        expect((await service.detail(db, invoice.id)).snapshot).toEqual(invoice.snapshot);
        expect((await request('GET', '/api/invoices/' + invoice.id + '/pdf')).statusCode).toBe(200);
        if (entity === 'customer')
          expect(
            (await request('GET', '/api/customers')).json().some((r: any) => r.id === recordId),
          ).toBe(false);
        if (entity === 'catalog')
          expect(
            (await request('GET', '/api/catalog')).json().some((r: any) => r.id === recordId),
          ).toBe(false);
        if (entity === 'bank')
          expect((await service.settings(db)).banks.some((r) => r.id === recordId)).toBe(false);
        if (entity === 'supplier') expect((await service.settings(db)).supplier).toBeNull();
      }
    },
  );
  it('upraví vystavenou fakturu, zachová staré PDF a při chybě vrátí všechny změny', async () => {
    const d = await service.saveDraft(db, actor, randomUUID(), draft());
    const before = await service.issue(db, actor, d.id, fakeRender);
    const original = (await request('GET', '/api/invoices/' + d.id + '/pdf')).rawPayload;
    const response = await request('PUT', '/api/invoices/' + d.id, {
      version: before.version,
      data: draft('200'),
      revision: true,
      invoice_number: '20260008',
    });
    expect(response.statusCode).toBe(200);
    const edited = response.json();
    expect(edited).toMatchObject({
      invoice_number: '20260008',
      net: '200.00',
      vat: '42.00',
      gross: '242.00',
      payment_status: 'paid',
      snapshot_origin: 'owner_revision',
    });
    const history = (await request('GET', '/api/invoices/' + d.id + '/history')).json();
    expect(history).toHaveLength(1);
    expect(history[0]).toMatchObject({ version: before.version, action: 'edit', has_pdf: true });
    const currentPdf = await request('GET', '/api/invoices/' + d.id + '/pdf?download=1');
    expect(currentPdf.headers['content-disposition']).toBe('attachment; filename="20260008.pdf"');
    const historicalPdf = await request(
      'GET',
      '/api/invoices/' + d.id + '/history/' + history[0].id + '/pdf?download=1',
    );
    expect(historicalPdf.headers['content-disposition']).toBe(
      'attachment; filename="' + before.invoice_number + '.pdf"',
    );
    expect(
      (
        await request('GET', '/api/invoices/' + d.id + '/history/' + history[0].id + '/pdf')
      ).rawPayload.equals(original),
    ).toBe(true);
    await expect(
      service.reviseInvoice(db, actor, d.id, edited.version, draft('999'), '20260008', async () => {
        throw new Error('PDF_RETRY_TEST');
      }),
    ).rejects.toThrow('PDF_RETRY_TEST');
    expect((await service.detail(db, d.id)).net).toBe('200.00');
    expect(
      (
        await rows(db, "SELECT * FROM record_history WHERE entity_type='invoice' AND entity_id=?", [
          d.id,
        ])
      ).length,
    ).toBe(1);
    expect(
      (
        await request('PUT', '/api/invoices/' + d.id, {
          version: before.version,
          data: draft('201'),
          revision: true,
          invoice_number: '20260008',
        })
      ).statusCode,
    ).toBe(409);
    const next = await service.saveDraft(db, actor, randomUUID(), draft());
    expect((await service.issue(db, actor, next.id, fakeRender)).invoice_number).toBe('20260009');
  });
  it('umožní upravit existující fakturu i po smazání původního kontaktu a účtu', async () => {
    const d = await service.saveDraft(db, actor, randomUUID(), draft());
    const issued = await service.issue(db, actor, d.id, fakeRender);
    for (const [entity, id] of [
      ['customer', '2'],
      ['bank', '1'],
      ['supplier', '1'],
    ])
      expect((await removeRecord(entity, id, 1)).statusCode).toBe(200);
    await expect(service.saveDraft(db, actor, randomUUID(), draft())).rejects.toThrow(
      'aktivního odběratele',
    );
    const edited = await service.reviseInvoice(
      db,
      actor,
      d.id,
      issued.version,
      draft('150'),
      issued.invoice_number,
      fakeRender,
    );
    expect(edited.net).toBe('150.00');
    expect(edited.snapshot.customer).toEqual(issued.snapshot.customer);
  });
});

describe('Opětovné použití čísel smazaných faktur', () => {
  it('uvolní prostřední i poslední číslo a souběžně je přidělí právě jednou', async () => {
    const issued = [];
    for (let n = 0; n < 3; n++) {
      const d = await service.saveDraft(db, actor, randomUUID(), draft());
      issued.push(await service.issue(db, actor, d.id, fakeRender));
    }
    for (const i of issued.slice(1))
      expect((await removeRecord('invoice', i.id, i.version)).statusCode).toBe(200);
    const deleted = await rows(
      db,
      'SELECT invoice_number,deleted_invoice_number FROM invoices WHERE deleted_at IS NOT NULL ORDER BY id',
    );
    expect(deleted).toEqual([
      { invoice_number: null, deleted_invoice_number: '20260002' },
      { invoice_number: null, deleted_invoice_number: '20260003' },
    ]);
    const drafts = await Promise.all(
      Array.from({ length: 4 }, () => service.saveDraft(db, actor, randomUUID(), draft())),
    );
    const result = await Promise.all(drafts.map((d) => service.issue(db, actor, d.id, fakeRender)));
    expect(result.map((i) => i.invoice_number).sort()).toEqual([
      '20260002',
      '20260003',
      '20260004',
      '20260005',
    ]);
    expect((await rows(db, 'SELECT * FROM released_invoice_numbers')).length).toBe(0);
    expect(
      (await rows(db, 'SELECT last_value FROM invoice_sequences WHERE year=2026'))[0].last_value,
    ).toBe('5');
  });
  it('ponechá uvolněné číslo stejnému roku a při chybě PDF ho neztratí', async () => {
    const oldInput = {
      ...draft(),
      issue_date: '2018-01-01',
      tax_date: '2018-01-01',
      due_date: '2018-01-15',
    };
    const d = await service.saveDraft(db, actor, randomUUID(), oldInput);
    const old = await service.issue(db, actor, d.id, fakeRender);
    expect((await removeRecord('invoice', old.id, old.version)).statusCode).toBe(200);
    const current = await service.saveDraft(db, actor, randomUUID(), draft());
    expect((await service.issue(db, actor, current.id, fakeRender)).invoice_number).toBe(
      '20260001',
    );
    const retry = await service.saveDraft(db, actor, randomUUID(), oldInput);
    await expect(
      service.issue(db, actor, retry.id, async () => {
        throw new Error('REUSE_PDF_FAIL');
      }),
    ).rejects.toThrow('REUSE_PDF_FAIL');
    expect(
      (await rows(db, 'SELECT invoice_number FROM released_invoice_numbers'))[0].invoice_number,
    ).toBe('20180001');
    await exec(db, 'UPDATE invoice_sequences SET last_value=9999 WHERE year=2018');
    expect((await service.issue(db, actor, retry.id, fakeRender)).invoice_number).toBe('20180001');
  });
  it('umožní použít uvolněné číslo při editaci a už ho znovu automaticky nepřidělí', async () => {
    const a = await service.saveDraft(db, actor, randomUUID(), draft());
    const first = await service.issue(db, actor, a.id, fakeRender);
    const b = await service.saveDraft(db, actor, randomUUID(), draft());
    const second = await service.issue(db, actor, b.id, fakeRender);
    expect((await removeRecord('invoice', first.id, first.version)).statusCode).toBe(200);
    const changed = await service.reviseInvoice(
      db,
      actor,
      second.id,
      second.version,
      draft('200'),
      first.invoice_number,
      fakeRender,
    );
    expect(changed.invoice_number).toBe('20260001');
    expect((await rows(db, 'SELECT * FROM released_invoice_numbers')).length).toBe(0);
    const c = await service.saveDraft(db, actor, randomUUID(), draft());
    expect((await service.issue(db, actor, c.id, fakeRender)).invoice_number).toBe('20260003');
  });
});

describe('PDF bez původní přílohy', () => {
  it('vytvoří jednu označenou kopii i při souběhu a nezmění údaje ani dopočet DPH', async () => {
    const draftRecord = await service.saveDraft(db, actor, randomUUID(), draft());
    const invoice = await service.issue(db, actor, draftRecord.id, fakeRender);
    await exec(db, 'DELETE FROM invoice_files WHERE invoice_id=?', [invoice.id]);
    await exec(
      db,
      "UPDATE invoices SET snapshot_origin='legacy_current_state_reconstruction',historical_vat_uncertain=1,vat=NULL,gross=NULL WHERE id=?",
      [invoice.id],
    );
    await exec(
      db,
      'UPDATE invoice_items SET vat_rate=NULL,vat=NULL,gross=NULL WHERE invoice_id=?',
      [invoice.id],
    );
    await applyInvoicePreferences(db, actor, 'standard-by-date');
    const before = await rows(db, 'SELECT * FROM invoices WHERE id=?', [invoice.id]);
    const items = await rows(db, 'SELECT * FROM invoice_items WHERE invoice_id=?', [invoice.id]);
    const tax = await rows(db, 'SELECT * FROM invoice_vat_adjustments WHERE invoice_id=?', [
      invoice.id,
    ]);
    const responses = await Promise.all(
      Array.from({ length: 4 }, () =>
        request('GET', '/api/invoices/' + invoice.id + '/pdf?download=1'),
      ),
    );
    expect(
      responses.every(
        (r) => r.statusCode === 200 && r.headers['content-type']?.includes('application/pdf'),
      ),
    ).toBe(true);
    expect(responses[0].headers['content-disposition']).toBe(
      'attachment; filename="' + invoice.invoice_number + '.pdf"',
    );
    expect(responses[0].rawPayload.toString()).toBe('%PDF-SYNTHETIC-FIXTURE');
    const files = await rows(db, 'SELECT * FROM invoice_files WHERE invoice_id=?', [invoice.id]);
    expect(files).toHaveLength(1);
    expect(files[0].kind).toBe('generated');
    expect(files[0].template_version).toMatch(/^reconstructed:/);
    expect(await rows(db, 'SELECT * FROM invoices WHERE id=?', [invoice.id])).toEqual(before);
    expect(await rows(db, 'SELECT * FROM invoice_items WHERE invoice_id=?', [invoice.id])).toEqual(
      items,
    );
    expect(
      await rows(db, 'SELECT * FROM invoice_vat_adjustments WHERE invoice_id=?', [invoice.id]),
    ).toEqual(tax);
    expect(
      (await rows(db, "SELECT * FROM audit_events WHERE action='invoice.pdf_reconstructed'"))
        .length,
    ).toBe(1);
  });
  it('při chybě vykreslení nic nepřepíše a bez doložené či potvrzené DPH nevymyslí částky', async () => {
    const d = await service.saveDraft(db, actor, randomUUID(), draft());
    expect((await request('GET', '/api/invoices/' + d.id + '/pdf')).statusCode).toBe(404);
    await service.issue(db, actor, d.id, fakeRender);
    await exec(db, 'DELETE FROM invoice_files WHERE invoice_id=?', [d.id]);
    await expect(
      service.ensureInvoicePdf(db, actor, d.id, async () => {
        throw new Error('MISSING_PDF_RENDER_FAIL');
      }),
    ).rejects.toThrow('MISSING_PDF_RENDER_FAIL');
    expect((await rows(db, 'SELECT * FROM invoice_files WHERE invoice_id=?', [d.id])).length).toBe(
      0,
    );
    await exec(db, 'UPDATE invoices SET vat=NULL,gross=NULL WHERE id=?', [d.id]);
    expect((await request('GET', '/api/invoices/' + d.id + '/pdf')).statusCode).toBe(422);
    expect((await rows(db, 'SELECT * FROM invoice_files WHERE invoice_id=?', [d.id])).length).toBe(
      0,
    );
  });
});

it('první správce vznikne jen jednou i při souběhu a má Argon2id', async () => {
  await clear(db);
  const result = await Promise.allSettled([
    createFirstAdmin(db, 'synthetic-one', password),
    createFirstAdmin(db, 'synthetic-two', password),
  ]);
  expect(result.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
  const users = await rows(db, 'SELECT * FROM users');
  expect(users).toHaveLength(1);
  expect(users[0].password_hash.startsWith('$argon2id$')).toBe(true);
  expect(await argon2.verify(users[0].password_hash, password)).toBe(true);
});

it('nevystaví návrh změněný po potvrzení v jiném požadavku', async () => {
  const d = await service.saveDraft(db, actor, randomUUID(), draft());
  const updated = await service.updateDraft(db, actor, d.id, d.version, draft('101'));
  await expect(service.issue(db, actor, d.id, fakeRender, d.version)).rejects.toThrow('změnil');
  const issued = await service.issue(db, actor, d.id, fakeRender, updated.version);
  expect(issued.net).toBe('101.00');
});
