import 'dotenv/config';
import { readdir, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import argon2 from 'argon2';
import type { Pool } from 'mysql2/promise';
import { poolFor, rows, exec, hash, transaction } from '../apps/api/src/db.js';
export async function migrate(db: Pool) {
  const conn = await db.getConnection();
  try {
    const [lock] = await rows(conn, "SELECT GET_LOCK('faktury-schema-migration',30) acquired");
    if (lock.acquired !== 1) throw new Error('Migraci uzamkl jiný proces.');
    await exec(
      conn,
      'CREATE TABLE IF NOT EXISTS schema_migrations(name VARCHAR(100) PRIMARY KEY, checksum CHAR(64) NOT NULL, applied_at DATETIME(6) DEFAULT CURRENT_TIMESTAMP(6)) ENGINE=InnoDB',
    );
    for (const name of (await readdir('db/migrations')).filter((n) => n.endsWith('.sql')).sort()) {
      const sql = await readFile(resolve('db/migrations', name), 'utf8'),
        checksum = hash(sql);
      const [old] = await rows(conn, 'SELECT checksum FROM schema_migrations WHERE name=?', [name]);
      if (old) {
        if (old.checksum !== checksum)
          throw new Error('Kontrolní otisk aplikované migrace se liší.');
        continue;
      }
      // Each migration is reviewed DDL from this repository, never a legacy dump.
      for (const statement of sql
        .split(';')
        .map((s) => s.trim())
        .filter(Boolean))
        await conn.query(statement);
      await exec(conn, 'INSERT INTO schema_migrations(name,checksum) VALUES(?,?)', [
        name,
        checksum,
      ]);
    }
  } finally {
    await rows(conn, "SELECT RELEASE_LOCK('faktury-schema-migration')");
    conn.release();
  }
}
export async function seed(db: Pool) {
  if (process.env.NODE_ENV === 'production')
    throw new Error('Syntetická data nejsou povolena v produkci.');
  await transaction(db, async (tx) => {
    const [lock] = await rows(tx, "SELECT GET_LOCK('faktury-seed',10) acquired");
    if (lock.acquired !== 1) throw new Error('Seed je uzamčen.');
    try {
      const [{ n }] = await rows(tx, 'SELECT COUNT(*) n FROM customers');
      if (Number(n) > 0) throw new Error('Seed vyžaduje prázdnou databázi.');
      const supplier = {
        company: 'Ukázkové studio s.r.o.',
        street: 'Modelová 12',
        city: 'Praha',
        zip: '11000',
        country: 'Česká republika',
        ico: '00000000',
        dic: 'CZ00000000',
        phone: '+420 000 000 000',
        email: 'studio@example.test',
        website: 'www.example.test',
        footer:
          'Syntetický dodavatel, zapsaný v ukázkovém rejstříku. Tento doklad obsahuje pouze testovací údaje.',
      };
      await exec(tx, 'INSERT INTO supplier_profiles(data_json,vat_rate) VALUES(?,?)', [
        JSON.stringify(supplier),
        '21',
      ]);
      for (const b of [
        ['Hlavní účet', '123456789', '0800', 'standard'],
        ['Účet Alto', '19-987654321', '0100', 'alto'],
      ])
        await exec(
          tx,
          'INSERT INTO bank_accounts(label,account_number,bank_code,variant) VALUES(?,?,?,?)',
          b,
        );
      for (const c of [
        ['Koncový zákazník', '', '', '', '', '', '', '', null, 1],
        [
          'Ateliér Lípa s.r.o.',
          'Ukázková',
          '8',
          'Brno',
          '60200',
          'Česká republika',
          '00000001',
          'CZ00000001',
          null,
          0,
        ],
        [
          'Dílna Čáp, a.s.',
          'Syntetická',
          '24/3',
          'Plzeň',
          '30100',
          'Česká republika',
          '00000002',
          '',
          '0308',
          0,
        ],
      ])
        await exec(
          tx,
          'INSERT INTO customers(company,street,street_number,city,zip,country,ico,dic,payment_id,end_customer) VALUES(?,?,?,?,?,?,?,?,?,?)',
          c,
        );
      for (const c of [
        ['Grafické práce', 'Grafické a návrhářské práce', 'hod', '950', '21', 'CZK', 1],
        ['Konzultace', 'Odborná konzultace', 'hod', '1200', '21', 'CZK', 1],
      ])
        await exec(
          tx,
          'INSERT INTO catalog_items(name,description,unit,price,vat_rate,currency,active) VALUES(?,?,?,?,?,?,?)',
          c,
        );
    } finally {
      await rows(tx, "SELECT RELEASE_LOCK('faktury-seed')");
    }
  });
}
async function admin(db: Pool) {
  const [{ n }] = await rows(db, 'SELECT COUNT(*) n FROM users');
  if (Number(n) !== 0) throw new Error('První správce již existuje.');
  const rl = createInterface({ input: stdin, output: stdout });
  let username: string, password: string;
  try {
    username = (await rl.question('Jméno prvního správce: ')).trim();
    rl.close();
    if (!stdin.isTTY) throw new Error('Použijte interaktivní terminál.');
    stdout.write('Heslo (nejméně 12 znaků, skryté): ');
    stdin.setRawMode(true);
    stdin.resume();
    password = await new Promise<string>((resolve, reject) => {
      let s = '';
      const f = (b: Buffer) => {
        for (const c of b.toString()) {
          if (c === '\u0003') {
            stdin.off('data', f);
            reject(new Error('Zrušeno.'));
            return;
          }
          if (c === '\r' || c === '\n') {
            stdin.off('data', f);
            resolve(s);
            return;
          }
          if (c === '\u007f') s = s.slice(0, -1);
          else s += c;
        }
      };
      stdin.on('data', f);
    });
  } finally {
    if (stdin.isTTY) stdin.setRawMode(false);
    stdin.pause();
    stdout.write('\n');
  }
  await createFirstAdmin(db, username!, password!);
}
export async function createFirstAdmin(db: Pool, username: string, password: string) {
  if (!/^[\p{L}\p{N}_.-]{3,80}$/u.test(username) || password.length < 12 || password.length > 200)
    throw new Error('Neplatné jméno nebo délka hesla.');
  const passwordHash = await argon2.hash(password, {
    type: argon2.argon2id,
    memoryCost: 65536,
    timeCost: 3,
    parallelism: 1,
  });
  const connection = await db.getConnection();
  try {
    const [lock] = await rows(connection, "SELECT GET_LOCK('faktury-first-admin',10) acquired");
    if (lock.acquired !== 1) throw new Error('Vytváření správce je uzamčeno.');
    const [{ n }] = await rows(connection, 'SELECT COUNT(*) n FROM users');
    if (Number(n) !== 0) throw new Error('Správce již existuje.');
    await exec(connection, 'INSERT INTO users(username,password_hash) VALUES(?,?)', [
      username,
      passwordHash,
    ]);
  } finally {
    await rows(connection, "SELECT RELEASE_LOCK('faktury-first-admin')");
    connection.release();
  }
}

if (process.argv[1]?.endsWith('/db.ts')) {
  const db = poolFor(process.env.DATABASE_URL!);
  try {
    const command = process.argv[2];
    if (command === 'migrate') await migrate(db);
    else if (command === 'seed') await seed(db);
    else if (command === 'admin') await admin(db);
    else throw new Error('Neznámý příkaz.');
    console.info('Operace dokončena.');
  } catch {
    console.error(
      'Operace selhala. Zkontrolujte lokální konfiguraci a předpoklady; hodnoty se nevypisují.',
    );
    process.exitCode = 1;
  } finally {
    await db.end();
  }
}
