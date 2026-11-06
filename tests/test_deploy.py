import hashlib
import hmac
import importlib.util
import json
from pathlib import Path
import tempfile
import types
import unittest
import sqlite3
import contextlib
import os
from unittest.mock import patch

def module(name, file):
    spec = importlib.util.spec_from_file_location(name, Path(__file__).parent.parent / 'scripts' / file)
    result = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(result)
    return result

webhook = module('webhook', 'deploy-webhook.py')
deploy = module('deploy', 'aapanel-deploy.py')
prepare = module('prepare', 'aapanel-prepare.py')
transfer = module('transfer', 'aapanel-transfer.py')

class WebhookTests(unittest.TestCase):
    def test_transfer_refuses_existing_production_data_and_paths_outside_private_storage(self):
        transfer.require_empty_database('')
        with self.assertRaises(transfer.TransferError):
            transfer.require_empty_database('users\ninvoices')
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp) / 'storage';root.mkdir()
            outside = Path(tmp) / 'outside';outside.mkdir()
            (root / 'link').symlink_to(outside, target_is_directory=True)
            self.assertEqual(transfer.inside(root, 'pdf/file.pdf'), root / 'pdf/file.pdf')
            for path in ['../outside/file', '/etc/passwd', 'link/file']:
                with self.assertRaises(transfer.TransferError):
                    transfer.inside(root, path)

    def test_browser_packages_never_upgrade_remove_or_configure_unrelated_software(self):
        self.assertEqual(prepare.browser_package_changes('Inst libnss3 (1.0 Ubuntu:26.04 [amd64])\nConf libnss3 (1.0 Ubuntu:26.04 [amd64])'), ['libnss3'])
        for plan in ['Inst libnss3 [0.9] (1.0 Ubuntu [amd64])', 'Remv apache2 [2.4]',
                     'Inst systemd (1.0 Ubuntu [amd64])', 'Conf mariadb-server (12.3.2 Ubuntu [amd64])']:
            with self.assertRaises(prepare.PreparationError):
                prepare.browser_package_changes(plan)

    def test_legacy_configuration_is_read_as_a_literal_without_php_execution(self):
        source = "$db['default'] = array(\n 'database' => 'faktury',\n);"
        self.assertEqual(prepare.source_database(source), 'faktury')
        for invalid in [source.replace("'faktury'", "get_database()"), source.replace("'faktury'", "'unrelated'"), source + "\n'database' => 'another',"]:
            with self.assertRaises(prepare.PreparationError):
                prepare.source_database(invalid)

    def test_database_client_file_is_private_quoted_and_removed(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            (root / 'data').mkdir()
            with contextlib.closing(sqlite3.connect(root / 'data/default.db')) as database:
                database.execute('CREATE TABLE config(id INTEGER PRIMARY KEY,mysql_root TEXT)')
                database.execute('INSERT INTO config VALUES(1,?)', ('synthetic"password\\value',))
                database.commit()
            with patch.object(prepare, 'PANEL', root), patch.object(prepare, 'PRIVATE', root):
                with prepare.mysql_client() as argument:
                    client = Path(argument.split('=', 1)[1])
                    self.assertEqual(client.stat().st_mode & 0o777, 0o600)
                    self.assertIn('protocol=SOCKET', client.read_text())
                    self.assertIn('synthetic\\"password\\\\value', client.read_text())
                self.assertFalse(client.exists())
    def setUp(self):
        self.secret = b'SYNTHETIC_TEST_SECRET_' * 3
        self.body = json.dumps({'ref': 'refs/heads/main', 'after': 'a' * 40,
                                'repository': {'full_name': 'synthetic/faktury'}}).encode()
        self.headers = {'X-GitHub-Event': 'push', 'X-GitHub-Delivery': '12345678-1234-1234-1234-123456789012',
                        'X-Hub-Signature-256': 'sha256=' + hmac.new(self.secret, self.body, hashlib.sha256).hexdigest()}
    def test_valid(self):
        delivery, sha = webhook.validate(self.headers, self.body, self.secret, 'synthetic/faktury')
        self.assertEqual(sha, 'a' * 40)
        with tempfile.TemporaryDirectory() as tmp:
            queue = Path(tmp) / 'queue.db'
            webhook.enqueue(queue, delivery, sha)
            with self.assertRaises(webhook.Rejected):
                webhook.enqueue(queue, delivery, sha)
    def test_signature_repo_and_event(self):
        for headers, body, repository in [
            ({**self.headers, 'X-Hub-Signature-256': 'sha256=bad'}, self.body, 'synthetic/faktury'),
            (self.headers, self.body, 'foreign/repository'),
            ({**self.headers, 'X-GitHub-Event': 'ping'}, self.body, 'synthetic/faktury')]:
            with self.assertRaises(webhook.Rejected):
                webhook.validate(headers, body, self.secret, repository)
    def test_branch_and_command_payload(self):
        for value in ['refs/heads/other', 'main; touch /tmp/never']:
            body = json.dumps({'ref': value, 'after': 'b' * 40, 'repository': {'full_name': 'synthetic/faktury'}}).encode()
            headers = {**self.headers, 'X-Hub-Signature-256': 'sha256=' + hmac.new(self.secret, body, hashlib.sha256).hexdigest()}
            with self.assertRaises(webhook.Rejected):
                webhook.validate(headers, body, self.secret, 'synthetic/faktury')
    def test_atomic_activation(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            a, b, current = root / 'a', root / 'b', root / 'current'
            a.mkdir(); b.mkdir()
            deploy.activate(current, a)
            self.assertEqual(current.resolve(), a.resolve())
            deploy.activate(current, b)
            self.assertEqual(current.resolve(), b.resolve())
    def test_release_sealing_never_changes_symlink_targets(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp) / 'release';root.mkdir()
            outside = Path(tmp) / 'outside';outside.mkdir()
            secret = outside / 'private.txt';secret.write_text('synthetic');secret.chmod(0o600)
            code = root / 'main.js';code.write_text('synthetic');code.chmod(0o644)
            executable = root / 'tool';executable.write_text('synthetic');executable.chmod(0o755)
            (root / 'env-link').symlink_to(secret)
            (root / 'directory-link').symlink_to(outside, target_is_directory=True)
            deploy.seal_release(root, os.getgid(), os.getuid())
            self.assertEqual(secret.stat().st_mode & 0o777, 0o600)
            self.assertEqual(code.stat().st_mode & 0o777, 0o640)
            self.assertEqual(executable.stat().st_mode & 0o777, 0o750)
            self.assertEqual(root.stat().st_mode & 0o777, 0o750)
    def test_panel_is_fail_closed(self):
        with self.assertRaises(deploy.DeployError):
            deploy.deploy({'panel_verified': False}, 'a' * 40)
        with self.assertRaises(deploy.DeployError):
            deploy.readiness('https://external.example/health/ready', 'example.test', 'a' * 40)
    def test_native_restart_adapter(self):
        calls = []
        class Manager:
            def get_project_run_state(self, **_kw): return True
            def restart_project(self, args):
                calls.append(args.project_name)
                return {'status': True}
        class App:
            def test_request_context(self):
                import contextlib
                return contextlib.nullcontext()
        deploy.restart((types.SimpleNamespace(dict_obj=types.SimpleNamespace), App(), Manager), 'synthetic-project')
        self.assertEqual(calls, ['synthetic-project'])

    def test_test_database_configuration(self):
        with tempfile.TemporaryDirectory() as tmp:
            config = Path(tmp) / 'test-env.json'
            for values in [
                {'TEST_DATABASE_URL': 'mysql://synthetic@localhost/production'},
                {'TEST_DATABASE_URL': 'mysql://synthetic@localhost/a_test', 'DATABASE_URL': 'mysql://synthetic@localhost/production'},
                {'TEST_DATABASE_URL': 'mysql://synthetic@localhost/a_test', 'E2E_DATABASE_URL': 'mysql://other@localhost/a_test'},
            ]:
                config.write_text(json.dumps(values))
                with self.assertRaises(deploy.DeployError):
                    deploy.test_environment(config)
            config.write_text(json.dumps({'TEST_DATABASE_URL': 'mysql://synthetic@localhost/a_test'}))
            self.assertIn('TEST_DATABASE_URL', deploy.test_environment(config))

    def test_git_manager_build_is_isolated_and_schema_check_is_read_only(self):
        self.run_deployment()

    def test_failed_readiness_restores_code_without_touching_database(self):
        self.run_deployment(fail_readiness=True)

    def run_deployment(self, fail_readiness=False):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            tests = root / 'tests.json'
            tests.write_text(json.dumps({'TEST_DATABASE_URL': 'mysql://synthetic@localhost/a_test'}))
            (root / 'production.env').write_text('DATABASE_URL=mysql://synthetic@localhost/production\n')
            (root / 'old').mkdir()
            current = root / 'current'
            current.symlink_to(root / 'old')
            cfg = {'panel_verified': True, 'run_user': 'synthetic', 'mirror': str(root),
                   'releases': str(root / 'releases'), 'current': str(current),
                   'node_bin_dir': '/synthetic/bin', 'node_version': 'v26.13.0', 'npm_cache': str(root / 'cache'),
                   'test_env_file': str(tests), 'env_file': str(root / 'production.env'),
                   'panel_dir': '/synthetic/panel', 'project_name': 'synthetic',
                   'readiness_url': 'http://127.0.0.1:3100/health/ready', 'host_header': 'synthetic.test'}
            calls = []
            sha = 'a' * 40

            def command(argv, cwd, env, user=None, stdout=None):
                calls.append(argv)
                self.assertEqual(user, 'synthetic')
                if argv == ['node', '--version']:
                    return b'v26.13.0'
                if argv == ['npm', '--version']:
                    return b'11.9.0'
                if argv[:3] == ['git', 'remote', 'get-url']:
                    return b'https://github.com/petrikjan/faktury.git\n'
                if argv[:2] == ['git', 'rev-parse']:
                    return sha.encode()
                if argv == ['npm', 'run', 'check']:
                    self.assertFalse((cwd / '.env').exists())
                    self.assertIn('TEST_DATABASE_URL', env)
                    self.assertNotIn('DATABASE_URL', env)
                if argv == ['npm', 'run', 'db:check']:
                    self.assertTrue((cwd / '.env').is_symlink())
                    self.assertNotIn('TEST_DATABASE_URL', env)
                    self.assertEqual(env['NODE_ENV'], 'production')
                    self.assertEqual(env['DEPLOY_SHA'], sha)
                return b''

            account = types.SimpleNamespace(pw_uid=1000, pw_gid=1000, pw_name='synthetic', pw_dir='/synthetic')
            with patch.object(deploy, 'run', side_effect=command), \
                 patch.object(deploy.pwd, 'getpwnam', return_value=account), \
                 patch.object(deploy.os, 'chown'), \
                 patch.object(deploy, 'seal_release'), \
                 patch.object(deploy, 'native_model', return_value=object()), \
                 patch.object(deploy, 'restart') as restart, \
                 patch.object(deploy, 'readiness', side_effect=deploy.DeployError('synthetic failure') if fail_readiness else None):
                if fail_readiness:
                    with self.assertRaises(deploy.DeployError):
                        deploy.deploy(cfg, None)
                    self.assertEqual(current.resolve(), (root / 'old').resolve())
                    self.assertEqual(restart.call_count, 2)
                else:
                    self.assertEqual(deploy.deploy(cfg, None), sha)
                    self.assertEqual(current.resolve().name, sha)
                    self.assertEqual(restart.call_count, 1)
            self.assertIn(['npm', 'run', 'db:check'], calls)
            self.assertIn(['npm', 'run', 'test:e2e'], calls)
            self.assertNotIn(['npm', 'run', 'db:migrate'], calls)

if __name__ == '__main__':
    unittest.main()
