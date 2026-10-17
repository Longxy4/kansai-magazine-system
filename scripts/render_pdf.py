"""Convert one PDF using the existing Poppler/Pages image and link pipeline."""
import base64
import io
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile

from PIL import Image
from pdf_interactions import extract_interactions


def render_pdf(pdf, build):
    poppler = os.environ.get('PDFTOPPM', 'pdftoppm')
    result, back = [], None
    with tempfile.TemporaryDirectory(dir=build) as scratch:
        subprocess.run([poppler, '-scale-to-x', '2800', '-scale-to-y', '-1', '-jpeg',
                        '-jpegopt', 'quality=94', str(pdf), str(Path(scratch) / 'spread')],
                       check=True, timeout=500)
        images = sorted(Path(scratch).glob('spread-*.jpg'), key=lambda p: int(p.stem.split('-')[-1]))
        if not images:
            raise ValueError('PDF contains no rendered pages')
        interactions = extract_interactions(pdf, images)

        def variants(image):
            output = []
            for width in (700, 1400):
                resized = image.resize((width, round(image.height * width / image.width)), Image.Resampling.LANCZOS)
                data = io.BytesIO()
                resized.save(data, 'JPEG', quality=90)
                output.append(dict(scale=width / 700, width=width, height=resized.height,
                                   dataUrl='data:image/jpeg;base64,' + base64.b64encode(data.getvalue()).decode('ascii')))
            return output

        for n, image_path in enumerate(images):
            with Image.open(image_path) as image:
                width, height = image.size
                if interactions['layout'] == 'single':
                    result.append(variants(image))
                    continue
                if width <= height:
                    raise ValueError('Inconsistent rendered spread orientation')
                left, right = image.crop((0, 0, width // 2, height)), image.crop((width // 2, 0, width, height))
                if n == 0:
                    back = variants(left)
                    result.append(variants(right))
                else:
                    result.extend((variants(left), variants(right)))
        if back is not None:
            result.append(back)
    (build / 'pages.json').write_text(json.dumps(result), encoding='utf-8')
    (build / 'interactions.json').write_text(json.dumps(interactions, ensure_ascii=False), encoding='utf-8')
    shutil.copyfile(pdf, build / 'source.pdf')
    print(f'{len(result)} reading pages', flush=True)


if __name__ == '__main__':
    render_pdf(Path(sys.argv[1]), Path(sys.argv[2]))
