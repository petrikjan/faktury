import { resolve } from 'node:path';
import { existsSync } from 'node:fs';
import { config } from './config.js';
import { poolFor } from './db.js';
import { buildApp } from './app.js';
const db = poolFor(config.DATABASE_URL);
const root = resolve('dist/web');
const app = await buildApp(db, { staticRoot: existsSync(root) ? root : undefined });
await app.listen({ host: config.HOST, port: config.PORT });
console.info(`Fakturace: http://${config.HOST}:${config.PORT}`);
for (const signal of ['SIGINT', 'SIGTERM'])
  process.on(signal, async () => {
    await app.close();
    await db.end();
    process.exit(0);
  });
