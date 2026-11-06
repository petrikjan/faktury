import { readFile } from 'node:fs/promises';
import { TextDecoder } from 'node:util';
export type LegacyRow = Record<string, string | null>;
export interface LegacyData {
  tables: Record<string, LegacyRow[]>;
  schema: { table: string; columns: { column: string; type: string }[]; charset: string[] }[];
}
// SQL is lexed as data; nothing from the dump is ever executed against a DB.
function statements(s: string) {
  const out: string[] = [];
  let start = 0,
    quote = '',
    escape = false,
    line = false,
    block = false;
  for (let i = 0; i < s.length; i++) {
    const c = s[i],
      n = s[i + 1];
    if (line) {
      if (c === '\n') line = false;
      continue;
    }
    if (block) {
      if (c === '*' && n === '/') {
        block = false;
        i++;
      }
      continue;
    }
    if (quote) {
      if (escape) {
        escape = false;
        continue;
      }
      if (c === '\\') {
        escape = true;
        continue;
      }
      if (c === quote) {
        if (n === quote) {
          i++;
          continue;
        }
        quote = '';
      }
      continue;
    }
    if ((c === '-' && n === '-') || c === '#') {
      line = true;
      continue;
    }
    if (c === '/' && n === '*') {
      block = true;
      i++;
      continue;
    }
    if (c === "'" || c === '"' || c === '`') {
      quote = c;
      continue;
    }
    if (c === ';') {
      out.push(s.slice(start, i + 1));
      start = i + 1;
    }
  }
  if (quote || block) throw new Error('DUMP_SYNTAX');
  return out;
}
function stripComments(s: string) {
  let rest = s.trimStart();
  while (rest.startsWith('--') || rest.startsWith('#') || rest.startsWith('/*')) {
    if (rest.startsWith('/*')) {
      const end = rest.indexOf('*/');
      if (end < 0) throw new Error('COMMENT_SYNTAX');
      if (/^\/\*(?:!|M!)/i.test(rest)) {
        const directive = rest
          .slice(rest.startsWith('/*M!') ? 4 : 3, end)
          .replace(/^\d{5,6}\s*/, '')
          .trim();
        if (
          !/^SET\s/i.test(directive) &&
          !/^ALTER\s+TABLE\s+`[^`]+`\s+(?:ENABLE|DISABLE)\s+KEYS$/i.test(directive) &&
          !/^\\-\s+enable the sandbox mode$/i.test(directive)
        )
          throw new Error('UNEXPECTED_EXECUTABLE_COMMENT');
      }
      rest = rest.slice(end + 2).trimStart();
    } else {
      const end = rest.indexOf('\n');
      if (end < 0) return '';
      rest = rest.slice(end + 1).trimStart();
    }
  }
  return rest.trim();
}
export function ddlOnly(source: string) {
  const schema: LegacyData['schema'] = [];
  for (const statement of statements(source)) {
    const m = stripComments(statement).match(
      /^CREATE TABLE\s+`([^`]+)`\s*\(([\s\S]*?)\)\s*ENGINE\s*=\s*\w+([^;]*);$/i,
    );
    if (!m) continue;
    const columns = [];
    for (const line of m[2].split('\n')) {
      const cm = line.match(/^\s*`([^`]+)`\s+(.*)/);
      if (cm)
        columns.push({
          column: cm[1],
          type: cm[2]
            .split(/\b(?:DEFAULT|COMMENT)\b/i)[0]
            .trim()
            .replace(/,$/, ''),
        });
    }
    schema.push({
      table: m[1],
      columns,
      charset: m[3].match(/(?:CHARSET|COLLATE)\s*=\s*\w+/g) ?? [],
    });
  }
  if (!schema.length) throw new Error('DDL_MISSING');
  return schema;
}
function values(text: string): (string | null)[][] {
  const rows: (string | null)[][] = [];
  let i = 0;
  const ws = () => {
    while (/\s/.test(text[i] ?? '') && i < text.length) i++;
  };
  const escaped: Record<string, string> = {
    '0': '\0',
    n: '\n',
    r: '\r',
    t: '\t',
    b: '\b',
    Z: '\x1a',
    "'": "'",
    '"': '"',
    '\\': '\\',
  };
  while (i < text.length) {
    ws();
    if (text[i] === ';') break;
    if (text[i] !== '(') throw new Error('VALUES_SYNTAX');
    i++;
    const row: (string | null)[] = [];
    while (i < text.length) {
      ws();
      let value: string | null = '';
      if (text[i] === "'") {
        i++;
        let closed = false;
        while (i < text.length) {
          const c = text[i++];
          if (c === '\\') {
            const n = text[i++];
            value += escaped[n] ?? n;
          } else if (c === "'") {
            if (text[i] === "'") {
              value += "'";
              i++;
            } else {
              closed = true;
              break;
            }
          } else value += c;
        }
        if (!closed) throw new Error('STRING_SYNTAX');
      } else {
        const start = i;
        while (i < text.length && text[i] !== ',' && text[i] !== ')') i++;
        const raw = text.slice(start, i).trim();
        if (/^NULL$/i.test(raw)) value = null;
        else if (/^[+-]?\d+(?:\.\d*)?(?:e[+-]?\d+)?$/i.test(raw)) value = raw;
        else throw new Error('UNSUPPORTED_LITERAL');
      }
      row.push(value);
      ws();
      if (text[i] === ',') {
        i++;
        continue;
      }
      if (text[i] === ')') {
        i++;
        break;
      }
      throw new Error('VALUE_SEPARATOR');
    }
    rows.push(row);
    ws();
    if (text[i] === ',') {
      i++;
      continue;
    }
    if (text[i] === ';' || i === text.length) break;
    throw new Error('ROW_SEPARATOR');
  }
  return rows;
}
export function parseDump(source: string): LegacyData {
  // Routine/trigger bodies, file operations and cross-database operations are rejected.
  // Comments are handled lexically, and INSERT strings are never treated as SQL code.
  const schema = ddlOnly(source),
    tables: LegacyData['tables'] = Object.fromEntries(schema.map((t) => [t.table, []]));
  for (const raw of statements(source)) {
    const s = stripComments(raw);
    if (!s || s === ';') continue;
    const insert = s.match(/^INSERT INTO\s+`([^`]+)`\s*(?:\(([^)]+)\)\s*)?VALUES\s*([\s\S]+);$/i);
    if (insert) {
      const t = schema.find((t) => t.table === insert[1]);
      if (!t) throw new Error('UNKNOWN_TABLE');
      const cols = insert[2]
        ? [...insert[2].matchAll(/`([^`]+)`/g)].map((m) => m[1])
        : t.columns.map((column) => column.column);
      if (!cols.length || cols.some((c) => !t.columns.some((x) => x.column === c)))
        throw new Error('UNKNOWN_COLUMN');
      for (const row of values(insert[3])) {
        if (row.length !== cols.length) throw new Error('COLUMN_COUNT');
        tables[t.table].push(Object.fromEntries(cols.map((c, i) => [c, row[i]])));
      }
      continue;
    }
    // mysqldump wrappers describe the source snapshot; they are never executed.
    const wrapper =
      s.match(/^DROP TABLE IF EXISTS\s+`([^`]+)`\s*;$/i) ??
      s.match(/^LOCK TABLES\s+`([^`]+)`\s+(?:WRITE|READ(?:\s+LOCAL)?)\s*;$/i);
    if (wrapper) {
      if (!schema.some((table) => table.table === wrapper[1])) throw new Error('UNKNOWN_TABLE');
      continue;
    }
    if (/^UNLOCK TABLES\s*;$/i.test(s)) continue;
    if (
      /^CREATE TABLE\s+`[^`]+`\s*\(/i.test(s) ||
      /^ALTER TABLE\s+`[^`]+`\s+(?:ADD |MODIFY )/i.test(s) ||
      /^(?:SET |START TRANSACTION\s*;|COMMIT\s*;)/i.test(s)
    )
      continue;
    throw new Error('UNEXPECTED_SQL_OPERATION');
  }
  return { tables, schema };
}
export async function readDump(path: string, structureOnly = false) {
  const bytes = await readFile(path);
  const source = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  return structureOnly ? { tables: {}, schema: ddlOnly(source) } : parseDump(source);
}
