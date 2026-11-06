import { readFile } from 'node:fs/promises';
export interface LegacyTemplateText {
  website: string;
  footer: string;
  footer_left: string;
}
const decode = (value: string) =>
  value
    .replace(
      /&(amp|lt|gt|quot|apos|nbsp);/g,
      (_m, k: string) => ({ amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' })[k]!,
    )
    .replace(/&#(x[0-9a-f]+|\d+);/gi, (_m, n: string) =>
      String.fromCodePoint(n[0].toLowerCase() === 'x' ? parseInt(n.slice(1), 16) : Number(n)),
    );
const plain = (value: string) =>
  decode(value.replace(/<br\s*\/?\s*>/gi, '\n').replace(/<[^>]*>/g, ''))
    .replace(/[\t ]+/g, ' ')
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean)
    .join('\n')
    .trim();
/** Read only the active document's static text. Never execute PHP or print extracted values. */
export function extractTemplateText(source: string): LegacyTemplateText {
  const header = source.match(/<table\s+class=["']head["'][\s\S]*?<\/table>/i)?.[0];
  const footer = source.slice(source.indexOf('<div class="footer-wrapper">'));
  const right = footer.match(/<div\s+class=["']text-right width-50["']\s*>([\s\S]*?)<\/div>/i)?.[1];
  let left = footer.match(/<div\s+class=["']width-50["']\s*>([\s\S]*?)<\/div>/i)?.[1];
  if (!header || right === undefined || left === undefined || right.includes('<?'))
    throw new Error('TEMPLATE_TEXT_UNSUPPORTED');
  left = left
    .replace(/<\?php\s+echo\s+\$store_info\[['"]store_name['"]\]\s*;?\s*\?>/g, '{{supplier}}')
    .replace(
      /<\?php\s+echo\s+date_format\(\$date\s*,\s*["']j\. n Y H:i:s["']\)\s*;?\s*\?>/g,
      '{{issued_at}}',
    );
  if (left.includes('<?') || !left.includes('{{supplier}}') || !left.includes('{{issued_at}}'))
    throw new Error('TEMPLATE_LEFT_UNSUPPORTED');
  return {
    website: header.match(/\bwww\.[a-z0-9.-]+/i)?.[0] ?? '',
    footer: plain(right),
    footer_left: plain(left),
  };
}
export async function readTemplateText(path: string) {
  return extractTemplateText(
    new TextDecoder('utf-8', { fatal: true }).decode(await readFile(path)),
  );
}
