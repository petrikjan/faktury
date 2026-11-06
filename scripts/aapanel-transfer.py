#!/usr/bin/env python3
"""First transfer of the stopped local Node DB into this app's empty server DB."""
import argparse
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import pwd
import secrets
import shutil
import subprocess
import tarfile
import traceback

PRIVATE = Path('/root/faktury-node-deploy-20261106')
BASE = Path('/www/wwwroot/faktury-node')
LEGACY = Path('/www/wwwroot/faktury.janpetrik.cz')
NODE = Path('/www/server/nodejs/v26.13.0/bin/node')
DATABASE = 'faktury_node'
BUNDLE = 'server-transfer-delta-20261106'


class TransferError(Exception):
    pass


def digest(path):
    value = hashlib.sha256()
    with path.open('rb') as file:
        for block in iter(lambda: file.read(1024 * 1024), b''):
            value.update(block)
    return value.hexdigest()


def inside(root, relative):
    if not isinstance(relative, str) or not relative or Path(relative).is_absolute() or '..' in Path(relative).parts:
        raise TransferError('Unsafe transfer path.')
    path = root / relative
    if not path.resolve().is_relative_to(root.resolve()):
        raise TransferError('Transfer path outside its directory.')
    return path


def require_empty_database(tables):
    if tables.strip():
        raise TransferError('Production target is not empty; never reset or overwrite it.')


def transfer_members(archive, staging):
    members = []
    for entry in archive.getmembers():
        inside(staging, entry.name)
        if not entry.isdir() and not entry.isfile():
            raise TransferError('Unexpected transfer archive member type.')
        # macOS tar can add AppleDouble resource metadata. It is never data to
        # restore, and must not be extracted into either private or live storage.
        if entry.isfile() and Path(entry.name).name.startswith('._'):
            continue
        if Path(entry.name).parts[0] != BUNDLE:
            raise TransferError('Unexpected transfer archive member.')
        members.append(entry)
    return members


def protected_prepare():
    path = PRIVATE / 'aapanel-prepare.py'
    if path.is_symlink() or path.stat().st_uid != 0 or path.stat().st_mode & 0o022:
        raise TransferError('Untrusted preparation helper.')
    spec = importlib.util.spec_from_file_location('faktury_preparation', path)
    helper = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(helper)
    helper.verify_server()
    return helper


ROW_VERIFIER = r"""
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import mysql from './node_modules/mysql2/promise.js';
process.loadEnvFile('/www/wwwroot/faktury-node/shared/production.env');
const manifest=JSON.parse(readFileSync(0,'utf8'));
const db=await mysql.createConnection({uri:process.env.DATABASE_URL,dateStrings:true,
 supportBigNumbers:true,bigNumberStrings:true,charset:'utf8mb4',timezone:'Z'});
try{
 await db.query("SET time_zone='+00:00'");
 const [tables]=await db.query('SHOW TABLES');
 const actual=tables.map(row=>Object.values(row)[0]).sort();
 if(JSON.stringify(actual)!==JSON.stringify(Object.keys(manifest.tables).sort()))throw new Error('TABLE_MISMATCH');
 for(const name of actual){
  if(!/^[a-z_]+$/.test(name))throw new Error('TABLE_NAME');
  const [rows]=await db.query('SELECT * FROM `'+name+'`');
  const values=rows.map(row=>JSON.stringify(Object.keys(row).sort().map(key=>[key,row[key]]))).sort();
  const hash=createHash('sha256').update(JSON.stringify(values)).digest('hex');
  if(rows.length!==manifest.tables[name].rows||hash!==manifest.tables[name].sha256)throw new Error('ROW_MISMATCH');
 }
}finally{await db.end();}
"""


def verify_rows(helper, manifest, log):
    subprocess.run(['/usr/sbin/runuser', '-u', 'www', '--', str(NODE), '--input-type=module', '-e', ROW_VERIFIER],
                   cwd=BASE / 'shared/runtime', env=helper.app_environment(),
                   input=manifest, stdout=log, stderr=log, check=True)


def verify_existing(archive, expected, log):
    helper = protected_prepare()
    status = json.loads((PRIVATE / 'transfer-status.json').read_text())
    if status.get('state') != 'complete' or archive.is_symlink() or not archive.is_relative_to(PRIVATE) or digest(archive) != expected:
        raise TransferError('Verified prior transfer and its original artifact required.')
    with tarfile.open(archive, 'r:gz') as source:
        manifest = json.load(source.extractfile(BUNDLE + '/manifest.json'))
        row_manifest = source.extractfile(BUNDLE + '/row-manifest.json').read()
    storage = BASE / 'shared/storage'
    expected_files = {file['path']: file['sha256'] for file in manifest['files']}
    actual = set()
    for folder, directories, files in os.walk(storage, followlinks=False):
        for name in directories + files:
            if (Path(folder) / name).is_symlink():
                raise TransferError('Unexpected private storage symlink.')
        for name in files:
            actual.add(str((Path(folder) / name).relative_to(storage)))
    if actual != set(expected_files):
        raise TransferError('Existing storage differs from the verified transfer.')
    for name, expected_hash in expected_files.items():
        if digest(inside(storage, name)) != expected_hash:
            raise TransferError('Existing private file differs from the verified transfer.')
    verify_rows(helper, row_manifest, log)


def transfer(archive, expected, log):
    helper = protected_prepare()
    if not archive.is_relative_to(PRIVATE) or archive.is_symlink() or not archive.is_file() or digest(archive) != expected:
        raise TransferError('Private transfer artifact integrity failed.')
    os.chown(archive, 0, 0)
    archive.chmod(0o600)
    environment = json.loads((PRIVATE / 'environment-status.json').read_text())
    if environment.get('state') != 'prepared' or environment.get('synthetic_pdf_passed') is not True:
        raise TransferError('Prepared and PDF-tested server required.')
    storage = BASE / 'shared/storage'
    if storage.is_symlink() or not storage.is_dir() or any(storage.iterdir()):
        raise TransferError('Production storage is not empty; not overwritten.')
    with helper.mysql_client() as client:
        require_empty_database(helper.mysql_query(client, 'SHOW TABLES FROM `' + DATABASE + '`', log))
    staging = PRIVATE / ('node-transfer-' + secrets.token_hex(8))
    staging.mkdir(mode=0o700)
    with tarfile.open(archive, 'r:gz') as source:
        source.extractall(staging, members=transfer_members(source, staging), filter='data')
    bundle = staging / BUNDLE
    manifest = json.loads((bundle / 'manifest.json').read_text())
    if manifest.get('version') != 1 or digest(bundle / 'database.sql') != manifest.get('database_sha256'):
        raise TransferError('Database snapshot integrity failed.')
    reuse = json.loads((bundle / 'reuse-map.json').read_text())
    expected_files = {file['path']: file['sha256'] for file in manifest['files']}
    if len(expected_files) != len(manifest['files']) or reuse.get('version') != 1:
        raise TransferError('Unexpected transfer manifest.')
    for file in reuse['files']:
        if expected_files.get(file['target']) != file['sha256']:
            raise TransferError('Reused file not in the verified snapshot.')
        source = inside(LEGACY, file['source'])
        if not source.is_file() or digest(source) != file['sha256']:
            raise TransferError('Existing source file differs; no production restore performed.')
        target = inside(bundle / 'files', file['target'])
        target.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
        shutil.copyfile(source, target)
    for name, expected_hash in expected_files.items():
        file = inside(bundle / 'files', name)
        if not file.is_file() or digest(file) != expected_hash:
            raise TransferError('Private storage snapshot integrity failed.')
    # Install the pinned verifier dependency as the application user, before any restore.
    helper.app_run([BASE / 'shared/runtime/node_modules/.bin/npm', 'install', '--prefix', BASE / 'shared/runtime',
                    '--no-package-lock', '--no-audit', '--no-fund', '--ignore-scripts', 'mysql2@3.24.6'], log,
                   BASE / 'shared/runtime')
    with helper.mysql_client() as client:
        require_empty_database(helper.mysql_query(client, 'SHOW TABLES FROM `' + DATABASE + '`', log))
        with (bundle / 'database.sql').open('rb') as source:
            subprocess.run([str(helper.MYSQL), client, DATABASE], stdin=source, stdout=log, stderr=log, check=True)
    # This reader receives only private digests over stdin. It never prints rows or hashes.
    verify_rows(helper, (bundle / 'row-manifest.json').read_bytes(), log)
    account = pwd.getpwnam('www')
    for name, expected_hash in expected_files.items():
        target = inside(storage, name)
        target.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
        shutil.copyfile(inside(bundle / 'files', name), target)
        if digest(target) != expected_hash:
            raise TransferError('Production file verification failed.')
    for folder, directories, files in os.walk(storage, followlinks=False):
        os.chown(folder, account.pw_uid, account.pw_gid)
        os.chmod(folder, 0o700)
        for name in files:
            path = Path(folder) / name
            os.chown(path, account.pw_uid, account.pw_gid)
            path.chmod(0o600)
    helper.private_json(PRIVATE / 'transfer-status.json', {'state': 'complete', 'every_row_equal': True,
                        'every_file_verified': True, 'legacy_untouched': True, 'public_site_unchanged': True})
    print(json.dumps({'stage': 'transfer', 'state': 'complete', 'every_row_equal': True, 'every_file_verified': True}))


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--archive', type=Path, required=True)
    parser.add_argument('--sha256', required=True)
    args = parser.parse_args()
    os.umask(0o077)
    if os.geteuid() != 0:
        raise SystemExit('Root through aaPanel required.')
    with (PRIVATE / 'transfer-diagnostics.log').open('a') as log:
        try:
            transfer(args.archive.absolute(), args.sha256, log)
        except Exception:
            traceback.print_exc(file=log)
            print(json.dumps({'stage': 'transfer', 'state': 'failed', 'message': 'Stopped; private diagnostics only. No automatic reset.'}))
            raise SystemExit(1) from None
