"""Check actual magazine destinations and geometry, including decoded QR codes."""
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'scripts'))
from pdf_interactions import extract_interactions, add_qr_links, place_link, reading_index, safe_url


class MagazineLinks(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.pdf = Path(os.environ.get('MAGAZINE_ISSUES_DIR', ROOT / 'issues')) / '2026-07.pdf'
        if not cls.pdf.is_file():
            raise unittest.SkipTest('The 2026-07 publication fixture is not available')
        cls.metadata = extract_interactions(cls.pdf, [])

    def test_printed_contents_has_all_15_articles_and_correct_right_page(self):
        toc = self.metadata['tableOfContents']
        self.assertEqual([e['page'] for e in toc], [3, 4, 6, 8, 10, 12, 14, 16, 18, 20, 22, 24, 26, 28, 29])
        self.assertEqual(toc[0]['title'], 'freebird紹介')
        self.assertIn('読者アンケート', toc[-1]['title'])
        links = self.metadata['pageLinks'][1]['links']
        self.assertEqual([l['pageNumber'] for l in links], [e['page'] for e in toc])
        self.assertEqual(len(links), 15)  # Multiline source annotations are deduplicated.

    def test_social_links_and_all_12_back_issues_survive(self):
        pages = self.metadata['pageLinks']
        self.assertEqual(len(pages[2]['links']), 5)
        self.assertTrue(all(l['url'].startswith('https://') for l in pages[2]['links']))
        back = pages[27]['links']
        self.assertEqual(len(back), 12)
        self.assertEqual(len(set(l['url'] for l in back)), 12)
        self.assertTrue(all(l['url'].startswith('https://drive.google.com/file/d/') for l in back))
        self.assertTrue(all(l['title'].startswith('BACK NUMBER: 20') for l in back))

    def test_geometry_stays_on_the_cropped_page(self):
        for page in self.metadata['pageLinks']:
            for link in page['links']:
                left, top, width, height = [float(link[k].strip('%')) for k in ('left', 'top', 'width', 'height')]
                self.assertGreaterEqual(left, 0)
                self.assertGreaterEqual(top, 0)
                self.assertLessEqual(left + width, 100.000001)
                self.assertLessEqual(top + height, 100.000001)

    def test_actual_qr_codes_land_on_back_number_and_questionnaire_pages(self):
        pages = [dict(links=[]) for _ in range(30)]
        with tempfile.TemporaryDirectory() as scratch:
            prefix = Path(scratch) / 'last'
            subprocess.run([os.environ.get('PDFTOPPM', 'pdftoppm'), '-f', '15', '-l', '15',
                            '-singlefile', '-scale-to-x', '2800', '-scale-to-y', '-1',
                            '-png', str(self.pdf), str(prefix)], check=True)
            add_qr_links(pages, 14, prefix.with_suffix('.png'), 15)
        self.assertEqual(pages[27]['links'][0]['url'],
                         'https://drive.google.com/drive/folders/13bI9acYvTv2pU1kx9HTMl4Jao6RA6-UZ')
        self.assertEqual(pages[28]['links'][0]['url'], 'https://forms.gle/HaoyMVc1FnPVKM8M8')
        self.assertEqual(sum(len(p['links']) for p in pages), 2)

    def test_cover_order_and_link_crossing_gutter(self):
        self.assertEqual(reading_index(0, 1, 15), 0)
        self.assertEqual(reading_index(0, 0, 15), 29)
        pages = [dict(links=[]) for _ in range(30)]
        place_link(pages, 1, (.45, .1, .55, .2), dict(url='https://example.com'), 15)
        self.assertEqual(len(pages[1]['links']), 1)
        self.assertEqual(len(pages[2]['links']), 1)
        self.assertEqual(pages[1]['links'][0]['left'], '90.000000%')
        self.assertEqual(pages[2]['links'][0]['left'], '0.000000%')
        self.assertIsNone(safe_url('javascript:alert(1)'))


if __name__ == '__main__':
    unittest.main()
