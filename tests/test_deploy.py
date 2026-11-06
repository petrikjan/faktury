import hashlib
import hmac
import importlib.util
import json
from pathlib import Path
import tempfile
import types
import unittest

def module(name, file):
    spec = importlib.util.spec_from_file_location(name, Path(__file__).parent.parent / 'scripts' / file)
    result = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(result)
    return result

webhook = module('webhook', 'deploy-webhook.py')
deploy = module('deploy', 'aapanel-deploy.py')

class WebhookTests(unittest.TestCase):
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

if __name__ == '__main__':
    unittest.main()
