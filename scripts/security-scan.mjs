import process from 'node:process';
import console from 'node:console';
import { execFileSync } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
const files = execFileSync(
  'git',
  ['ls-files', '--cached', '--others', '--exclude-standard', '-z'],
  { encoding: 'utf8' },
)
  .split('\0')
  .filter(Boolean);
const findings = [];
for (const path of files) {
  if (
    /^(legacy|\.private|node_modules|dist|storage|backups|uploads)\//.test(path) ||
    (/(?:^|\/)\.env(?:\.|$)/.test(path) && path !== '.env.example') ||
    (/\.sql$/.test(path) &&
      !path.startsWith('db/migrations/') &&
      !path.startsWith('tests/fixtures/'))
  )
    findings.push({ path, kind: 'private-path' });
  if (/\.(ttf|jpg|png|woff2)$/.test(path)) continue;
  const s = await readFile(path, 'utf8');
  const patterns = [
    ['private-key', /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/],
    ['github-token', /\bgh[pousr]_[A-Za-z0-9]{30,}\b/],
    ['aws-key', /\bAKIA[A-Z0-9]{16}\b/],
    ['basic-auth', /Basic\s+[A-Za-z0-9+/]{24,}={0,2}/],
    ['bcrypt-hash', /\$2[aby]\$\d\d\$[./A-Za-z0-9]{53}/],
    ['argon2-hash', /\$argon2id\$v=\d+\$m=\d+,[^\s'"`]{40,}/],
  ];
  for (const [kind, pattern] of patterns) if (pattern.test(s)) findings.push({ path, kind });
}
await writeFile(
  '.private/security-scan.json',
  JSON.stringify(
    { state: findings.length ? 'failed' : 'complete', files: files.length, findings },
    null,
    2,
  ),
);
if (findings.length) {
  console.error(JSON.stringify({ state: 'failed', files: files.length, findings }));
  process.exitCode = 1;
} else
  console.info(
    JSON.stringify({
      state: 'complete',
      files: files.length,
      known_secret_patterns: 0,
      scope: 'candidate Git files only; no staging or commit',
    }),
  );
