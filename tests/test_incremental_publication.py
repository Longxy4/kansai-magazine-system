"""Exercise cold/warm publishing, bad uploads and recovery from the public site."""
import base64
from contextlib import contextmanager
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
import importlib.util
import io
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import threading
import unittest
from unittest.mock import patch
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'scripts'))
from publication_cache import digest, published_url, valid, renderer_key, fetch_asset
spec = importlib.util.spec_from_file_location('render_batch', ROOT / 'scripts/render-issues.py')
batch = importlib.util.module_from_spec(spec)
spec.loader.exec_module(batch)


class QuietHandler(SimpleHTTPRequestHandler):
    def log_message(self, *args):
        pass


@contextmanager
def site_server(directory):
    server = ThreadingHTTPServer(('127.0.0.1', 0), partial(QuietHandler, directory=str(directory)))
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    try:
        yield f'http://127.0.0.1:{server.server_port}/'
    finally:
        server.shutdown()
        server.server_close()
        thread.join()


class IncrementalPublication(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.home = Path(self.temp.name)
        self.issues, self.build, self.site = [self.home / p for p in ('issues', 'build', 'site')]
        self.issues.mkdir()
        self.calls = []

    def upload(self, name, data=b'healthy PDF'):
        (self.issues / name).write_bytes(data)

    def converter(self, source, destination, timeout):
        self.calls.append(source.name)
        raw = source.read_bytes()
        if raw.startswith(b'bad'):
            (destination / 'pages.json').write_text('partial result')
            raise ValueError('Unreadable PDF fixture')
        image = Image.new('RGB', (20, 30), (len(raw) * 7 % 255, 40, 80))
        data = io.BytesIO()
        image.save(data, 'JPEG')
        pages = [[dict(scale=1, width=20, height=30, dataUrl='data:image/jpeg;base64,' + base64.b64encode(data.getvalue()).decode())]]
        (destination / 'pages.json').write_text(json.dumps(pages))
        (destination / 'interactions.json').write_text(json.dumps(dict(layout='single', tableOfContents=[], pageLinks=[dict(links=[])])))
        shutil.copyfile(source, destination / 'source.pdf')

    def prepare(self, base=''):
        return batch.prepare(ROOT, self.issues, self.build, base, self.converter)

    def build_site(self):
        env = dict(os.environ, MAGAZINE_BUILD_DIR=str(self.build), MAGAZINE_SITE_DIR=str(self.site))
        result = subprocess.run([os.environ.get('NODE', 'node'), str(ROOT / 'scripts/build-site.mjs')],
                                env=env, capture_output=True, text=True, encoding='utf-8', timeout=90)
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        return json.loads((self.site / 'publication.json').read_text())

    def test_unchanged_duplicates_and_changed_uploads(self):
        self.upload('2025-09.pdf')
        self.upload('関西通信2025年9月号.pdf')
        self.upload('2026-07.pdf', b'another issue')
        ready, events = self.prepare()
        self.assertEqual(len(ready), 2)
        self.assertEqual(len(self.calls), 2)
        self.assertEqual(sum(e['status'] == 'duplicate' for e in events), 1)
        self.calls.clear()
        ready, events = self.prepare()
        self.assertEqual(self.calls, [])
        self.assertEqual(sum(e['status'] == 'reused' for e in events), 2)
        self.upload('2026-07.pdf', b'changed PDF')
        self.prepare()
        self.assertEqual(self.calls, ['2026-07.pdf'])

    def test_bad_names_conflicts_and_bad_pdfs_do_not_stop_healthy_issues(self):
        self.upload('2025-09.pdf')
        self.upload('関西通信2025年9月号.pdf', b'conflicting revision')
        self.upload('2026-01.pdf', b'bad PDF')
        self.upload('notes.pdf')
        self.upload('2026-07.pdf', b'second healthy PDF')
        ready, events = self.prepare()
        self.assertEqual([e['id'] for e in ready], ['2025-09', '2026-07'])
        self.assertEqual(sum(e['status'] == 'skipped' for e in events), 3)
        manifest = self.build_site()
        self.assertEqual(len(manifest['issues']), 2)
        self.assertNotIn('2026-01', (self.site / 'index.html').read_text())

    def test_bad_revision_keeps_old_pdf_and_reader_while_other_issue_updates(self):
        self.upload('2025-09.pdf')
        self.upload('2026-07.pdf', b'original July')
        ready, _ = self.prepare()
        self.build_site()
        original = digest(self.site / 'issues/2026-07.pdf')
        self.upload('2026-07.pdf', b'bad revision')
        self.upload('2025-09.pdf', b'healthy update September')
        ready, events = self.prepare()
        self.assertEqual(len(ready), 2)
        self.assertEqual(sum(e['status'] == 'retained' for e in events), 1)
        self.build_site()
        self.assertEqual(digest(self.site / 'issues/2026-07.pdf'), original)
        self.assertEqual((self.site / 'issues/2025-09.pdf').read_bytes(), b'healthy update September')
        self.assertFalse(any(p.name.startswith('.convert-') for p in (self.build / 'objects').iterdir()))

    def test_expired_cache_restores_verified_pages_from_publication_without_conversion(self):
        self.upload('2026-07.pdf')
        self.prepare()
        manifest = self.build_site()
        self.assertLess(len(json.dumps(manifest)), 5000)
        self.build = self.home / 'fresh-build'
        self.calls.clear()
        with site_server(self.site) as base:
            ready, events = self.prepare(base)
        self.assertEqual(self.calls, [])
        self.assertEqual(events[-1]['status'], 'reused')
        self.assertTrue(valid(self.build / 'objects' / ready[0]['cache'], ready[0]['sha256'], renderer_key(ROOT)))
        self.build_site()

    def test_reader_failure_is_isolated_and_old_reader_is_retained(self):
        self.upload('2025-09.pdf')
        self.upload('2026-07.pdf', b'July')
        self.prepare()
        self.build_site()
        old = (self.site / 'read/2026-07/index.html').read_text()
        self.upload('2026-07.pdf', b'new July')
        ready, _ = self.prepare()
        # Simulate an individual corrupted render cache between pipeline stages.
        entry = next(e for e in ready if e['id'] == '2026-07')
        (self.build / 'objects' / entry['cache'] / 'pages.json').write_text('corrupt')
        self.build_site()
        self.assertEqual((self.site / 'read/2026-07/index.html').read_text(), old)
        events = json.loads((self.build / 'publish-report.json').read_text())
        self.assertTrue(any(e['status'] == 'retained' for e in events))
        self.assertEqual(len(json.loads((self.site / 'publication.json').read_text())['issues']), 2)

    def test_deleted_pdf_is_not_restored_and_empty_batch_preserves_old_site(self):
        self.upload('2025-09.pdf')
        self.upload('2026-07.pdf', b'July')
        self.prepare()
        self.build_site()
        (self.issues / '2026-07.pdf').unlink()
        ready, _ = self.prepare()
        self.assertEqual([e['id'] for e in ready], ['2025-09'])
        (self.issues / '2025-09.pdf').unlink()
        before = (self.site / 'publication.json').read_bytes()
        with self.assertRaisesRegex(ValueError, 'No readable issues'):
            self.prepare()
        self.assertEqual((self.site / 'publication.json').read_bytes(), before)

    def test_restore_rejects_tampered_asset_and_reconverts_just_that_issue(self):
        self.upload('2026-07.pdf')
        self.prepare()
        self.build_site()
        (self.site / 'read/2026-07/images/page-1-20w.jpg').write_bytes(b'tampered')
        self.build = self.home / 'fresh-build'
        self.calls.clear()
        with site_server(self.site) as base:
            ready, events = self.prepare(base)
        self.assertEqual(self.calls, ['2026-07.pdf'])
        self.assertEqual(len(ready), 1)
        self.assertTrue(any(e['status'] == 'warning' for e in events))

    def test_cache_asset_paths_cannot_escape_site(self):
        for value in ('../secret', '/secret', 'https://other.example/file', '%2e%2e/secret', 'a\\b'):
            with self.subTest(value=value), self.assertRaises(ValueError):
                published_url('https://example.com/magazine/', value)

    def test_real_worker_bad_pdf_does_not_stop_next_pdf(self):
        from pypdf import PdfWriter
        writer = PdfWriter()
        writer.add_blank_page(width=400, height=600)
        writer.write(self.issues / '2026-07.pdf')
        self.upload('2025-09.pdf', b'not a PDF')
        ready, events = batch.prepare(ROOT, self.issues, self.build, timeout=60)
        self.assertEqual([e['id'] for e in ready], ['2026-07'])
        self.assertTrue(any(e['status'] == 'skipped' for e in events))
        self.build_site()


if __name__ == '__main__':
    unittest.main()
