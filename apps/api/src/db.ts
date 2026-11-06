import mysql, { type Pool, type PoolConnection } from 'mysql2/promise';
import { createHash } from 'node:crypto';
export type Db = Pool | PoolConnection;
export function poolFor(url: string) {
  const pool = mysql.createPool({
    uri: url,
    supportBigNumbers: true,
    bigNumberStrings: true,
    decimalNumbers: false,
    dateStrings: true,
    timezone: 'Z',
    multipleStatements: false,
    connectionLimit: 10,
    charset: 'utf8mb4',
  });
  pool.on('connection', (connection) => {
    connection.query("SET time_zone='+00:00'");
  });
  return pool;
}
export async function rows<T = any>(db: Db, sql: string, values: any[] = []): Promise<T[]> {
  const [r] = await db.query(sql, values);
  return r as T[];
}
export async function exec(db: Db, sql: string, values: any[] = []) {
  const [r] = await db.execute(sql, values);
  return r as mysql.ResultSetHeader;
}
export async function transaction<T>(db: Pool, fn: (tx: PoolConnection) => Promise<T>) {
  for (let attempt = 0; ; attempt++) {
    const tx = await db.getConnection();
    try {
      await tx.query('SET TRANSACTION ISOLATION LEVEL READ COMMITTED');
      await tx.beginTransaction();
      const result = await fn(tx);
      await tx.commit();
      return result;
    } catch (e) {
      await tx.rollback();
      if ((e as any).code !== 'ER_LOCK_DEADLOCK' || attempt >= 3) throw e;
    } finally {
      tx.release();
    }
    await new Promise((resolve) => setTimeout(resolve, 10 + Math.random() * 40));
  }
}
export const hash = (s: string | Buffer) => createHash('sha256').update(s).digest('hex');
export function json(value: any) {
  return typeof value === 'string' ? JSON.parse(value) : value;
}
export async function audit(
  db: Db,
  actor: string | null,
  action: string,
  type: string,
  entity: string | null,
) {
  await exec(
    db,
    'INSERT INTO audit_events (actor_id,action,entity_type,entity_id) VALUES (?,?,?,?)',
    [actor, action, type, entity],
  );
}
export class AppError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
export const missing = () => new AppError(404, 'Záznam nebyl nalezen.');
