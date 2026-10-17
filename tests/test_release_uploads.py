import importlib.util
from pathlib import Path
import tempfile
import unittest
import zipfile

spec = importlib.util.spec_from_file_location('release_uploads', Path(__file__).parents[1] / 'scripts/download-release.py')
uploads = importlib.util.module_from_spec(spec)
spec.loader.exec_module(uploads)


class ReleaseUploads(unittest.TestCase):
    def test_original_label_and_single_issue_title_restore_japanese_names(self):
        self.assertEqual(uploads.pdf_name({'name': '2026.7.pdf', 'label': '関西通信2026年7月号.pdf'}, 'Upload', 2), '関西通信2026年7月号.pdf')
        self.assertEqual(uploads.pdf_name({'name': '2026.7.pdf'}, '関西通信2026年7月号', 1), '関西通信2026年7月号.pdf')
        self.assertEqual(uploads.pdf_name({'name': '2027-special.pdf'}, 'Batch', 2), '2027-special.pdf')

    def test_zip_preserves_native_names_and_cannot_escape_upload_folder(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            destination = root / 'incoming'
            destination.mkdir()
            archive = root / 'batch.zip'
            with zipfile.ZipFile(archive, 'w') as z:
                z.writestr('刊物/関西通信2027年特別号.pdf', b'special PDF')
                z.writestr('../号外.pdf', b'extra PDF')
                z.writestr('__MACOSX/._junk.pdf', b'junk')
            uploads.unpack(archive, destination)
            self.assertEqual((destination / '関西通信2027年特別号.pdf').read_bytes(), b'special PDF')
            self.assertEqual((destination / '号外.pdf').read_bytes(), b'extra PDF')
            self.assertFalse((root / '号外.pdf').exists())
            self.assertEqual(len(list(destination.iterdir())), 2)

    def test_ambiguous_repeated_names_never_silently_overwrite(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            source, destination = root / 'source.pdf', root / 'destination'
            destination.mkdir()
            source.write_bytes(b'first PDF')
            uploads.save_pdf(source, '2026-07.pdf', destination)
            source.write_bytes(b'different PDF')
            with self.assertRaises(ValueError):
                uploads.save_pdf(source, '2026-07.pdf', destination)
            self.assertEqual((destination / '2026-07.pdf').read_bytes(), b'first PDF')


if __name__ == '__main__':
    unittest.main()
