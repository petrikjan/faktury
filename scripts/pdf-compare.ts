import { readFile, writeFile, mkdir, copyFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { resolve, join } from 'node:path';
import { PNG } from 'pngjs';
import pixelmatch from 'pixelmatch';
import { renderInvoice } from '../packages/pdf/index.js';
const dir = resolve('.private/pdf');
await mkdir(dir, { recursive: true });
const input = JSON.parse(await readFile('tests/fixtures/pdf-invoice.json', 'utf8'));
const ref = join(dir, 'reference.pdf'),
  node = join(dir, 'node.pdf');
execFileSync(
  process.env.PHP_BIN ?? 'php',
  ['scripts/pdf-reference.php', 'tests/fixtures/pdf-invoice.json', ref],
  { stdio: 'pipe' },
);
const result = await renderInvoice(input, dir);
await copyFile(join(dir, result.path), node);
for (const [name, file] of [
  ['reference', ref],
  ['node', node],
])
  execFileSync('pdftoppm', ['-r', '120', '-png', file, join(dir, name)], { stdio: 'pipe' });
const pages = (file: string) =>
  Number(execFileSync('pdfinfo', [file], { encoding: 'utf8' }).match(/Pages:\s+(\d+)/)![1]);
const referencePages = pages(ref),
  nodePages = pages(node);
let different = 0,
  total = 0;
const dimensions = [];
for (let page = 1; page <= Math.max(referencePages, nodePages); page++) {
  const a =
    page <= referencePages
      ? PNG.sync.read(await readFile(join(dir, `reference-${page}.png`)))
      : null;
  const b = page <= nodePages ? PNG.sync.read(await readFile(join(dir, `node-${page}.png`))) : null;
  const width = Math.max(a?.width ?? 0, b?.width ?? 0),
    height = Math.max(a?.height ?? 0, b?.height ?? 0);
  const pad = (p: PNG | null) => {
    const out = new PNG({ width, height });
    out.data.fill(255);
    if (p) PNG.bitblt(p, out, 0, 0, p.width, p.height, 0, 0);
    return out;
  };
  const aa = pad(a),
    bb = pad(b),
    diff = new PNG({ width, height }),
    overlay = new PNG({ width, height });
  const count = pixelmatch(aa.data, bb.data, diff.data, width, height, {
    threshold: 0,
    includeAA: true,
  });
  different += count;
  total += width * height;
  for (let n = 0; n < overlay.data.length; n++)
    overlay.data[n] = Math.round((aa.data[n] + bb.data[n]) / 2);
  await writeFile(join(dir, `diff-${page}.png`), PNG.sync.write(diff));
  await writeFile(join(dir, `overlay-${page}.png`), PNG.sync.write(overlay));
  dimensions.push({
    page,
    reference: a ? { width: a.width, height: a.height } : null,
    node: b ? { width: b.width, height: b.height } : null,
    pixels_different: count,
  });
}
const report = {
  state: 'generated-for-visual-review',
  acceptance: 'human-readable-equivalence; pixel difference is diagnostic only',
  pixel_identical: different === 0 && referencePages === nodePages,
  dpi: 120,
  reference_pages: referencePages,
  node_pages: nodePages,
  dimensions,
  pixels_different: different,
  total_pixels: total,
  percentage: (different / total) * 100,
  scope:
    'all pages, no scaling; white padding for differing page sizes is recorded; synthetic data only; private footer/website replaced equally',
};
await writeFile(join(dir, 'comparison.json'), JSON.stringify(report, null, 2));
console.info(JSON.stringify(report));
