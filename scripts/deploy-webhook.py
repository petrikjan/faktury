#!/usr/bin/env python3
"""Loopback-only, signed push → private SHA queue. No deploy shell endpoint."""
import hashlib
import hmac
import http.server
import json
import os
from pathlib import Path
import re
import sqlite3
import time

class Rejected(Exception):
    pass

def validate(headers, body, secret, repository):
    if len(body) > 262144 or headers.get('X-GitHub-Event') != 'push':
        raise Rejected()
    signature = headers.get('X-Hub-Signature-256', '')
    if not hmac.compare_digest(signature, 'sha256=' + hmac.new(secret, body, hashlib.sha256).hexdigest()):
        raise Rejected()
    event = json.loads(body)
    delivery = headers.get('X-GitHub-Delivery', '')
    sha = event.get('after', '')
    if (not re.fullmatch(r'[a-fA-F0-9-]{16,64}', delivery) or
        event.get('repository', {}).get('full_name') != repository or
        event.get('ref') != 'refs/heads/main' or event.get('deleted') or
        not re.fullmatch(r'[a-f0-9]{40}', sha) or sha == '0' * 40):
        raise Rejected()
    return delivery, sha

def enqueue(path, delivery, sha):
    connection = sqlite3.connect(path, timeout=10)
    try:
        connection.execute('CREATE TABLE IF NOT EXISTS events(delivery TEXT PRIMARY KEY, sha TEXT NOT NULL, received INTEGER NOT NULL, state TEXT NOT NULL)')
        with connection:
            connection.execute('INSERT INTO events VALUES(?,?,?,?)', (delivery, sha, int(time.time()), 'queued'))
    except sqlite3.IntegrityError:
        raise Rejected() from None
    finally:
        connection.close()

class Handler(http.server.BaseHTTPRequestHandler):
    def do_POST(self):
        try:
            if self.path != '/github-push' or self.headers.get('Transfer-Encoding'):
                raise Rejected()
            length = int(self.headers.get('Content-Length', '0'))
            if not 0 < length <= 262144:
                raise Rejected()
            body = self.rfile.read(length)
            delivery, sha = validate(self.headers, body, self.server.secret, self.server.repository)
            enqueue(self.server.queue, delivery, sha)
            self.send_response(202)
        except (Rejected, ValueError, json.JSONDecodeError):
            self.send_response(400)
        self.send_header('Content-Length', '0')
        self.end_headers()
    def log_message(self, *_args):
        pass

if __name__ == '__main__':
    os.umask(0o077)
    secret = os.environ['DEPLOY_WEBHOOK_SECRET'].encode()
    if len(secret) < 32:
        raise SystemExit('Webhook configuration rejected.')
    queue = Path(os.environ['DEPLOY_QUEUE']).resolve()
    queue.parent.mkdir(parents=True, exist_ok=True)
    server = http.server.HTTPServer(('127.0.0.1', int(os.environ.get('DEPLOY_WEBHOOK_PORT', '3198'))), Handler)
    server.secret = secret
    server.repository = os.environ['DEPLOY_REPOSITORY']
    server.queue = queue
    server.serve_forever()
