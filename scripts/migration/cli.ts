import 'dotenv/config';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve, join, sep } from 'node:path';
import { parseArgs } from 'node:util';
import { readDump, type LegacyData } from './dump.js';
import {
  importLegacy,
  verifyLegacy,
  validateSource,
  canonical,
  IMPORTER_VERSION,
} from './importer.js';
import { poolFor, hash } from '../../apps/api/src/db.js';
import { readTemplateText } from './template-text.js';
const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    source: { type: 'string' },
    'source-id': { type: 'string' },
    fixture: { type: 'boolean', default: false },
    'source-timezone': { type: 'string' },
    'pdf-dir': { type: 'string' },
    'template-file': { type: 'string' },
  },
});
const mode = positionals[0],
  path = resolve(values.source ?? 'legacy/faktury.sql'),
  synthetic = values.fixture && path.startsWith(resolve('tests/fixtures') + sep);
async function main() {
  if (!['preflight', 'dry-run', 'import', 'verify'].includes(mode)) throw new Error('COMMAND');
  if (
    mode !== 'preflight' &&
    !synthetic &&
    process.env.REAL_MIGRATION_APPROVAL !== 'explicitly-approved-by-owner'
  )
    throw new Error('REAL_DATA_NOT_AUTHORIZED');
  if (mode !== 'preflight' && !values['source-timezone'])
    throw new Error('SOURCE_TIMEZONE_CONFIRMATION_REQUIRED');
  let data: LegacyData;
  if (path.endsWith('.json')) data = JSON.parse(await readFile(path, 'utf8'));
  else data = await readDump(path, mode === 'preflight');
  const archiveDir = resolve('.private/migrations'),
    sourceId = values['source-id'] ?? (synthetic ? 'synthetic' : 'legacy');
  if (mode === 'preflight') {
    const expected = JSON.parse(
      await readFile('docs/legacy-schema.json', 'utf8'),
    ) as LegacyData['schema'];
    const mismatch = expected.filter(
      (t) =>
        !data.schema.some(
          (s) =>
            s.table === t.table &&
            s.columns.length === t.columns.length &&
            s.columns.every((c, i) => c.column === t.columns[i].column),
        ),
    );
    await mkdir(archiveDir, { recursive: true, mode: 0o700 });
    await writeFile(
      join(archiveDir, 'preflight.json'),
      canonical({
        importer: IMPORTER_VERSION,
        tables: data.schema,
        errors: mismatch.map((t) => ({ code: 'SCHEMA_MISMATCH', table: t.table })),
        source_hash: hash(await readFile(path)),
      }),
      { mode: 0o600 },
    );
    console.info(
      JSON.stringify({
        mode,
        state: mismatch.length ? 'needs-review' : 'schema-checked',
        errors: mismatch.length,
      }),
    );
    return;
  }
  const options = {
    sourceId,
    archiveDir,
    storageDir: resolve(process.env.STORAGE_DIR ?? '.private/storage'),
    pdfDir: values['pdf-dir'] ? resolve(values['pdf-dir']) : undefined,
    sourceTimezone: values['source-timezone']!,
    sourceDump: path.endsWith('.sql') ? path : undefined,
    ...(values['template-file']
      ? { templateText: await readTemplateText(resolve(values['template-file'])) }
      : {}),
  };
  if (mode === 'dry-run') {
    const report = validateSource(data);
    await mkdir(join(archiveDir, sourceId), { recursive: true, mode: 0o700 });
    await writeFile(join(archiveDir, sourceId, 'dry-run.json'), canonical(report), { mode: 0o600 });
    console.info(JSON.stringify({ mode, state: 'checked', errors: report.issues.length }));
    return;
  }
  const db = poolFor(process.env.DATABASE_URL!);
  try {
    const report =
      mode === 'import'
        ? await importLegacy(db, data, options)
        : await verifyLegacy(db, data, options);
    console.info(JSON.stringify({ mode, state: report.state, errors: report.issues.length }));
  } finally {
    await db.end();
  }
}
main().catch(() => {
  console.error(
    JSON.stringify({
      state: 'failed',
      message:
        'Operace byla zastavena. Ověřte oprávnění, schéma, zdrojové pásmo a soukromý postup. Hodnoty se nevypisují.',
    }),
  );
  process.exitCode = 1;
});
