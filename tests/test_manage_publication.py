import hashlib
import importlib.util
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('manage_publication', Path(__file__).parents[1] / 'scripts/manage-publication.py')
manager = importlib.util.module_from_spec(spec)
spec.loader.exec_module(manager)


class PublicationTransferTests(unittest.TestCase):
    def setUp(self):
        quiet = patch('builtins.print')
        quiet.start()
        self.addCleanup(quiet.stop)

    def test_only_successfully_published_replacements_are_saved(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            publication, incoming, combined, site = [root / name for name in ('publication', 'incoming', 'combined', 'site')]
            for folder in (publication / 'issues', publication / 'docs', incoming, site):
                folder.mkdir(parents=True)
            for name in ('reader-guide.md', 'reader-guide.zh-CN.md'):
                (publication / 'docs' / name).write_text('Guide', encoding='utf-8')
            (publication / 'issues' / '2026-07.pdf').write_bytes(b'good old PDF')
            (incoming / '2026-07.pdf').write_bytes(b'broken replacement')
            (incoming / 'new.pdf').write_bytes(b'good new PDF')
            (incoming / 'duplicate.pdf').write_bytes(b'good old PDF')
            manager.prepare(publication, incoming, combined)
            old = dict(id='2026-07', title='July', filename='2026-07.pdf', sha256=hashlib.sha256(b'good old PDF').hexdigest())
            new = dict(id='extra-123456789abc', title='New', filename='new.pdf', sha256=hashlib.sha256(b'good new PDF').hexdigest())
            (site / 'publication.json').write_text(json.dumps({'issues': [{'entry': old}, {'entry': new}]}), encoding='utf-8')
            manager.collect(publication, incoming, combined, site)
            self.assertEqual((publication / 'issues/2026-07.pdf').read_bytes(), b'good old PDF')
            self.assertEqual((publication / 'issues/new.pdf').read_bytes(), b'good new PDF')
            self.assertFalse((publication / 'issues/duplicate.pdf').exists())
            self.assertIn('?issue=2026-07', (publication / 'README.md').read_text(encoding='utf-8'))
            self.assertFalse((site / '.github').exists())

    def test_staging_never_reuses_stale_files(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            with self.assertRaises(ValueError):
                manager.prepare(root, root, root)


if __name__ == '__main__':
    unittest.main()
