import importlib.util
import io
import os
from pathlib import Path
import unittest

os.environ.setdefault('SUPABASE_URL', 'https://example.invalid')
os.environ.setdefault('SUPABASE_SERVICE_ROLE_KEY', 'test-not-a-secret')
spec = importlib.util.spec_from_file_location('worker', Path(__file__).parents[1] / 'scripts/media_worker.py')
worker = importlib.util.module_from_spec(spec)
spec.loader.exec_module(worker)


class MediaTests(unittest.TestCase):
    def test_image_is_resized_and_metadata_removed(self):
        image = worker.Image.new('RGB', (2400, 1200), 'blue')
        data = io.BytesIO()
        exif = image.getexif()
        exif[270] = 'private-original-description'
        image.save(data, format='JPEG', exif=exif)
        output, meta = worker.process_image(data.getvalue())
        self.assertEqual((meta['width'], meta['height']), (1600, 800))
        with worker.Image.open(io.BytesIO(output)) as processed:
            self.assertFalse(processed.getexif())

    def test_pdf_preview_and_page_count(self):
        doc = worker.pymupdf.open()
        doc.new_page().insert_text((50, 50), 'Travel plan')
        doc.new_page()
        data = doc.tobytes()
        doc.close()
        preview, meta, count = worker.process_pdf(data)
        self.assertEqual(count, 2)
        self.assertTrue(preview.startswith(b'\x89PNG'))
        self.assertLessEqual(meta['width'], 1200)
        self.assertLessEqual(meta['height'], 1600)

    def test_encrypted_pdf_rejected(self):
        doc = worker.pymupdf.open()
        doc.new_page()
        encrypted = doc.tobytes(encryption=worker.pymupdf.PDF_ENCRYPT_AES_256, owner_pw='owner', user_pw='secret')
        doc.close()
        with self.assertRaises(ValueError):
            worker.process_pdf(encrypted)

    def test_corrupt_pdf_rejected(self):
        with self.assertRaises(Exception):
            worker.process_pdf(b'%PDF-not-a-valid-document')


if __name__ == '__main__':
    unittest.main()
