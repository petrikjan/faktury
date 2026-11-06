import type { Pool } from 'mysql2/promise';
import { rows } from '../apps/api/src/db.js';
export async function clear(db: Pool) {
  const tx = await db.getConnection();
  try {
    const [{ db: name }] = await rows(tx, 'SELECT DATABASE() db');
    if (!name.endsWith('_test')) throw new Error('TEST_DB_ONLY');
    const tables = await rows(tx, 'SHOW TABLES');
    await tx.query('SET FOREIGN_KEY_CHECKS=0');
    for (const t of tables) {
      const table = String(Object.values(t)[0]);
      if (table !== 'schema_migrations') {
        if (!/^[a-z_]+$/.test(table)) throw new Error('TABLE_NAME');
        await tx.query('TRUNCATE TABLE `' + table + '`');
      }
    }
  } finally {
    await tx.query('SET FOREIGN_KEY_CHECKS=1');
    tx.release();
  }
}
