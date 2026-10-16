"""Prepare magazine spreads for the vendored Pages generator. No network access."""
import base64
import io
import json
import os
from pathlib import Path
import re
import subprocess
import tempfile
from PIL import Image
from pdf_interactions import extract_interactions

root = Path(__file__).resolve().parents[1]
poppler = os.environ.get('PDFTOPPM', 'pdftoppm')
issues = Path(os.environ.get('MAGAZINE_ISSUES_DIR', root / 'issues')).resolve()
if not issues.is_dir():
    raise ValueError('Set MAGAZINE_ISSUES_DIR to the publication repository issues folder')
for pdf in sorted(issues.glob('*.pdf')):
    issue = pdf.stem
    if not re.fullmatch(r'\d{4}-(0[1-9]|1[0-2])', issue):
        raise ValueError(f'Use YYYY-MM.pdf: {pdf.name}')
    build = root / '.build' / issue
    build.mkdir(parents=True, exist_ok=True)
    result = []
    back = None
    with tempfile.TemporaryDirectory(dir=build) as scratch:
        subprocess.run([poppler, '-scale-to-x', '2800', '-scale-to-y', '-1',
                        '-jpeg', '-jpegopt', 'quality=94', str(pdf),
                        str(Path(scratch) / 'spread')], check=True)
        images = sorted(Path(scratch).glob('spread-*.jpg'),
                        key=lambda p: int(p.stem.split('-')[-1]))
        if not images:
            raise ValueError(f'No pages in {pdf.name}')
        interactions = extract_interactions(pdf, images)

        def variants(image):
            output = []
            for width in (700, 1400):
                resized = image.resize((width, round(image.height * width / image.width)),
                                       Image.Resampling.LANCZOS)
                data = io.BytesIO()
                resized.save(data, 'JPEG', quality=90)
                output.append(dict(scale=width / 700, width=width,
                                   height=resized.height,
                                   dataUrl='data:image/jpeg;base64,' +
                                   base64.b64encode(data.getvalue()).decode('ascii')))
            return output

        for n, image_path in enumerate(images):
            with Image.open(image_path) as image:
                width, height = image.size
                if width <= height:
                    raise ValueError(f'{pdf.name}: expected landscape two-page spreads')
                left = image.crop((0, 0, width // 2, height))
                right = image.crop((width // 2, 0, width, height))
                if n == 0:
                    back = variants(left)
                    result.append(variants(right))
                else:
                    result.extend((variants(left), variants(right)))
        result.append(back)
    (build / 'pages.json').write_text(json.dumps(result), encoding='utf-8')
    (build / 'interactions.json').write_text(json.dumps(interactions, ensure_ascii=False), encoding='utf-8')
    links = [link for page in interactions['pageLinks'] for link in page['links']]
    print(f"{issue}: {len(result)} reading pages, {len(interactions['tableOfContents'])} contents entries, "
          f"{len(links)} clickable areas ({sum(l['source'] == 'qr' for l in links)} QR codes)", flush=True)
