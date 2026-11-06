import 'dotenv/config';
import { existsSync, readFileSync } from 'node:fs';
const local = existsSync('.private/test-env.json')
  ? JSON.parse(readFileSync('.private/test-env.json', 'utf8'))
  : {};
process.env.DATABASE_URL =
  process.env.TEST_DATABASE_URL ??
  local.DATABASE_URL ??
  process.env.DATABASE_URL?.replace(/\/[^/?]+(?:\?.*)?$/, '/faktury_test');
if (!process.env.DATABASE_URL || !new URL(process.env.DATABASE_URL).pathname.endsWith('_test'))
  throw new Error('TEST_DATABASE_URL musí ukazovat do izolované databáze _test.');
process.env.NODE_ENV = 'test';
process.env.APP_ORIGIN = 'http://localhost:5173';
process.env.STORAGE_DIR = '.private/test-storage';
process.env.MCP_ENABLED = 'false';
