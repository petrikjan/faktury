#!/usr/bin/env python3
"""One-time preparation for this server. No public endpoint, no scheduled task."""
import argparse
import contextlib
import hashlib
import json
import os
import pwd
from pathlib import Path
import re
import secrets
import shutil
import sqlite3
import subprocess
import tarfile
import time
import traceback
from urllib.parse import quote

BASE = Path('/www/wwwroot/faktury-node')
REPOSITORY = BASE / 'repository/faktury'
PRIVATE = Path('/root/faktury-node-deploy-20261106')
PANEL = Path('/www/server/panel')
LEGACY = Path('/www/wwwroot/faktury.janpetrik.cz')
MYSQL = Path('/www/server/mysql/bin/mysql')
DISK_UUID = 'd66553a5-6869-4099-90ad-3f4484b6355a'
NODE = Path('/www/server/nodejs/v26.13.0/bin')
SHARED = BASE / 'shared'
TEST_SCHEMAS = ['faktury_node_ci_test', 'faktury_node_source_test', 'faktury_node_e2e_test',
                'faktury_node_merge_source_test', 'faktury_node_merge_baseline_test']


class PreparationError(Exception):
    pass


def source_database(config):
    # Read a literal name only. Never execute the PHP configuration.
    match = re.search(r'\$db\s*\[\s*[\'"]default[\'"]\s*\]\s*=\s*(?:array\s*\(|\[)', config)
    if not match:
        raise PreparationError('Legacy database configuration is unsupported.')
    names = re.findall(r'''(?m)^[ \t]*(['"])database\1[ \t]*=>[ \t]*(['"])([a-zA-Z0-9_]+)\2[ \t]*,?[ \t]*$''', config[match.end():])
    if len(names) != 1 or names[0][2] != 'faktury':
        raise PreparationError('Unexpected legacy database; no export performed.')
    return names[0][2]


def fingerprint(path):
    digest = hashlib.sha256()
    with path.open('rb') as source:
        for block in iter(lambda: source.read(1024 * 1024), b''):
            digest.update(block)
    return digest.hexdigest()


def verify_server():
    if os.geteuid() != 0:
        raise PreparationError('Run this one-time preparation as root through aaPanel.')
    disk = subprocess.check_output(['/usr/bin/findmnt', '-rn', '-T', str(BASE), '-o', 'UUID'], text=True).strip()
    if disk != DISK_UUID or BASE.is_symlink() or REPOSITORY.is_symlink():
        raise PreparationError('Unexpected target filesystem or path.')
    with contextlib.closing(sqlite3.connect((PANEL / 'data/default.db').as_uri() + '?mode=ro', uri=True)) as connection:
        connection.row_factory = sqlite3.Row
        rows = connection.execute('SELECT * FROM sites WHERE name=? AND project_type=?', ('faktury', 'Node')).fetchall()
        if len(rows) != 1:
            raise PreparationError('Expected one separate Node project Faktury.')
        project = dict(rows[0])
        config = json.loads(project['project_config'])
        if project['path'] != str(REPOSITORY) or config.get('run_user') != 'www' or config.get('nodejs_version') != 'v26.13.0' or int(config.get('port', 0)) != 3110:
            raise PreparationError('Unexpected Node project configuration.')
    PRIVATE.mkdir(mode=0o700, exist_ok=True)
    if PRIVATE.is_symlink() or PRIVATE.stat().st_uid != 0:
        raise PreparationError('Private preparation directory must belong to root.')
    PRIVATE.chmod(0o700)
    return project


@contextlib.contextmanager
def mysql_client():
    with contextlib.closing(sqlite3.connect((PANEL / 'data/default.db').as_uri() + '?mode=ro', uri=True)) as connection:
        record = connection.execute('SELECT mysql_root FROM config WHERE id=1').fetchone()
    if not record or not isinstance(record[0], str) or not record[0]:
        raise PreparationError('Stored aaPanel database access is unavailable.')
    password = record[0]
    escaped = password.replace('\\', '\\\\').replace('"', '\\"').replace('\n', '\\n').replace('\r', '\\r')
    path = PRIVATE / ('.mysql-client-' + secrets.token_hex(12))
    with open(path, 'x', opener=lambda p, flags: os.open(p, flags, 0o600)) as file:
        file.write('[client]\nuser=root\nprotocol=SOCKET\npassword="' + escaped + '"\n')
    try:
        yield '--defaults-extra-file=' + str(path)
    finally:
        path.unlink(missing_ok=True)


def inspect(log):
    project = verify_server()
    database = source_database((LEGACY / 'www/application/config/database.php').read_text())
    with mysql_client() as client:
        version = subprocess.check_output([str(MYSQL), client, '--batch', '--skip-column-names', '-e', 'SELECT VERSION()'], stderr=log, text=True).strip()
        if not version.startswith('12.3.2-MariaDB'):
            raise PreparationError('Unexpected database server version.')
        folder = PRIVATE / ('source-' + time.strftime('%Y%m%d-%H%M%S', time.gmtime()) + '-' + secrets.token_hex(3))
        folder.mkdir(mode=0o700)
        sql = folder / 'legacy.sql'
        dump = MYSQL.with_name('mariadb-dump')
        if not dump.is_file():
            dump = MYSQL.with_name('mysqldump')
        with sql.open('xb') as output:
            subprocess.run([str(dump), client, '--single-transaction', '--quick', '--skip-lock-tables',
                            '--skip-add-locks', '--skip-add-drop-table', '--complete-insert',
                            '--skip-triggers', '--hex-blob', '--skip-tz-utc', '--default-character-set=utf8mb4', database],
                           stdout=output, stderr=log, check=True)
        archive = folder / 'legacy-files.tar.gz'
        with tarfile.open(archive, 'w:gz') as target:
            target.add(LEGACY, arcname=LEGACY.name, recursive=True)
        vhost = PANEL / 'vhost/apache/faktury.janpetrik.cz.conf'
        if not vhost.is_file():
            raise PreparationError('Original Apache configuration missing.')
        shutil.copy2(vhost, folder / 'original-apache.conf')
        (folder / 'original-apache.conf').chmod(0o600)
        (folder / 'node-project.json').write_text(json.dumps(project, indent=2))
        manifest = {'stage': 'initial_online_snapshot', 'final_write_freeze_still_required': True,
                    'files': {p.name: fingerprint(p) for p in folder.iterdir() if p.is_file()}}
        (folder / 'manifest.json').write_text(json.dumps(manifest, indent=2))
        # This report contains operational status only. Raw records stay in the private snapshot.
        report = {'state': 'complete', 'database_version': version, 'legacy_untouched': True,
                  'source_snapshot': str(folder), 'final_write_freeze_still_required': True}
        (PRIVATE / 'inspect-status.json').write_text(json.dumps(report, indent=2))
    print(json.dumps({'stage': 'inspect', 'state': 'complete', 'legacy_untouched': True}))


def mysql_query(client, sql, log):
    result = subprocess.run([str(MYSQL), client, '--batch', '--skip-column-names', '--raw'],
                            input=sql, text=True, stdout=subprocess.PIPE, stderr=log, check=True)
    return result.stdout.strip()


def app_environment():
    account = pwd.getpwnam('www')
    return {'PATH': str(SHARED / 'runtime/node_modules/.bin') + ':' + str(NODE) + ':/usr/bin:/bin',
            'HOME': account.pw_dir, 'USER': 'www', 'LOGNAME': 'www', 'LANG': 'C.UTF-8',
            'NODE_ENV': 'development', 'NPM_CONFIG_CACHE': str(SHARED / 'npm-cache'),
            'PLAYWRIGHT_BROWSERS_PATH': str(SHARED / 'browsers'), 'PLAYWRIGHT_SKIP_BROWSER_GC': '1',
            'PDF_BROWSER_CHANNEL': 'chromium'}


def app_run(arguments, log, cwd=None):
    subprocess.run(['/usr/sbin/runuser', '-u', 'www', '--', *map(str, arguments)],
                   cwd=cwd or REPOSITORY, env=app_environment(), stdout=log, stderr=log, check=True)


def directory(path, account, writable=False):
    if path.is_symlink():
        raise PreparationError('Unexpected setup symlink.')
    path.mkdir(mode=0o700, parents=True, exist_ok=True)
    os.chown(path, account.pw_uid if writable else 0, account.pw_gid, follow_symlinks=False)
    path.chmod(0o700 if writable else 0o750)


def private_json(path, value):
    if path.is_symlink():
        raise PreparationError('Unexpected private configuration symlink.')
    with path.open('w') as target:
        json.dump(value, target, indent=2)
    os.chown(path, 0, 0, follow_symlinks=False)
    path.chmod(0o600)


def schema_pattern(name):
    if name != 'faktury_node' and name not in TEST_SCHEMAS:
        raise PreparationError('Database outside this application rejected.')
    return '`' + name.replace('_', '\\_') + '`'


def browser_package_changes(plan):
    changes = []
    for line in plan.splitlines():
        if line.startswith(('Remv ', 'Purg ')):
            raise PreparationError('Browser dependencies would remove an existing package.')
        if line.startswith('Inst '):
            match = re.fullmatch(r'Inst ([a-zA-Z0-9+.:_-]+) \([^\n]+\)', line)
            if not match or not match[1].startswith(('lib', 'fonts-', 'fontconfig')):
                raise PreparationError('Browser dependencies would upgrade or change unrelated software.')
            changes.append(match[1])
        if line.startswith('Conf ') and line.split()[1] not in changes:
            raise PreparationError('Unrelated package configuration is pending.')
    return changes


def install_browser_libraries(log):
    # Chromium dependencies from the pinned Playwright package, Ubuntu's official
    # repositories only. Never upgrade/remove an existing server package.
    packages = ['libasound2t64', 'libatk-bridge2.0-0t64', 'libatk1.0-0t64',
                'libatspi2.0-0t64', 'libcairo2', 'libcups2t64', 'libdbus-1-3',
                'libdrm2', 'libgbm1', 'libglib2.0-0t64', 'libnspr4', 'libnss3',
                'libpango-1.0-0', 'libx11-6', 'libxcb1', 'libxcomposite1',
                'libxdamage1', 'libxext6', 'libxfixes3', 'libxkbcommon0', 'libxrandr2',
                'libfontconfig1', 'libfreetype6', 'fonts-liberation']
    command = ['/usr/bin/apt-get', '--no-upgrade', '--no-remove', '--no-install-recommends', 'install', *packages]
    plan = subprocess.check_output([command[0], '--simulate', *command[1:]], stderr=log, text=True)
    changes = browser_package_changes(plan)
    private_json(PRIVATE / 'browser-package-plan.json', {'new_packages': changes, 'existing_packages_upgraded': False})
    if changes:
        subprocess.run([command[0], '--assume-yes', *command[1:]], env={**os.environ, 'DEBIAN_FRONTEND': 'noninteractive',
                       'NEEDRESTART_MODE': 'l'}, stdout=log, stderr=log, check=True)


def prepare_environment(log):
    verify_server()
    status = json.loads((PRIVATE / 'inspect-status.json').read_text())
    snapshot = Path(status['source_snapshot'])
    if status.get('state') != 'complete' or not snapshot.is_relative_to(PRIVATE):
        raise PreparationError('Verified source snapshot required.')
    manifest = json.loads((snapshot / 'manifest.json').read_text())
    if any(fingerprint(snapshot / name) != value for name, value in manifest['files'].items()):
        raise PreparationError('Source snapshot integrity failed.')
    with contextlib.closing(sqlite3.connect((PANEL / 'data/default.db').as_uri() + '?mode=ro', uri=True)) as connection:
        connection.row_factory = sqlite3.Row
        records = connection.execute('SELECT name,username,password,sid,accept FROM databases WHERE name=?', ('faktury_node',)).fetchall()
        if len(records) != 1:
            raise PreparationError('Separate aaPanel database Faktury required.')
        production = dict(records[0])
    if production['username'] != 'faktury_node_app' or not production['password'] or int(production['sid'] or 0) != 0 or str(production['accept']).lower() not in ['localhost', '127.0.0.1', 'local']:
        raise PreparationError('Unexpected application database access.')
    account = pwd.getpwnam('www')
    for folder in [BASE, BASE / 'repository', SHARED, BASE / 'releases']:
        directory(folder, account)
    for folder in ['storage', 'npm-cache', 'browsers', 'runtime']:
        directory(SHARED / folder, account, writable=True)
    directory(BASE / 'public', account)
    # aaPanel requires this path to exist even for an absolute custom start.
    # Actual dependencies live in each immutable release.
    directory(REPOSITORY / 'node_modules', account, writable=True)
    # Only this newly cloned repository changes owner. Other sites are untouched.
    for folder, subdirectories, files in os.walk(REPOSITORY, followlinks=False):
        os.chown(folder, account.pw_uid, account.pw_gid, follow_symlinks=False)
        os.chmod(folder, 0o750)
        for name in [*subdirectories, *files]:
            os.chown(Path(folder) / name, account.pw_uid, account.pw_gid, follow_symlinks=False)
    plan_file = PRIVATE / 'test-databases.json'
    with mysql_client() as client:
        if not plan_file.exists():
            for name in TEST_SCHEMAS:
                if mysql_query(client, "SELECT SCHEMA_NAME FROM information_schema.SCHEMATA WHERE SCHEMA_NAME='" + name + "'", log):
                    raise PreparationError('Synthetic test database already exists without an ownership marker.')
            if mysql_query(client, "SELECT User FROM mysql.user WHERE User='faktury_node_ci'", log):
                raise PreparationError('Synthetic database account already exists without an ownership marker.')
            private_json(plan_file, {'schemas': TEST_SCHEMAS, 'username': 'faktury_node_ci', 'password': secrets.token_hex(32)})
        plan = json.loads(plan_file.read_text())
        if plan.get('schemas') != TEST_SCHEMAS or plan.get('username') != 'faktury_node_ci' or not re.fullmatch(r'[a-f0-9]{64}', plan.get('password', '')):
            raise PreparationError('Synthetic database ownership marker differs.')
        for name in TEST_SCHEMAS:
            mysql_query(client, 'CREATE DATABASE IF NOT EXISTS `' + name + '` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci', log)
        for host in ['localhost', '127.0.0.1']:
            identity = "'faktury_node_ci'@'" + host + "'"
            mysql_query(client, 'CREATE USER IF NOT EXISTS ' + identity + " IDENTIFIED BY '" + plan['password'] + "'", log)
            for name in TEST_SCHEMAS:
                mysql_query(client, 'GRANT ALL PRIVILEGES ON ' + schema_pattern(name) + '.* TO ' + identity, log)
        # The newly created application's account has no rights to another database.
        grants = mysql_query(client, "SELECT Db FROM mysql.db WHERE User='faktury_node_app'", log).splitlines()
        if not grants or any(name.replace('\\', '') != 'faktury_node' for name in grants):
            raise PreparationError('Application database account has unexpected schema rights.')
        hosts = mysql_query(client, "SELECT Host FROM mysql.user WHERE User='faktury_node_app'", log).splitlines()
        if not hosts or any(host not in ['localhost', '127.0.0.1'] for host in hosts):
            raise PreparationError('Application account must remain loopback-only.')
        for host in hosts:
            identity = "'faktury_node_app'@'" + host + "'"
            global_rights = mysql_query(client, 'SELECT PRIVILEGE_TYPE FROM information_schema.USER_PRIVILEGES WHERE GRANTEE=' +
                                       "CONCAT(CHAR(39),'faktury_node_app',CHAR(39),'@',CHAR(39),'" + host + "',CHAR(39)) AND PRIVILEGE_TYPE<>'USAGE'", log)
            if global_rights:
                raise PreparationError('Application account has unexpected global privileges.')
            mysql_query(client, 'REVOKE ALL PRIVILEGES, GRANT OPTION FROM ' + identity, log)
            mysql_query(client, 'GRANT SELECT,INSERT,UPDATE,DELETE ON ' + schema_pattern('faktury_node') + '.* TO ' + identity, log)
    urls = ['mysql://faktury_node_ci:' + plan['password'] + '@127.0.0.1:3306/' + name for name in TEST_SCHEMAS]
    private_json(PRIVATE / 'synthetic-test-env.json', dict(zip(
        ['TEST_DATABASE_URL', 'SOURCE_TEST_DATABASE_URL', 'E2E_DATABASE_URL', 'LOCAL_MERGE_SOURCE_TEST_URL', 'LOCAL_MERGE_BASELINE_TEST_URL'], urls)))
    env_text = '\n'.join([
        'NODE_ENV=production', 'HOST=127.0.0.1', 'PORT=3110', 'APP_ORIGIN=https://faktury.janpetrik.cz',
        'DATABASE_URL=mysql://faktury_node_app:' + quote(production['password'], safe='') + '@127.0.0.1:3306/faktury_node',
        'STORAGE_DIR=' + str(SHARED / 'storage'), 'SESSION_HOURS=8', 'TRUST_PROXY=loopback',
        'PDF_REVIEW_APPROVED=true', 'PDF_BROWSER_CHANNEL=chromium',
        'PLAYWRIGHT_BROWSERS_PATH=' + str(SHARED / 'browsers'), 'MCP_ENABLED=false', '',
    ])
    env_file = SHARED / 'production.env'
    if env_file.is_symlink() or (env_file.exists() and env_file.read_text() != env_text):
        raise PreparationError('Existing production environment differs; not overwritten.')
    if not env_file.exists():
        with env_file.open('x') as output:
            output.write(env_text)
        os.chown(env_file, 0, account.pw_gid, follow_symlinks=False)
        env_file.chmod(0o640)
    private_json(PRIVATE / 'environment-status.json', {'state': 'installing_runtime', 'legacy_untouched': True})
    app_run([NODE / 'npm', 'install', '--prefix', SHARED / 'runtime', '--no-package-lock', '--no-audit', '--no-fund',
             '--ignore-scripts', 'npm@11.9.0', 'playwright@1.64.1'], log, SHARED / 'runtime')
    app_run([SHARED / 'runtime/node_modules/.bin/playwright', 'install', '--only-shell', 'chromium'], log)
    install_browser_libraries(log)
    app_run([NODE / 'node', '--input-type=module', '-e',
             "import {chromium} from 'playwright';const browser=await chromium.launch();try{const page=await browser.newPage();"
             "await page.setContent('<html><body>Synthetic PDF smoke test</body></html>');const pdf=await page.pdf();"
             "if(pdf.subarray(0,5).toString()!=='%PDF-')throw new Error('PDF_SMOKE_FAILED');}finally{await browser.close();}"],
            log, SHARED / 'runtime')
    private_json(PRIVATE / 'environment-status.json', {'state': 'prepared', 'legacy_untouched': True,
                                                     'production_data_loaded': False, 'synthetic_pdf_passed': True})
    print(json.dumps({'stage': 'prepare_environment', 'state': 'prepared', 'production_data_loaded': False}))


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    actions = parser.add_mutually_exclusive_group(required=True)
    actions.add_argument('--inspect', action='store_true')
    actions.add_argument('--prepare-environment', action='store_true')
    arguments = parser.parse_args()
    os.umask(0o077)
    try:
        verify_server()
        with (PRIVATE / 'preparation-diagnostics.log').open('a') as log:
            try:
                inspect(log) if arguments.inspect else prepare_environment(log)
            except Exception:
                traceback.print_exc(file=log)
                raise
    except Exception:
        # A failed initial filesystem/project check must also leave a private reason.
        if PRIVATE.is_dir() and not PRIVATE.is_symlink() and PRIVATE.stat().st_uid == 0:
            with (PRIVATE / 'preparation-diagnostics.log').open('a') as log:
                traceback.print_exc(file=log)
        print(json.dumps({'stage': 'inspect' if arguments.inspect else 'prepare_environment', 'state': 'failed',
                          'message': 'Stopped; private diagnostics only. Legacy not modified.'}))
        raise SystemExit(1) from None
