import { beforeAll, beforeEach, afterAll, it, expect } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { createMcpServer } from '../apps/api/src/mcp.js';
import { buildApp } from '../apps/api/src/app.js';
import { config } from '../apps/api/src/config.js';
import { poolFor, exec, hash } from '../apps/api/src/db.js';
import { migrate } from '../scripts/db.js';
import { clear } from './helpers.js';
const db = poolFor(config.DATABASE_URL);
let app: Awaited<ReturnType<typeof buildApp>>;
const canary = 'SYNTHETIC_PRIVATE_CANARY_42761';
beforeAll(async () => {
  await migrate(db);
});
beforeEach(async () => {
  await clear(db);
  if (app) await app.close();
  app = await buildApp(db, {
    mcp: {
      enabled: true,
      verify: async (token) => {
        if (token !== 'synthetic-valid') throw new Error(canary);
        return {
          jti: 'synthetic-jti',
          exp: Math.floor(Date.now() / 1000) + 100,
          scope: 'navigation:read',
        };
      },
    },
  });
});
afterAll(async () => {
  await app?.close();
  await db.end();
});
it('skutečný MCP SDK obslouží tools/list a tools/call s pevnou navigační hranicí', async () => {
  const server = createMcpServer('https://example.test'),
    client = new Client({ name: 'synthetic-test', version: '1' });
  const [a, b] = InMemoryTransport.createLinkedPair();
  await server.connect(a);
  await client.connect(b);
  const tools = await client.listTools();
  expect(tools.tools.map((t) => t.name).sort()).toEqual(['open_application', 'technical_status']);
  const result = await client.callTool({ name: 'open_application', arguments: { page: 'new' } });
  expect(JSON.stringify(result)).toContain('https://example.test/invoices/new');
  expect(JSON.stringify(tools) + JSON.stringify(result)).not.toContain(canary);
  await client.close();
  await server.close();
});
const call = (body: any, token = 'synthetic-valid', headers: any = {}) =>
  app.inject({
    method: 'POST',
    url: '/mcp',
    headers: {
      host: 'localhost:5173',
      authorization: 'Bearer ' + token,
      accept: 'application/json, text/event-stream',
      'content-type': 'application/json',
      ...headers,
    },
    payload: body,
  });
it('Streamable HTTP odmítne chybějící autorizaci, revokaci, cizí Host a neznámé argumenty bez úniku canary', async () => {
  let r = await call({ jsonrpc: '2.0', id: 1, method: 'tools/list' }, canary);
  expect(r.statusCode).toBe(401);
  expect(r.body).not.toContain(canary);
  r = await call({
    jsonrpc: '2.0',
    id: 2,
    method: 'tools/call',
    params: { name: 'open_application', arguments: { page: 'new', customer: canary } },
  });
  expect(r.statusCode).toBe(200);
  expect(r.json().error.code).toBe(-32602);
  expect(r.body).not.toContain(canary);
  r = await call({
    jsonrpc: '2.0',
    id: 3,
    method: 'tools/call',
    params: { name: canary, arguments: {} },
  });
  expect(r.body).not.toContain(canary);
  r = await call({ jsonrpc: '2.0', id: 4, method: 'tools/list' }, 'synthetic-valid', {
    host: 'evil.example',
  });
  expect(r.statusCode).toBe(403);
  await exec(
    db,
    'INSERT INTO revoked_mcp_tokens(jti_hash,expires_at) VALUES(?,DATE_ADD(UTC_TIMESTAMP(),INTERVAL 1 HOUR))',
    [hash('synthetic-jti')],
  );
  expect((await call({ jsonrpc: '2.0', id: 5, method: 'tools/list' })).statusCode).toBe(401);
});
it('HTTP initialize a nástroj vrátí jen schválená pole', async () => {
  const init = await call({
    jsonrpc: '2.0',
    id: 1,
    method: 'initialize',
    params: {
      protocolVersion: '2025-11-25',
      capabilities: {},
      clientInfo: { name: 'synthetic', version: '1' },
    },
  });
  expect(init.statusCode).toBe(200);
  expect(init.json().result.serverInfo.name).toBe('faktury-private-navigation');
  const r = await call({ jsonrpc: '2.0', id: 2, method: 'tools/list' });
  expect(r.statusCode).toBe(200);
  expect(r.json().result.tools.length).toBe(2);
});
