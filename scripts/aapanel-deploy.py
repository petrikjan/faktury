#!/usr/bin/env python3
"""Prepared server-side runner. Must be reviewed against the target aaPanel first."""
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
import tarfile
import time
import urllib.request

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
                            stdout=stdout or subprocess.DEVNULL, stderr=subprocess.DEVNULL,
                            preexec_fn=demote if user else None, check=False)
    if result.returncode:
        raise DeployError('Command failed; no private output is exposed.')

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
    if not re.fullmatch(r'[a-f0-9]{40}', sha) or cfg.get('panel_verified') is not True:
        raise DeployError('Panel verification or SHA missing.')
    if cfg['run_user'] == 'root':
        raise DeployError('Application must not run as root.')
    mirror, releases, current = [Path(cfg[k]).resolve() if k != 'current' else Path(cfg[k]).absolute() for k in ['mirror', 'releases', 'current']]
    env = {**os.environ, 'PATH': cfg['node_bin_dir'] + ':/usr/bin:/bin', 'NODE_ENV': 'development'}
    # Test secrets live on the server and never come from the push payload.
    test_env = json.loads(Path(cfg['test_env_file']).read_text())
    if not test_env['TEST_DATABASE_URL'].split('?', 1)[0].endswith('_test'):
        raise DeployError('Separate synthetic test DB required.')
    env.update(test_env)
    run(['git', 'fetch', '--prune', 'origin', 'main'], mirror, env)
    run(['git', 'cat-file', '-e', sha + '^{commit}'], mirror, env)
    run(['git', 'merge-base', '--is-ancestor', sha, 'refs/remotes/origin/main'], mirror, env)
    release = releases / sha
    release.mkdir(parents=True, exist_ok=False)
    account = pwd.getpwnam(cfg['run_user'])
    archive = release / 'source.tar'
    with archive.open('wb') as out:
        run(['git', 'archive', '--format=tar', sha], mirror, env, stdout=out)
    with tarfile.open(archive) as tar:
        tar.extractall(release, filter='data')
    archive.unlink()
    (release / '.env').symlink_to(Path(cfg['env_file']).resolve())
    for path in [release, *release.rglob('*')]:
        if not path.is_symlink():
            os.chown(path, account.pw_uid, account.pw_gid)
    # Install dev dependencies for checks; start never runs a seed/import.
    run(['npm', 'ci', '--include=dev'], release, env, cfg['run_user'])
    run(['npm', 'run', 'check'], release, env, cfg['run_user'])
    marker = json.loads(Path(cfg['backup_marker']).read_text())
    if marker.get('sha') != sha or marker.get('verified') is not True or not 0 <= time.time()-marker.get('created_at', 0) <= 3600:
        raise DeployError('Fresh verified offline backup required before migrations.')
    production = {**env, 'NODE_ENV': 'production', 'DEPLOY_SHA': sha}
    production.pop('TEST_DATABASE_URL', None)
    run(['npm', 'run', 'db:migrate'], release, production, cfg['run_user'])
    # Persist SHA in a release-local, nonsecret environment file and start script.
    (release / '.release.env').write_text('DEPLOY_SHA=' + sha + '\n')
    os.chown(release / '.release.env', account.pw_uid, account.pw_gid)
    previous = current.resolve() if current.is_symlink() else None
    native = native_model(cfg['panel_dir'])
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

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--config', required=True)
    group = parser.add_mutually_exclusive_group(required=True)
    group.add_argument('--sha')
    group.add_argument('--queue', action='store_true')
    args = parser.parse_args()
    os.umask(0o077)
    config_path = Path(args.config).resolve()
    if config_path.stat().st_mode & 0o022:
        raise DeployError('Writable deploy configuration rejected.')
    cfg = json.loads(config_path.read_text())
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
                deploy(cfg, sha)
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
