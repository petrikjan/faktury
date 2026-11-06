import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from 'jose';
import { z } from 'zod';
import type { FastifyInstance } from 'fastify';
import type { Pool } from 'mysql2/promise';
import { config } from './config.js';
import { rows, hash, AppError } from './db.js';
export type TokenVerifier = (token: string) => Promise<{ jti: string; exp: number; scope: string }>;
export function createMcpServer(origin: string) {
  const server = new McpServer(
    { name: 'faktury-private-navigation', version: '1.0.0' },
    { capabilities: { tools: {} } },
  );
  server.registerTool(
    'technical_status',
    {
      title: 'Technický stav',
      description: 'Statický stav služby bez diagnostiky nebo obchodních údajů.',
      inputSchema: z.object({}).strict(),
      annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
    },
    async () => ({
      content: [
        { type: 'text', text: 'Služba je dostupná. Obchodní data se přes MCP neposkytují.' },
      ],
    }),
  );
  server.registerTool(
    'open_application',
    {
      title: 'Otevřít chráněnou aplikaci',
      description: 'Vrátí statický odkaz. Konkrétní údaje vybírá uživatel v přihlášeném webu.',
      inputSchema: z
        .object({ page: z.enum(['invoices', 'new', 'customers', 'reports']).default('invoices') })
        .strict(),
      annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
    },
    async ({ page }) => ({
      content: [
        {
          type: 'text',
          text:
            origin +
            {
              invoices: '/invoices',
              new: '/invoices/new',
              customers: '/customers',
              reports: '/reports',
            }[page],
        },
      ],
    }),
  );
  return server;
}
function verifier(): TokenVerifier {
  if (
    !config.MCP_ISSUER.startsWith('https://') ||
    !config.MCP_JWKS_URL.startsWith('https://') ||
    !config.MCP_AUDIENCE
  )
    throw new Error('MCP vyžaduje ověřený OAuth server.');
  const jwks = createRemoteJWKSet(new URL(config.MCP_JWKS_URL), { timeoutDuration: 5000 });
  return jwtTokenVerifier(jwks, config.MCP_ISSUER, config.MCP_AUDIENCE);
}
export function jwtTokenVerifier(
  jwks: JWTVerifyGetKey,
  issuer: string,
  audience: string,
): TokenVerifier {
  return async (token) => {
    const { payload } = await jwtVerify(token, jwks, {
      issuer,
      audience,
      algorithms: ['RS256', 'ES256'],
      requiredClaims: ['exp', 'iat', 'sub', 'jti'],
      clockTolerance: 5,
    });
    if (
      !payload.exp ||
      !payload.iat ||
      payload.exp - payload.iat > 900 ||
      typeof payload.jti !== 'string' ||
      typeof payload.scope !== 'string'
    )
      throw new Error('invalid');
    return { jti: payload.jti, exp: payload.exp, scope: payload.scope };
  };
}
export async function registerMcp(
  app: FastifyInstance,
  db: Pool,
  options: { enabled?: boolean; verify?: TokenVerifier } = {},
) {
  const enabled = options.enabled ?? config.MCP_ENABLED === 'true';
  const verify = enabled ? (options.verify ?? verifier()) : null;
  app.get('/.well-known/oauth-protected-resource', async (_req, reply) =>
    enabled
      ? {
          resource: config.MCP_AUDIENCE,
          authorization_servers: [config.MCP_ISSUER],
          scopes_supported: ['navigation:read'],
          bearer_methods_supported: ['header'],
        }
      : reply.code(404).send({ message: 'Nenalezeno.' }),
  );
  app.all('/mcp', { config: { rateLimit: { max: 30, timeWindow: 60000 } } }, async (req, reply) => {
    if (!enabled) return reply.code(404).send({ message: 'Nenalezeno.' });
    if (req.hostname !== new URL(config.APP_ORIGIN).hostname)
      throw new AppError(403, 'Požadavek byl odmítnut.');
    const auth = req.headers.authorization;
    try {
      if (!auth?.startsWith('Bearer ') || auth.length > 8192) throw new Error('invalid');
      const claims = await verify!(auth.slice(7));
      if (
        claims.exp <= Date.now() / 1000 ||
        claims.scope !== 'navigation:read' ||
        (await rows(db, 'SELECT 1 FROM revoked_mcp_tokens WHERE jti_hash=?', [hash(claims.jti)]))
          .length
      )
        throw new Error('invalid');
    } catch {
      reply.header(
        'WWW-Authenticate',
        `Bearer resource_metadata="${config.APP_ORIGIN}/.well-known/oauth-protected-resource", scope="navigation:read"`,
      );
      return reply.code(401).send({ message: 'Autorizace je vyžadována.' });
    }
    if (req.method !== 'POST') return reply.code(405).send({ message: 'Použijte POST.' });
    const body = req.body as any;
    const safeId =
      typeof body?.id === 'number'
        ? body.id
        : typeof body?.id === 'string' && /^[a-zA-Z0-9_-]{1,64}$/.test(body.id)
          ? body.id
          : null;
    const invalid = () =>
      reply.code(200).send({
        jsonrpc: '2.0',
        id: safeId,
        error: { code: -32602, message: 'Nepovolený požadavek.' },
      });
    if (
      !body ||
      Array.isArray(body) ||
      body.jsonrpc !== '2.0' ||
      (body.id !== undefined && safeId === null)
    )
      return invalid();
    if (
      !['initialize', 'notifications/initialized', 'ping', 'tools/list', 'tools/call'].includes(
        body.method,
      )
    )
      return invalid();
    if (body.method === 'tools/call') {
      const { name, arguments: args = {} } = body.params ?? {};
      if (name === 'technical_status') {
        if (!z.object({}).strict().safeParse(args).success) return invalid();
      } else if (name === 'open_application') {
        if (
          !z
            .object({ page: z.enum(['invoices', 'new', 'customers', 'reports']).optional() })
            .strict()
            .safeParse(args).success
        )
          return invalid();
      } else return invalid();
      if (Object.keys(body.params).some((k) => !['name', 'arguments'].includes(k)))
        return invalid();
    }
    const server = createMcpServer(config.APP_ORIGIN);
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableJsonResponse: true,
    });
    reply.hijack();
    try {
      await server.connect(transport);
      await transport.handleRequest(req.raw, reply.raw, body);
    } catch {
      if (!reply.raw.headersSent) {
        reply.raw.writeHead(500, { 'Content-Type': 'application/json' });
        reply.raw.end(
          JSON.stringify({
            jsonrpc: '2.0',
            id: safeId,
            error: { code: -32603, message: 'Služba je dočasně nedostupná.' },
          }),
        );
      }
    } finally {
      await transport.close();
      await server.close();
    }
  });
}
