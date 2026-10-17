"""Read real PDF annotations on single, rotated and split-spread pages."""
from pathlib import Path
import sys
import tempfile
import unittest

from pypdf import PdfReader, PdfWriter
from pypdf.generic import ArrayObject, DictionaryObject, NameObject, RectangleObject, TextStringObject

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'scripts'))
from page_layout import document_layout, normalized_rect
from pdf_interactions import extract_interactions


class PageLayouts(unittest.TestCase):
    def pdf(self, directory, rotation=0):
        writer = PdfWriter()
        first = writer.add_blank_page(width=200 if rotation else 100, height=100 if rotation else 200)
        if rotation:
            first.rotate(rotation)
        writer.add_blank_page(width=100, height=200)
        rect = [20, 10, 60, 30] if rotation else [10, 130, 40, 180]
        uri = writer._add_object(DictionaryObject({
            NameObject('/Subtype'): NameObject('/Link'), NameObject('/Rect'): RectangleObject(rect),
            NameObject('/A'): DictionaryObject({NameObject('/S'): NameObject('/URI'),
                                               NameObject('/URI'): TextStringObject('https://example.com/archive')})}))
        internal = writer._add_object(DictionaryObject({
            NameObject('/Subtype'): NameObject('/Link'), NameObject('/Rect'): RectangleObject([10, 40, 30, 60]),
            NameObject('/Dest'): ArrayObject([writer.pages[1].indirect_reference, NameObject('/Fit')])}))
        # Some older exports store the annotation array as an indirect object.
        first[NameObject('/Annots')] = writer._add_object(ArrayObject([uri, internal]))
        writer.add_outline_item('Second page', 1)
        pdf = Path(directory) / 'fixture.pdf'
        with pdf.open('wb') as stream:
            writer.write(stream)
        return pdf

    def test_portrait_pages_keep_order_and_indirect_links(self):
        with tempfile.TemporaryDirectory() as directory:
            pdf = self.pdf(directory)
            metadata = extract_interactions(pdf, [])
        self.assertEqual(metadata['layout'], 'single')
        self.assertEqual(len(metadata['pageLinks']), 2)
        links = metadata['pageLinks'][0]['links']
        self.assertEqual(links[0]['url'], 'https://example.com/archive')
        self.assertEqual([links[0][key] for key in ('left', 'top', 'width', 'height')],
                         ['10.000000%', '10.000000%', '30.000000%', '25.000000%'])
        self.assertEqual(links[1]['pageNumber'], 2)
        self.assertEqual(metadata['tableOfContents'][0]['page'], 2)

    def test_rotated_pages_use_display_orientation_and_link_coordinates(self):
        with tempfile.TemporaryDirectory() as directory:
            pdf = self.pdf(directory, rotation=90)
            metadata = extract_interactions(pdf, [])
        self.assertEqual(metadata['layout'], 'single')
        self.assertEqual(len(metadata['pageLinks']), 2)
        link = metadata['pageLinks'][0]['links'][0]
        for key in ('left', 'top'):
            self.assertAlmostEqual(float(link[key][:-1]), 10)
        for key in ('width', 'height'):
            self.assertAlmostEqual(float(link[key][:-1]), 20)

    def test_all_rotation_rectangles_stay_in_the_displayed_page(self):
        for rotation in (0, 90, 180, 270):
            writer = PdfWriter()
            page = writer.add_blank_page(width=100, height=200)
            page.rotate(rotation)
            box = normalized_rect(page, [10, 130, 40, 180])
            self.assertTrue(all(0 <= coordinate <= 1 for coordinate in box))
            self.assertLess(box[0], box[2])
            self.assertLess(box[1], box[3])

    def test_mixed_displayed_layout_is_rejected_before_cropping(self):
        writer = PdfWriter()
        writer.add_blank_page(width=100, height=200)
        writer.add_blank_page(width=200, height=100)
        with self.assertRaisesRegex(ValueError, 'mixes displayed'):
            document_layout(writer)


if __name__ == '__main__':
    unittest.main()
