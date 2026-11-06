import Fastify from 'fastify';
import cookie from '@fastify/cookie';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import staticFiles from '@fastify/static';
import { readFile } from 'node:fs/promises';
import { resolve, sep } from 'node:path';
import type { Pool } from 'mysql2/promise';
import { z, ZodError } from 'zod';
import {
  customerSchema,
  catalogSchema,
  supplierSchema,
  bankSchema,
  id,
  dateInput,
  invoiceSchema,
  rateInput,
} from '../../../packages/domain/index.js';
import { config } from './config.js';
import { rows, exec, transaction, audit, AppError, hash, missing } from './db.js';
import { registerAuth, requireUser } from './auth.js';
import { registerMcp, type TokenVerifier } from './mcp.js';
import * as service from './services.js';
import {
  deletionStartSchema,
  deletionFinishSchema,
  prepareDeletion,
  deleteRecord,
  rememberEdit,
  rememberRecord,
  invoiceHistory,
  historicalInvoiceFile,
} from './records.js';
import { renderInvoice, PdfLayoutError } from '../../../packages/pdf/index.js';
export async function buildApp(
  db: Pool,
  options: {
    staticRoot?: string;
    render?: (invoice: any) => Promise<{ path: string; sha256: string; version: string }>;
    mcp?: { enabled: boolean; verify: TokenVerifier };
    testRateLimitMax?: number;
  } = {},
) {
  const app = Fastify({
    logger: false,
    bodyLimit: 512 * 1024,
    trustProxy: config.TRUST_PROXY === 'loopback' ? ['127.0.0.1', '::1'] : false,
  });
  await app.register(cookie);
  await app.register(helmet, {
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'"],
        imgSrc: ["'self'", 'data:'],
        fontSrc: ["'self'"],
        connectSrc: ["'self'"],
        frameSrc: ["'self'"],
        objectSrc: ["'none'"],
        frameAncestors: ["'none'"],
        upgradeInsecureRequests: config.NODE_ENV === 'production' ? [] : null,
      },
    },
  });
  await app.register(rateLimit, {
    max: config.NODE_ENV === 'test' ? (options.testRateLimitMax ?? 120) : 120,
    timeWindow: 60000,
    errorResponseBuilder: () => ({
      statusCode: 429,
      message: 'Příliš mnoho požadavků. Zkuste to později.',
    }),
  });
  app.setErrorHandler((error, _req, reply) => {
    if (error instanceof PdfLayoutError) return reply.code(422).send({ message: error.message });
    if (error instanceof ZodError)
      return reply.code(400).send({
        message: 'Zkontrolujte formulář.',
        fields: error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
      });
    if (error instanceof AppError) return reply.code(error.status).send({ message: error.message });
    if ((error as any).statusCode === 429)
      return reply.code(429).send({ message: 'Příliš mnoho požadavků. Zkuste to později.' });
    return reply.code(500).send({ message: 'Operaci se nepodařilo dokončit.' });
  });
  app.get('/health/live', async () => ({ ok: true }));
  app.get('/health/ready', async () => {
    await rows(db, 'SELECT 1');
    return { ok: true, sha: config.DEPLOY_SHA };
  });
  await registerAuth(app, db);
  await registerMcp(app, db, options.mcp);
  app.post('/api/deletions/prepare', async (req) =>
    prepareDeletion(db, requireUser(req), deletionStartSchema.parse(req.body)),
  );
  for (const [path, entity] of [
    ['invoices', 'invoice'],
    ['customers', 'customer'],
    ['catalog', 'catalog'],
    ['settings/banks', 'bank'],
    ['settings/supplier', 'supplier'],
  ] as const)
    app.delete('/api/' + path + '/:id', async (req) =>
      deleteRecord(
        db,
        requireUser(req),
        entity,
        id.parse((req.params as any).id),
        deletionFinishSchema.parse(req.body),
      ),
    );
  app.get('/api/invoices/:id/history', async (req) =>
    invoiceHistory(db, id.parse((req.params as any).id)),
  );
  app.get('/api/invoices/:id/history/:historyId/pdf', async (req, reply) => {
    const invoiceId = id.parse((req.params as any).id),
      historyId = id.parse((req.params as any).historyId);
    const file = await historicalInvoiceFile(db, invoiceId, historyId);
    return servePdf(file, file.invoice_number, req, reply);
  });
  app.get('/api/invoices', async (req) => service.listInvoices(db, req.query));
  app.get('/api/invoices/:id', async (req) => service.detail(db, id.parse((req.params as any).id)));
  app.post('/api/invoices', async (req) =>
    service.saveDraft(
      db,
      requireUser(req),
      z.string().uuid().parse(req.headers['idempotency-key']),
      invoiceSchema.parse(req.body),
    ),
  );
  app.put('/api/invoices/:id', async (req) => {
    const body = z
      .object({
        version: z.number().int().min(1),
        data: invoiceSchema,
        revision: z.literal(true).optional(),
        invoice_number: z
          .string()
          .regex(/^\d{1,10}$/)
          .optional(),
      })
      .strict()
      .parse(req.body);
    if (body.revision) {
      if (!body.invoice_number) throw new AppError(400, 'Vyplňte číslo faktury.');
      return service.reviseInvoice(
        db,
        requireUser(req),
        id.parse((req.params as any).id),
        body.version,
        body.data,
        body.invoice_number,
        options.render ?? ((i) => renderInvoice(i, config.STORAGE_DIR)),
      );
    }
    return service.updateDraft(
      db,
      requireUser(req),
      id.parse((req.params as any).id),
      body.version,
      body.data,
    );
  });
  app.post('/api/invoices/:id/issue', async (req) =>
    service.issue(
      db,
      requireUser(req),
      id.parse((req.params as any).id),
      options.render ?? ((i) => renderInvoice(i, config.STORAGE_DIR)),
      z
        .object({ version: z.number().int().min(1) })
        .strict()
        .parse(req.body).version,
    ),
  );
  app.post('/api/invoices/:id/duplicate', async (req) => {
    const d = await service.detail(db, id.parse((req.params as any).id));
    return {
      customer_id: String(d.customer_id),
      bank_account_id: String(d.bank_account_id),
      currency: d.currency,
      items: d.items.map((i: any) => ({
        description: i.description,
        price: i.price,
        quantity: i.quantity,
        vat_rate: i.vat_rate ?? '0',
        unit: i.unit,
      })),
      requires_review: !!d.historical_vat_uncertain && d.confirmed_vat_rate == null,
    };
  });
  app.post('/api/invoices/:id/payment', async (req) => {
    const v = z
      .object({ paid: z.boolean(), date: dateInput.nullable().default(null) })
      .strict()
      .parse(req.body);
    return service.payment(db, requireUser(req), id.parse((req.params as any).id), v.paid, v.date);
  });
  app.post('/api/invoices/:id/void', async (req) =>
    transaction(db, async (tx) => {
      const invoiceId = id.parse((req.params as any).id);
      const r = await exec(
        tx,
        "UPDATE invoices SET status='void',version=version+1 WHERE id=? AND status='issued' AND deleted_at IS NULL",
        [invoiceId],
      );
      if (!r.affectedRows) throw new AppError(409, 'Doklad nelze stornovat.');
      await audit(tx, requireUser(req), 'invoice.void', 'invoice', invoiceId);
      return { ok: true };
    }),
  );
  async function servePdf(f: any, invoiceNumber: string, req: any, reply: any) {
    if (!/^\d{1,32}$/.test(invoiceNumber)) throw missing();
    const path = resolve(config.STORAGE_DIR, f.relative_path);
    if (!path.startsWith(config.STORAGE_DIR + sep)) throw missing();
    const bytes = await readFile(path);
    if (hash(bytes) !== f.sha256) throw new AppError(409, 'Kontrola integrity souboru selhala.');
    reply
      .type('application/pdf')
      .header(
        'Content-Security-Policy',
        "default-src 'none'; frame-ancestors 'self'; base-uri 'none'",
      )
      .header(
        'Content-Disposition',
        `${(req.query as any).download === '1' ? 'attachment' : 'inline'}; filename="${invoiceNumber}.pdf"`,
      )
      .header('Cache-Control', 'private, no-store');
    return bytes;
  }
  app.get('/api/invoices/:id/pdf', async (req, reply) => {
    const invoiceId = id.parse((req.params as any).id);
    const f = await service.ensureInvoicePdf(
      db,
      requireUser(req),
      invoiceId,
      options.render ?? ((i) => renderInvoice(i, config.STORAGE_DIR)),
    );
    return servePdf(f, f.invoice_number, req, reply);
  });
  app.get('/api/customers', async (req) => {
    const q = z
      .object({
        q: z.string().max(200).default(''),
        archived: z.enum(['true', 'false']).default('false'),
      })
      .strict()
      .parse(req.query);
    return (
      await rows(
        db,
        'SELECT * FROM customers WHERE deleted_at IS NULL AND archived=? AND (company LIKE ? OR ico LIKE ? OR dic LIKE ?) ORDER BY company,id',
        [q.archived === 'true', ...Array(3).fill('%' + q.q + '%')],
      )
    ).map((c) => ({
      ...c,
      id: String(c.id),
      end_customer: !!c.end_customer,
      archived: !!c.archived,
    }));
  });
  app.post('/api/customers', async (req) =>
    transaction(db, async (tx) => {
      const c = customerSchema.parse(req.body);
      await exec(
        tx,
        'INSERT INTO customers(company,street,street_number,city,zip,country,ico,dic,payment_id,end_customer,archived) VALUES(?,?,?,?,?,?,?,?,?,?,?)',
        Object.values(c),
      );
      const [{ id }] = await rows(tx, 'SELECT CAST(LAST_INSERT_ID() AS CHAR) id');
      await audit(tx, requireUser(req), 'customer.create', 'customer', id);
      return { id, ...c, version: 1 };
    }),
  );
  app.put('/api/customers/:id', async (req) =>
    transaction(db, async (tx) => {
      const c = z
          .object({ version: z.number().int(), data: customerSchema })
          .strict()
          .parse(req.body),
        recordId = id.parse((req.params as any).id);
      await rememberEdit(tx, requireUser(req), 'customer', recordId, c.version);
      const r = await exec(
        tx,
        'UPDATE customers SET company=?,street=?,street_number=?,city=?,zip=?,country=?,ico=?,dic=?,payment_id=?,end_customer=?,archived=?,version=version+1 WHERE id=? AND version=?',
        [...Object.values(c.data), recordId, c.version],
      );
      if (!r.affectedRows) throw new AppError(409, 'Kontakt změnil jiný požadavek.');
      await audit(tx, requireUser(req), 'customer.update', 'customer', recordId);
      return { id: recordId, ...c.data, version: c.version + 1 };
    }),
  );
  app.post('/api/ares', async (req) => {
    const { ico } = z
      .object({ ico: z.string().regex(/^\d{8}$/) })
      .strict()
      .parse(req.body);
    try {
      const r = await fetch(
        'https://ares.gov.cz/ekonomicke-subjekty-v-be/rest/ekonomicke-subjekty/' + ico,
        {
          signal: AbortSignal.timeout(5000),
          redirect: 'error',
          headers: { Accept: 'application/json' },
        },
      );
      if (!r.ok) throw new Error();
      const d = (await r.json()) as any;
      if (d.ico !== ico) throw new Error();
      return {
        company: String(d.obchodniJmeno ?? ''),
        ico,
        dic: String(d.dic ?? ''),
        street: String(d.sidlo?.nazevUlice ?? ''),
        street_number: [d.sidlo?.cisloDomovni, d.sidlo?.cisloOrientacni]
          .filter((x) => x !== undefined)
          .join('/'),
        city: String(d.sidlo?.nazevObce ?? ''),
        zip: String(d.sidlo?.psc ?? ''),
        country: String(d.sidlo?.nazevStatu ?? ''),
      };
    } catch {
      throw new AppError(
        502,
        'ARES není dostupný nebo IČO nebylo nalezeno. Údaje můžete vyplnit ručně.',
      );
    }
  });
  app.get('/api/catalog', async () =>
    (
      await rows(
        db,
        'SELECT * FROM catalog_items WHERE deleted_at IS NULL ORDER BY active DESC,name,id',
      )
    ).map((c) => ({
      ...c,
      id: String(c.id),
      active: !!c.active,
    })),
  );
  app.post('/api/catalog', async (req) =>
    transaction(db, async (tx) => {
      const c = catalogSchema.parse(req.body);
      await exec(
        tx,
        'INSERT INTO catalog_items(name,description,unit,price,vat_rate,currency,active) VALUES(?,?,?,?,?,?,?)',
        Object.values(c),
      );
      const [{ id }] = await rows(tx, 'SELECT CAST(LAST_INSERT_ID() AS CHAR) id');
      await audit(tx, requireUser(req), 'catalog.create', 'catalog', id);
      return { id, ...c, version: 1 };
    }),
  );
  app.put('/api/catalog/:id', async (req) =>
    transaction(db, async (tx) => {
      const c = z
          .object({ version: z.number().int(), data: catalogSchema })
          .strict()
          .parse(req.body),
        recordId = id.parse((req.params as any).id);
      await rememberEdit(tx, requireUser(req), 'catalog', recordId, c.version);
      const r = await exec(
        tx,
        'UPDATE catalog_items SET name=?,description=?,unit=?,price=?,vat_rate=?,currency=?,active=?,version=version+1 WHERE id=? AND version=?',
        [...Object.values(c.data), recordId, c.version],
      );
      if (!r.affectedRows) throw new AppError(409, 'Položka se změnila.');
      await audit(tx, requireUser(req), 'catalog.update', 'catalog', recordId);
      return { id: recordId, ...c.data, version: c.version + 1 };
    }),
  );
  app.get('/api/settings', async () => ({
    ...(await service.settings(db)),
    mcp_enabled: config.MCP_ENABLED === 'true',
  }));
  app.put('/api/settings/supplier', async (req) =>
    transaction(db, async (tx) => {
      const c = z
        .object({ data: supplierSchema, vat_rate: rateInput, version: z.number().int().min(0) })
        .strict()
        .parse(req.body);
      const [old] = await rows(
        tx,
        'SELECT * FROM supplier_profiles WHERE deleted_at IS NULL ORDER BY id LIMIT 1 FOR UPDATE',
      );
      if (old) {
        if (c.version !== old.version) throw new AppError(409, 'Nastavení se změnilo.');
        await rememberRecord(tx, requireUser(req), 'supplier', old, 'edit');
        await exec(
          tx,
          'UPDATE supplier_profiles SET data_json=?,vat_rate=?,version=version+1 WHERE id=?',
          [JSON.stringify(c.data), c.vat_rate, String(old.id)],
        );
      } else {
        if (c.version !== 0) throw new AppError(409, 'Dodavatel se změnil. Obnovte nastavení.');
        await exec(tx, 'INSERT INTO supplier_profiles(data_json,vat_rate) VALUES(?,?)', [
          JSON.stringify(c.data),
          c.vat_rate,
        ]);
      }
      await audit(
        tx,
        requireUser(req),
        'settings.supplier',
        'supplier',
        old ? String(old.id) : null,
      );
      return service.settings(tx);
    }),
  );
  app.post('/api/settings/banks', async (req) =>
    transaction(db, async (tx) => {
      const b = bankSchema.parse(req.body);
      await exec(
        tx,
        'INSERT INTO bank_accounts(label,account_number,bank_code,variant,active) VALUES(?,?,?,?,?)',
        Object.values(b),
      );
      await audit(tx, requireUser(req), 'settings.bank_create', 'bank', null);
      return service.settings(tx);
    }),
  );
  app.put('/api/settings/banks/:id', async (req) =>
    transaction(db, async (tx) => {
      const c = z.object({ version: z.number().int(), data: bankSchema }).strict().parse(req.body),
        recordId = id.parse((req.params as any).id);
      await rememberEdit(tx, requireUser(req), 'bank', recordId, c.version);
      const r = await exec(
        tx,
        'UPDATE bank_accounts SET label=?,account_number=?,bank_code=?,variant=?,active=?,version=version+1 WHERE id=? AND version=?',
        [...Object.values(c.data), recordId, c.version],
      );
      if (!r.affectedRows) throw new AppError(409, 'Účet se změnil.');
      await audit(tx, requireUser(req), 'settings.bank_update', 'bank', recordId);
      return service.settings(tx);
    }),
  );
  app.get('/api/audit', async () =>
    rows(
      db,
      'SELECT a.id,a.action,a.entity_type,a.entity_id,a.created_at,u.username actor FROM audit_events a LEFT JOIN users u ON u.id=a.actor_id ORDER BY a.id DESC LIMIT 100',
    ),
  );
  app.post('/api/mcp/revoke', async (req) => {
    const v = z
      .object({ jti: z.string().min(1).max(200), expires_at: dateInput })
      .strict()
      .parse(req.body);
    await exec(db, 'INSERT IGNORE INTO revoked_mcp_tokens(jti_hash,expires_at) VALUES(?,?)', [
      hash(v.jti),
      v.expires_at + ' 23:59:59',
    ]);
    await audit(db, requireUser(req), 'mcp.revoke', 'mcp', null);
    return { ok: true };
  });
  if (options.staticRoot) {
    await app.register(staticFiles, { root: options.staticRoot });
    app.setNotFoundHandler(async (req, reply) => {
      if (req.url.startsWith('/api/') || req.url.startsWith('/mcp') || req.url.startsWith('/.'))
        return reply.code(404).send({ message: 'Nenalezeno.' });
      reply.type('text/html');
      return readFile(resolve(options.staticRoot!, 'index.html'));
    });
  }
  return app;
}
