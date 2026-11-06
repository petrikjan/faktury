#!/usr/bin/env python3
"""One-time Apache cutover after a verified first start; no automatic DB rollback."""
import contextlib
import fcntl
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import re
import subprocess
import time
import traceback
import urllib.error
import urllib.request

PRIVATE = Path('/root/faktury-node-deploy-20261106')
BASE = Path('/www/wwwroot/faktury-node')
VHOST = Path('/www/server/panel/vhost/apache/faktury.janpetrik.cz.conf')
APACHE = Path('/www/server/apache/bin/apachectl')
SOURCE = PRIVATE / 'source-20261106-130818-b5c2b7'
OLD_PUBLIC = '/www/wwwroot/faktury.janpetrik.cz/www'
NEW_PUBLIC = '/www/wwwroot/faktury-node/public'
HOST = 'faktury.janpetrik.cz'


class CutoverError(Exception):
    pass


def vhosts(source, operation):
    blocks = list(re.finditer(r'<VirtualHost\s+\*:([0-9]+)>[\s\S]*?</VirtualHost>', source))
    if len(blocks) != 2 or {match[1] for match in blocks} != {'80', '443'} or source.count('ServerName ' + HOST) != 2:
        raise CutoverError('Unexpected existing virtual hosts.')
    for match in reversed(blocks):
        source = source[:match.start()] + operation(match[0], match[1]) + source[match.end():]
    return source


def maintenance_config(source):
    rules = '\n    # Faktury: writes stopped for the final private snapshot\n    RewriteEngine On\n' + \
            '    RewriteCond %{REQUEST_URI} !^/\\.well-known/acme-challenge/\n    RewriteRule ^ - [R=503,L]\n'
    return vhosts(source, lambda block, port: block.replace('ServerName ' + HOST, 'ServerName ' + HOST + rules, 1))


def proxy_config(source):
    def transform(block, port):
        document = 'DocumentRoot "' + OLD_PUBLIC + '"'
        if block.count(document) != 1:
            raise CutoverError('Unexpected public directory.')
        block = block.replace(document, 'DocumentRoot "' + NEW_PUBLIC + '"')
        pattern = r'<Directory\s+"' + re.escape(OLD_PUBLIC) + r'">[\s\S]*?</Directory>'
        block, count = re.subn(pattern, '<Directory "' + NEW_PUBLIC + '">\n        Options None\n        AllowOverride None\n        Require all granted\n    </Directory>', block)
        if count != 1:
            raise CutoverError('Unexpected public directory policy.')
        def handler(match):
            return '' if 'fcgi://localhost' in match[0] and 'SetHandler' in match[0] else match[0]
        block = re.sub(r'<FilesMatch\b[^>]*>[\s\S]*?</FilesMatch>', handler, block)
        if 'fcgi://localhost' in block or 'ProxyPass' in block:
            raise CutoverError('Unexpected existing handler or proxy.')
        # aaPanel renews the existing certificate using the original site path.
        extra = '\n    Alias "/.well-known/acme-challenge/" "' + OLD_PUBLIC + '/.well-known/acme-challenge/"\n' + \
                '    <Directory "' + OLD_PUBLIC + '/.well-known/acme-challenge">\n' + \
                '        Options None\n        AllowOverride None\n        SetHandler default-handler\n        Require all granted\n    </Directory>\n'
        if port == '443':
            extra += '    ProxyRequests Off\n    ProxyPreserveHost On\n    RequestHeader set X-Forwarded-Proto "https"\n' + \
                     '    ProxyPass "/.well-known/acme-challenge/" "!"\n' + \
                     '    ProxyPass "/" "http://127.0.0.1:3110/" connectiontimeout=5 timeout=120 retry=0\n' + \
                     '    ProxyPassReverse "/" "http://127.0.0.1:3110/"\n'
        return block.replace('ServerName ' + HOST, 'ServerName ' + HOST + extra, 1)
    return vhosts(source, transform)


SOURCE_COMPARISON = r"""
import {readFileSync} from 'node:fs';
import {parseDump} from './scripts/migration/dump.ts';
const [before,after]=JSON.parse(readFileSync(0,'utf8'));
function canonical(source){
 const parsed=parseDump(source);
 const tables=Object.keys(parsed.tables).sort().map(name=>[name,parsed.tables[name].map(row=>
  JSON.stringify(Object.keys(row).sort().map(key=>[key,row[key]]))).sort()]);
 return JSON.stringify([parsed.schema,tables]);
}
if(canonical(before)!==canonical(after))throw new Error('LEGACY_CHANGED_SINCE_BASELINE');
"""


def load_prepare():
    path = PRIVATE / 'aapanel-prepare.py'
    if path.is_symlink() or path.stat().st_uid != 0 or path.stat().st_mode & 0o022:
        raise CutoverError('Untrusted preparation helper.')
    spec = importlib.util.spec_from_file_location('prepare', path)
    helper = importlib.util.module_from_spec(spec);spec.loader.exec_module(helper)
    helper.verify_server()
    return helper


def apache_write(text, log):
    temporary = VHOST.with_suffix('.conf.faktury-next')
    if temporary.exists() or temporary.is_symlink() or VHOST.is_symlink():
        raise CutoverError('Unexpected Apache configuration path.')
    with temporary.open('x') as file:
        file.write(text)
    temporary.chmod(0o600)
    temporary.replace(VHOST)
    subprocess.run([str(APACHE), '-t'], stdout=log, stderr=log, check=True)
    subprocess.run([str(APACHE), '-k', 'graceful'], stdout=log, stderr=log, check=True)


def public_check(sha):
    opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))
    for attempt in range(30):
        try:
            with opener.open('https://' + HOST + '/health/ready', timeout=5) as response:
                state = json.load(response)
                if response.status == 200 and state.get('ok') is True and state.get('sha') == sha:
                    break
        except Exception:
            pass
        time.sleep(1)
    else:
        raise CutoverError('Public HTTPS/DB/SHA readiness failed.')
    try:
        opener.open('https://' + HOST + '/api/invoices', timeout=5)
    except urllib.error.HTTPError as error:
        if error.code == 401:
            return
    raise CutoverError('Public authentication protection failed.')


def cutover(log):
    helper = load_prepare()
    ready = json.loads((PRIVATE / 'first-start-status.json').read_text())
    if ready.get('state') != 'ready' or ready.get('database_and_sha_ready') is not True:
        raise CutoverError('Verified first start required.')
    original = (SOURCE / 'original-apache.conf').read_text()
    if VHOST.read_text() != original:
        raise CutoverError('Apache configuration changed since the verified snapshot.')
    maintenance, proxy = maintenance_config(original), proxy_config(original)
    (PRIVATE / 'before-cutover-apache.conf').write_text(original)
    (PRIVATE / 'prepared-node-apache.conf').write_text(proxy)
    activated = False
    try:
        apache_write(maintenance, log)
        # Stop new PHP requests, let already-running short requests finish.
        time.sleep(10)
        with helper.mysql_client() as client:
            active = helper.mysql_query(client, "SELECT ID FROM information_schema.PROCESSLIST WHERE DB='faktury' AND COMMAND<>'Sleep' AND ID<>CONNECTION_ID()", log)
            if active:
                raise CutoverError('Legacy database still has active requests; cutover stopped.')
        with contextlib.redirect_stdout(log), contextlib.redirect_stderr(log):
            helper.inspect(log)
        report = json.loads((PRIVATE / 'inspect-status.json').read_text())
        final = Path(report['source_snapshot'])
        if not final.is_relative_to(PRIVATE) or final == SOURCE:
            raise CutoverError('Final snapshot path differs.')
        (final / 'original-apache.conf').write_text(original)
        manifest = json.loads((final / 'manifest.json').read_text())
        manifest.update(stage='final_after_write_freeze', final_write_freeze_still_required=False)
        manifest['files']['original-apache.conf'] = helper.fingerprint(final / 'original-apache.conf')
        helper.private_json(final / 'manifest.json', manifest)
        release = (BASE / 'current').resolve()
        if release.name != ready['sha']:
            raise CutoverError('Running release changed before cutover.')
        subprocess.run(['/usr/sbin/runuser', '-u', 'www', '--', '/www/server/nodejs/v26.13.0/bin/node',
                        '--import', str(release / 'node_modules/tsx/dist/loader.mjs'), '--input-type=module', '-e', SOURCE_COMPARISON],
                       cwd=release, env=helper.app_environment(),
                       input=json.dumps([(SOURCE / 'legacy.sql').read_text(), (final / 'legacy.sql').read_text()]).encode(),
                       stdout=log, stderr=log, check=True)
        # Existing PHP files stay outside the new public directory. Only the
        # certificate challenge directory remains an explicit static exception.
        Path(OLD_PUBLIC + '/.well-known/acme-challenge').mkdir(mode=0o755, parents=True, exist_ok=True)
        apache_write(proxy, log)
        activated = True
        public_check(ready['sha'])
        helper.private_json(PRIVATE / 'cutover-status.json', {'state': 'ready', 'sha': ready['sha'],
                            'https_ready': True, 'authentication_verified': True, 'legacy_matches_baseline': True,
                            'final_snapshot': str(final), 'old_php_not_public': True})
    except Exception:
        # Once Node has been public it could have received new writes. Keep
        # maintenance on failure rather than restoring a second independent writer.
        apache_write(maintenance if activated else original, log)
        helper.private_json(PRIVATE / 'cutover-status.json', {'state': 'failed', 'public_maintenance': activated,
                            'original_php_restored': not activated, 'no_database_rollback': True})
        raise


if __name__ == '__main__':
    os.umask(0o077)
    if os.geteuid() != 0:
        raise SystemExit('Root through aaPanel required.')
    with (PRIVATE / 'deploy.lock').open('a') as lock, (PRIVATE / 'cutover-diagnostics.log').open('a') as log:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        try:
            cutover(log)
            print(json.dumps({'stage': 'cutover', 'state': 'ready'}))
        except Exception:
            traceback.print_exc(file=log)
            print(json.dumps({'stage': 'cutover', 'state': 'failed', 'message': 'Private diagnostics only; no DB rollback.'}))
            raise SystemExit(1) from None
