#!/usr/bin/env python3
"""Read-only server inventory. Never reads credentials or business records."""
import json
import os
from pathlib import Path
import shutil
import sqlite3
import subprocess


def version(executable, *args):
    try:
        result = subprocess.run([str(executable), *args], capture_output=True,
                                text=True, timeout=10, check=False)
        return result.stdout.strip().splitlines()[0][:200] if result.returncode == 0 else None
    except (OSError, subprocess.TimeoutExpired, IndexError):
        return None


def inventory():
    panel = Path('/www/server/panel')
    projects = []
    database = panel / 'data/default.db'
    if database.exists():
        with sqlite3.connect(database.as_uri() + '?mode=ro', uri=True) as connection:
            connection.row_factory = sqlite3.Row
            for row in connection.execute(
                    'SELECT name,path,project_type,project_config FROM sites '
                    'WHERE name IN (?, ?, ?)', ('faktury.janpetrik.cz', 'faktury', 'maxner')):
                try:
                    config = json.loads(row['project_config'] or '{}')
                except (ValueError, TypeError):
                    config = {}
                projects.append({
                    'name': row['name'], 'path': row['path'], 'type': row['project_type'],
                    'runtime': {key: config[key] for key in
                                ['nodejs_version', 'run_user', 'port'] if key in config},
                })
    runtimes = [{'path': str(path), 'version': version(path, '--version')}
                for path in sorted(Path('/www/server/nodejs').glob('*/bin/node'))]
    clients = [path for path in [Path('/www/server/mysql/bin/mysql'),
                                Path('/www/server/mysql/bin/mariadb')] if path.is_file()]
    browsers = [path for name in ['google-chrome', 'google-chrome-stable', 'chromium', 'chromium-browser']
                if (path := shutil.which(name))]
    return {
        'state': 'read_only_inventory', 'root': os.geteuid() == 0,
        'panel_present': panel.is_dir(), 'projects': projects, 'node': runtimes,
        'database_clients': [{'path': str(path), 'version': version(path, '--version')} for path in clients],
        'browsers': [{'path': path, 'version': version(path, '--version')} for path in browsers],
        'apache_present': Path('/www/server/apache/bin/apachectl').is_file(),
        'git_present': shutil.which('git') is not None,
    }


if __name__ == '__main__':
    try:
        print(json.dumps(inventory(), ensure_ascii=False, indent=2))
    except Exception:
        print(json.dumps({'state': 'inventory_failed', 'message': 'Read-only inventory failed; no credentials printed.'}))
        raise SystemExit(1) from None
