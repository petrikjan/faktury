import 'dotenv/config';
import { resolve } from 'node:path';
import { z } from 'zod';
const env = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    HOST: z.string().default('127.0.0.1'),
    PORT: z.coerce.number().int().default(3100),
    APP_ORIGIN: z.string().url().default('http://localhost:5173'),
    DATABASE_URL: z.string().min(1),
    STORAGE_DIR: z.string().default('.private/storage'),
    SESSION_HOURS: z.coerce.number().min(1).max(24).default(8),
    TRUST_PROXY: z.enum(['false', 'loopback']).default('false'),
    DEPLOY_SHA: z.string().default('local'),
    PDF_REVIEW_APPROVED: z.enum(['false', 'true']).default('false'),
    PDF_BROWSER_CHANNEL: z.enum(['chrome', 'chromium']).default('chrome'),
    MCP_ENABLED: z.enum(['true', 'false']).default('false'),
    MCP_ISSUER: z.string().default(''),
    MCP_AUDIENCE: z.string().default(''),
    MCP_JWKS_URL: z.string().default(''),
  })
  .parse(process.env);
if (
  env.NODE_ENV === 'production' &&
  (!env.APP_ORIGIN.startsWith('https://') ||
    !/^[a-f0-9]{40}$/.test(env.DEPLOY_SHA) ||
    env.PDF_REVIEW_APPROVED !== 'true')
)
  throw new Error('Neplatné provozní nastavení.');
export const config = { ...env, STORAGE_DIR: resolve(env.STORAGE_DIR) };
