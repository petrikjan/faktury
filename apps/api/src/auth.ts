import { randomBytes, timingSafeEqual } from 'node:crypto';
import argon2 from 'argon2';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { Pool } from 'mysql2/promise';
import { z } from 'zod';
import { config } from './config.js';
import { hash, rows, exec, audit, AppError, transaction } from './db.js';
declare module 'fastify' {
  interface FastifyRequest {
    auth: { id: string; username: string; tokenHash: string } | null;
  }
}
const cookieOptions = {
  httpOnly: true,
  secure: config.NODE_ENV === 'production',
  sameSite: 'strict' as const,
  path: '/',
};
const token = () => randomBytes(32).toString('base64url');
export async function registerAuth(app: FastifyInstance, db: Pool) {
  app.decorateRequest('auth', null);
  app.addHook('onRequest', async (req, reply) => {
    reply.header('Cache-Control', 'private, no-store');
    const origin = req.headers.origin;
    if (origin && origin !== config.APP_ORIGIN) throw new AppError(403, 'Požadavek byl odmítnut.');
    const cookie = req.cookies.sid;
    if (cookie && /^[\w-]{43}$/.test(cookie)) {
      const [s] = await rows(
        db,
        'SELECT u.id,u.username,s.token_hash,s.csrf_hash FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=? AND s.expires_at>UTC_TIMESTAMP(6)',
        [hash(cookie)],
      );
      if (s) req.auth = { id: String(s.id), username: s.username, tokenHash: s.token_hash };
    }
    if (
      req.url.startsWith('/api/') &&
      !['/api/login', '/api/session'].includes(req.url.split('?')[0]) &&
      !req.auth
    )
      throw new AppError(401, 'Přihlaste se.');
    if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method) && !req.url.startsWith('/mcp')) {
      if (origin !== config.APP_ORIGIN) throw new AppError(403, 'Požadavek byl odmítnut.');
      if (req.url !== '/api/login') {
        if (!req.auth) throw new AppError(401, 'Přihlaste se.');
        const csrf = req.headers['x-csrf-token'];
        const [s] = await rows(db, 'SELECT csrf_hash FROM sessions WHERE token_hash=?', [
          req.auth.tokenHash,
        ]);
        if (
          typeof csrf !== 'string' ||
          csrf.length > 200 ||
          !s ||
          !timingSafeEqual(Buffer.from(hash(csrf)), Buffer.from(s.csrf_hash))
        )
          throw new AppError(403, 'Obnovte stránku a opakujte požadavek.');
      }
    }
  });
  app.get('/api/session', async (req) => ({
    user: req.auth ? { id: req.auth.id, username: req.auth.username } : null,
    csrf: req.auth ? req.cookies.csrf : null,
  }));
  const dummy = await argon2.hash(randomBytes(32), {
    type: argon2.argon2id,
    memoryCost: 65536,
    timeCost: 3,
    parallelism: 1,
  });
  app.post(
    '/api/login',
    { config: { rateLimit: { max: 5, timeWindow: 15 * 60 * 1000 } } },
    async (req, reply) => {
      const input = z
        .object({ username: z.string().min(1).max(80), password: z.string().min(1).max(200) })
        .strict()
        .parse(req.body);
      const [user] = await rows(
        db,
        'SELECT id,password_hash,username FROM users WHERE username=?',
        [input.username],
      );
      const valid = await argon2
        .verify(user?.password_hash ?? dummy, input.password)
        .catch(() => false);
      if (!user || !valid) throw new AppError(401, 'Nesprávné přihlašovací údaje.');
      const sid = token(),
        csrf = token();
      await transaction(db, async (tx) => {
        if (req.cookies.sid)
          await exec(tx, 'DELETE FROM sessions WHERE token_hash=?', [hash(req.cookies.sid)]);
        await exec(tx, 'DELETE FROM sessions WHERE expires_at<=UTC_TIMESTAMP(6)');
        await exec(
          tx,
          'INSERT INTO sessions(token_hash,user_id,csrf_hash,expires_at) VALUES(?,?,?,DATE_ADD(UTC_TIMESTAMP(6),INTERVAL ? HOUR))',
          [hash(sid), String(user.id), hash(csrf), config.SESSION_HOURS],
        );
        await audit(tx, String(user.id), 'auth.login', 'user', String(user.id));
      });
      reply.setCookie('sid', sid, { ...cookieOptions, maxAge: config.SESSION_HOURS * 3600 });
      reply.setCookie('csrf', csrf, {
        ...cookieOptions,
        httpOnly: false,
        maxAge: config.SESSION_HOURS * 3600,
      });
      return { user: { id: String(user.id), username: user.username }, csrf };
    },
  );
  app.post('/api/logout', async (req, reply) => {
    await exec(db, 'DELETE FROM sessions WHERE token_hash=?', [req.auth!.tokenHash]);
    reply
      .clearCookie('sid', cookieOptions)
      .clearCookie('csrf', { ...cookieOptions, httpOnly: false });
    return { ok: true };
  });
  app.post('/api/password', async (req, reply) => {
    const v = z
      .object({
        current: z.string().max(200),
        next: z.string().min(12, 'Použijte alespoň 12 znaků.').max(200),
      })
      .strict()
      .parse(req.body);
    const [u] = await rows(db, 'SELECT password_hash FROM users WHERE id=?', [req.auth!.id]);
    if (!(await argon2.verify(u.password_hash, v.current)))
      throw new AppError(400, 'Nesprávné heslo.');
    const passwordHash = await argon2.hash(v.next, {
      type: argon2.argon2id,
      memoryCost: 65536,
      timeCost: 3,
      parallelism: 1,
    });
    await transaction(db, async (tx) => {
      await exec(tx, 'UPDATE users SET password_hash=? WHERE id=?', [passwordHash, req.auth!.id]);
      await exec(tx, 'DELETE FROM sessions WHERE user_id=?', [req.auth!.id]);
      await audit(tx, req.auth!.id, 'auth.password_change', 'user', req.auth!.id);
    });
    reply
      .clearCookie('sid', cookieOptions)
      .clearCookie('csrf', { ...cookieOptions, httpOnly: false });
    return { ok: true };
  });
}
export const requireUser = (req: FastifyRequest) => {
  if (!req.auth) throw new AppError(401, 'Přihlaste se.');
  return req.auth.id;
};
