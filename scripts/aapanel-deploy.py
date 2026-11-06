#!/usr/bin/env python3
"""Protected aaPanel runner. A main push deploys code, never imports/migrates data."""
import argparse
import contextlib
import fcntl
import importlib.util
import io
import json
import os
from pathlib import Path
import pwd
import re
import subprocess
import sys
import sqlite3
import stat
import time
import urllib.request
from urllib.parse import urlsplit
from uuid import uuid4

LOG = None

class DeployError(Exception):
    pass

def run(argv, cwd, env, user=None, stdout=None):
    def demote():
        if user and os.geteuid() == 0:
            account = pwd.getpwnam(user)
            os.initgroups(user, account.pw_gid)
            os.setgid(account.pw_gid)
            os.setuid(account.pw_uid)
    result = subprocess.run(argv, cwd=cwd, env=env, stdin=subprocess.DEVNULL,
                            stdout=stdout or LOG or subprocess.DEVNULL, stderr=LOG or subprocess.DEVNULL,
                            preexec_fn=demote if user else None, check=False)
    if result.returncode:
        raise DeployError('Command failed; no private output is exposed.')
    return result.stdout

def seal_release(root, group, owner=0):
    """Make activated code read-only to the app; never follow repository symlinks."""
    for _directory, _subdirs, files, descriptor in os.fwalk(root, follow_symlinks=False):
        os.fchown(descriptor, owner, group)
        os.fchmod(descriptor, 0o750)
        for name in files:
            try:
                file = os.open(name, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK, dir_fd=descriptor)
            except OSError:
                if stat.S_ISLNK(os.stat(name, dir_fd=descriptor, follow_symlinks=False).st_mode):
                    continue
                raise
            try:
                mode = os.fstat(file).st_mode
                if not stat.S_ISREG(mode):
                    raise DeployError('Unexpected release file type.')
                os.fchown(file, owner, group)
                os.fchmod(file, 0o750 if mode & 0o111 else 0o640)
            finally:
                os.close(file)

def test_environment(path):
    values = json.loads(Path(path).read_text())
    allowed = {'TEST_DATABASE_URL', 'SOURCE_TEST_DATABASE_URL', 'E2E_DATABASE_URL',
               'LOCAL_MERGE_SOURCE_TEST_URL', 'LOCAL_MERGE_BASELINE_TEST_URL'}
    if not isinstance(values, dict) or set(values) - allowed or 'TEST_DATABASE_URL' not in values:
        raise DeployError('Invalid synthetic test configuration.')
    databases = []
    for value in values.values():
        url = urlsplit(value)
        if url.scheme != 'mysql' or not re.fullmatch(r'/[a-zA-Z0-9_]+_test', url.path):
            raise DeployError('Separate synthetic test DB required.')
        databases.append((url.hostname, url.port or 3306, url.path))
    if len(set(databases)) != len(databases):
        raise DeployError('Synthetic test databases must be distinct.')
    return values

def native_model(panel):
    panel = Path(panel).resolve()
    sys.path[:0] = [str(panel), str(panel / 'class')]
    os.chdir(panel)
    with contextlib.redirect_stdout(io.StringIO()), contextlib.redirect_stderr(io.StringIO()):
        spec = importlib.util.find_spec('projectModel.nodejsModel')
        if not spec or not spec.origin:
            raise DeployError('Node manager missing.')
        origin = Path(spec.origin).resolve()
        if not origin.is_relative_to(panel / 'class/projectModel') or origin.stat().st_uid != 0 or origin.stat().st_mode & 0o022:
            raise DeployError('Untrusted Node manager.')
        import public
        from BTPanel import app
        from projectModel.nodejsModel import main
    for name in ['get_project_run_state', 'restart_project', 'start_project']:
        if not callable(getattr(main, name, None)):
            raise DeployError('Unsupported Node manager.')
    return public, app, main

def restart(native, project):
    public, app, cls = native
    with contextlib.redirect_stdout(io.StringIO()), contextlib.redirect_stderr(io.StringIO()), app.test_request_context():
        manager = cls()
        args = public.dict_obj()
        args.project_name = project
        result = manager.restart_project(args) if manager.get_project_run_state(project_name=project) else manager.start_project(args)
        if not isinstance(result, dict) or result.get('status') is not True:
            raise DeployError('Native restart failed.')

def readiness(url, host, sha):
    if not re.fullmatch(r'http://127\.0\.0\.1:\d+/health/ready', url):
        raise DeployError('Readiness must use loopback.')
    opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))
    for _ in range(45):
        try:
            with opener.open(urllib.request.Request(url, headers={'Host': host}), timeout=3) as response:
                state = json.load(response)
                if response.status == 200 and state.get('ok') is True and state.get('sha') == sha:
                    return
        except Exception:
            pass
        time.sleep(1)
    raise DeployError('DB/SHA readiness failed.')

def activate(link, target):
    temp = link.with_name(link.name + '.next')
    temp.unlink(missing_ok=True)
    temp.symlink_to(target, target_is_directory=True)
    temp.replace(link)

def deploy(cfg, sha):
    if (sha is not None and not re.fullmatch(r'[a-f0-9]{40}', sha)) or cfg.get('panel_verified') is not True:
        raise DeployError('Panel verification or SHA missing.')
    if cfg['run_user'] == 'root':
        raise DeployError('Application must not run as root.')
    mirror, releases, current = [Path(cfg[k]).resolve() if k != 'current' else Path(cfg[k]).absolute() for k in ['mirror', 'releases', 'current']]
    account = pwd.getpwnam(cfg['run_user'])
    env = {'PATH': cfg.get('npm_bin_dir', cfg['node_bin_dir']) + ':' + cfg['node_bin_dir'] + ':/usr/bin:/bin', 'NODE_ENV': 'development',
           'HOME': account.pw_dir, 'USER': account.pw_name, 'LOGNAME': account.pw_name,
           'LANG': 'C.UTF-8', 'NPM_CONFIG_CACHE': cfg['npm_cache']}
    if cfg.get('browser_cache'):
        env.update(PLAYWRIGHT_BROWSERS_PATH=cfg['browser_cache'], PDF_BROWSER_CHANNEL='chromium', PLAYWRIGHT_SKIP_BROWSER_GC='1')
    # Test secrets live on the server and never come from the push payload.
    test_env = test_environment(cfg['test_env_file'])
    env.update(test_env)
    node_version = run(['node', '--version'], mirror, env, cfg['run_user'], subprocess.PIPE).decode().strip()
    if node_version != cfg['node_version'] or node_version != 'v26.13.0':
        raise DeployError('Unexpected Node runtime; other projects are not changed.')
    npm_version = run(['npm', '--version'], mirror, env, cfg['run_user'], subprocess.PIPE).decode().strip()
    if npm_version != '11.9.0':
        raise DeployError('Pinned npm version required.')
    remote = run(['git', 'remote', 'get-url', 'origin'], mirror, env, cfg['run_user'], subprocess.PIPE).decode().strip()
    if remote not in ['https://github.com/petrikjan/faktury.git', 'git@github.com:petrikjan/faktury.git']:
        raise DeployError('Unexpected repository.')
    run(['git', 'fetch', '--prune', 'origin', 'main'], mirror, env, cfg['run_user'])
    main_sha = run(['git', 'rev-parse', 'refs/remotes/origin/main'], mirror, env, cfg['run_user'], subprocess.PIPE).decode().strip()
    sha = sha or main_sha
    if not re.fullmatch(r'[a-f0-9]{40}', sha):
        raise DeployError('Invalid main revision.')
    run(['git', 'cat-file', '-e', sha + '^{commit}'], mirror, env, cfg['run_user'])
    run(['git', 'merge-base', '--is-ancestor', sha, 'refs/remotes/origin/main'], mirror, env, cfg['run_user'])
    native = native_model(cfg['panel_dir'])
    if current.is_symlink() and current.resolve().name == sha:
        readiness(cfg['readiness_url'], cfg['host_header'], sha)
        return sha
    final_release = releases / sha
    if final_release.exists() or final_release.is_symlink():
        raise DeployError('Inactive release already exists; review before reusing it.')
    release = releases / ('.building-' + sha + '-' + uuid4().hex)
    release.mkdir(parents=True, exist_ok=False)
    archive = release / 'source.tar'
    with archive.open('wb') as out:
        run(['git', 'archive', '--format=tar', sha], mirror, env, cfg['run_user'], stdout=out)
    # Git content, including archive extraction, never executes as root.
    os.chown(release, account.pw_uid, account.pw_gid, follow_symlinks=False)
    os.chown(archive, account.pw_uid, account.pw_gid, follow_symlinks=False)
    run(['tar', '-xf', str(archive), '--no-same-owner', '--no-same-permissions'], release, env, cfg['run_user'])
    archive.unlink()
    if any((release / name).exists() or (release / name).is_symlink() for name in ['.env', '.release.env']):
        raise DeployError('Repository must not contain production configuration.')
    # Install dev dependencies for checks; start never runs a seed/import.
    run(['npm', 'ci', '--include=dev'], release, env, cfg['run_user'])
    if cfg.get('browser_cache'):
        run(['npm', 'exec', '--', 'playwright', 'install', 'chromium'], release, env, cfg['run_user'])
    run(['npm', 'run', 'check'], release, env, cfg['run_user'])
    run(['npm', 'run', 'test:e2e'], release, env, cfg['run_user'])
    production = {key: value for key, value in env.items() if key not in test_env}
    production.update(NODE_ENV='production', DEPLOY_SHA=sha)
    (release / '.env').symlink_to(Path(cfg['env_file']).resolve())
    # Read-only comparison. A new/changed migration stops the deployment before activation.
    run(['npm', 'run', 'db:check'], release, production, cfg['run_user'])
    # Persist SHA in a release-local, nonsecret environment file and start script.
    run(['node', '-e', "require('node:fs').writeFileSync('.release.env', 'DEPLOY_SHA=' + process.argv[1] + '\\n', {flag:'wx', mode:0o600})", sha],
        release, production, cfg['run_user'])
    seal_release(release, account.pw_gid)
    release.rename(final_release)
    release = final_release
    previous = current.resolve() if current.is_symlink() else None
    try:
        activate(current, release)
        restart(native, cfg['project_name'])
        readiness(cfg['readiness_url'], cfg['host_header'], sha)
    except Exception:
        if previous:
            activate(current, previous)
            restart(native, cfg['project_name'])
        raise
    # Deliberately no DB rollback.
    return sha

def main():
    global LOG
    parser = argparse.ArgumentParser()
    parser.add_argument('--config', required=True)
    group = parser.add_mutually_exclusive_group(required=True)
    group.add_argument('--sha')
    group.add_argument('--queue', action='store_true')
    group.add_argument('--main', action='store_true', help='aaPanel Git Manager: deploy current origin/main')
    args = parser.parse_args()
    os.umask(0o077)
    config_path = Path(args.config).resolve()
    if os.geteuid() != 0 or config_path.stat().st_uid != 0 or config_path.stat().st_mode & 0o022:
        raise DeployError('Writable deploy configuration rejected.')
    cfg = json.loads(config_path.read_text())
    if cfg.get('log_file'):
        LOG = open(cfg['log_file'], 'a')
    with open(cfg['lock_file'], 'a') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        sha, delivery = args.sha, None
        queue = None
        if args.queue:
            queue = sqlite3.connect(cfg['queue_file'], timeout=10)
            with queue:
                queue.execute('BEGIN IMMEDIATE')
                event = queue.execute("SELECT delivery,sha FROM events WHERE state='queued' ORDER BY received,delivery LIMIT 1").fetchone()
                if not event:
                    queue.close()
                    return
                delivery, sha = event
                queue.execute("UPDATE events SET state='running' WHERE delivery=?", (delivery,))
        try:
            current = Path(cfg['current'])
            if current.is_symlink() and current.resolve().name == sha:
                readiness(cfg['readiness_url'], cfg['host_header'], sha)
            else:
                sha = deploy(cfg, sha)
            if queue:
                with queue: queue.execute("UPDATE events SET state='ready' WHERE delivery=?", (delivery,))
        except Exception:
            if queue:
                with queue: queue.execute("UPDATE events SET state='failed' WHERE delivery=?", (delivery,))
            raise
        finally:
            if queue: queue.close()
    print(json.dumps({'state': 'ready', 'sha': sha}))

if __name__ == '__main__':
    try:
        main()
    except Exception:
        print(json.dumps({'state': 'failed', 'message': 'Deployment stopped; DB not rolled back.'}))
        raise SystemExit(1) from None
