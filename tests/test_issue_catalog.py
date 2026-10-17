"""Cover the filenames editors upload, including collisions before rendering."""
from pathlib import Path
import sys
import tempfile
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'scripts'))
from issue_catalog import describe_issue, discover_issues, normalize_name


class IssueNames(unittest.TestCase):
    def test_monthly_titles_and_legacy_names_have_the_same_link(self):
        for filename in ('2025-09.pdf', '関西通信2025年9月号.pdf',
                         '関西通信２０２５年０９月号.PDF', '関西通信 2025 年 9 月号.pdf'):
            with self.subTest(filename=filename):
                entry = describe_issue(filename)
                self.assertEqual(entry['id'], '2025-09')
                self.assertEqual(entry['filename'], filename)
                self.assertIn('関西通信2025年9月号', entry['aliases'])
                self.assertEqual(entry['title'], '関西通信2025年9月号')

    def test_special_issue_accepts_both_languages_and_optional_year(self):
        for filename in ('2026年特別号.pdf', '2026年特别号.pdf',
                         '関西通信2026年特別号.pdf', '2026-special.pdf'):
            with self.subTest(filename=filename):
                entry = describe_issue(filename)
                self.assertEqual(entry['id'], '2026-special')
                self.assertIn('2026年特别号', entry['aliases'])
                self.assertIn('関西通信2026年特別号', entry['aliases'])
        for filename in ('特别号.pdf', '特別号.pdf', '関西通信特別号.pdf', 'special.pdf'):
            self.assertEqual(describe_issue(filename)['id'], 'special')

    def test_duplicate_month_or_special_fails_before_building(self):
        for names in (('2025-09.pdf', '関西通信2025年9月号.pdf'),
                      ('特别号.pdf', '特別号.pdf')):
            with self.subTest(names=names), tempfile.TemporaryDirectory() as directory:
                for name in names:
                    (Path(directory) / name).write_text(name, encoding='utf-8')
                with self.assertRaisesRegex(ValueError, 'Duplicate issue'):
                    discover_issues(directory)

    def test_chronological_order_handles_specials_and_uppercase_extension(self):
        with tempfile.TemporaryDirectory() as directory:
            for name in ('特別号.pdf', '2026年特別号.pdf', '関西通信2025年9月号.PDF',
                         '2026-07.pdf', 'README.md', '.gitkeep'):
                (Path(directory) / name).write_text(name, encoding='utf-8')
            self.assertEqual([entry['id'] for entry in discover_issues(directory)],
                             ['special', '2025-09', '2026-special', '2026-07'])

    def test_identical_uploads_merge_names_and_keep_existing_links(self):
        with tempfile.TemporaryDirectory() as directory:
            for name in ('2026-07.pdf', '関西通信2026年7月号.pdf'):
                (Path(directory) / name).write_bytes(b'identical monthly PDF')
            for name in ('2026-01.pdf', '2026年特別号.pdf'):
                (Path(directory) / name).write_bytes(b'identical special PDF')
            entries = discover_issues(directory)
            self.assertEqual([entry['id'] for entry in entries], ['2026-01', '2026-07'])
            self.assertEqual(entries[0]['redirects'], ['2026-special'])
            self.assertIn('2026年特别号', entries[0]['aliases'])
            self.assertIn('2026-special', entries[0]['aliases'])
            self.assertIn('特別号', entries[0]['title'])
            self.assertIn('関西通信2026年7月号', entries[1]['aliases'])

    def test_invalid_names_do_not_silently_disappear(self):
        for filename in ('関西通信2025年13月号.pdf', '2025-00.pdf', '../unknown.pdf', 'notes.pdf'):
            with self.subTest(filename=filename), self.assertRaises(ValueError):
                describe_issue(filename)
        self.assertEqual(normalize_name(' 関西通信２０２５年９月号.PDF '), '関西通信2025年9月号')


if __name__ == '__main__':
    unittest.main()
