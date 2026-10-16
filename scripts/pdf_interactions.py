"""Adapt PDF annotations and QR codes to Pages' existing link/TOC format."""
import re
import logging
from urllib.parse import urlsplit

import pdfplumber
from pypdf import PdfReader
from PIL import Image
import zxingcpp

# Canva omits some font bounding boxes; pdfminer can still read the words.
class _MissingFontBox(logging.Filter):
    def filter(self, record):
        return not record.getMessage().startswith('Could not get FontBBox from font descriptor')


logging.getLogger('pdfminer.pdffont').addFilter(_MissingFontBox())


def reading_index(spread, half, count):
    """Zero-based reading order: front, inside spreads, back."""
    return (count * 2 - 1 if half == 0 else 0) if spread == 0 else spread * 2 - 1 + half


def safe_url(value):
    value = str(value).strip()
    return value if urlsplit(value).scheme.lower() in ('http', 'https', 'mailto', 'tel') else None


def place_link(pages, spread, box, destination, count):
    """Split a normalized spread rectangle at the gutter, preserving crop/order."""
    x0, y0, x1, y1 = box
    y0, y1 = max(0, y0), min(1, y1)
    for half in (0, 1):
        left, right = max(x0, half / 2), min(x1, (half + 1) / 2)
        if right <= left or y1 <= y0:
            continue
        percent = lambda n: f'{n * 100:.6f}%'
        pages[reading_index(spread, half, count)]['links'].append(dict(
            destination, left=percent((left - half / 2) * 2), top=percent(y0),
            width=percent((right - left) * 2), height=percent(y1 - y0)))


def printed_contents(page, spread_count):
    """Read this magazine's printed P.xx contents, including unlinked entries.

    PDF exports sometimes point every bookmark at the contents spread, or omit
    the right-half coordinate in GoTo. Printed page numbers resolve both cases.
    No issue-specific titles or page numbers are hard-coded.
    """
    words = page.extract_words(x_tolerance=3, y_tolerance=3)
    if not any(w['text'] in ('CONTENTS', '目次') for w in words):
        return []
    markers = [w for w in words if re.fullmatch(r'P[.．]\d{1,3}', w['text'])]
    if len(markers) < 3:
        return []
    columns = sorted(set(round(w['x0'], 0) for w in markers))
    entries = []
    for marker in markers:
        printed = int(re.search(r'\d+', marker['text'])[0])
        if not 1 <= printed <= spread_count * 2 - 2:
            continue
        following = [x for x in columns if x > marker['x0'] + 10]
        half_edge = page.bbox[0] + page.width / 2 * (1 + int(marker['x0'] >= page.width / 2))
        right = min(following[0] - 15 if following else half_edge, half_edge)
        title_words = [w for w in words if marker['x1'] + 2 < w['x0'] < right
                       and marker['top'] - 22 <= w['top'] <= marker['bottom'] + 2]
        title_words.sort(key=lambda w: (round(w['top'] / 4), w['x0']))
        if not title_words:
            continue
        title = ' '.join(w['text'] for w in title_words)
        x0 = max(page.bbox[0], marker['x0'] - 9)
        x1 = min(right, max(w['x1'] for w in title_words) + 5)
        top = min(w['top'] for w in title_words) - 3
        bottom = max(marker['bottom'], max(w['bottom'] for w in title_words)) + 3
        entries.append(dict(title=title, page=printed + 1,
                            box=((x0 - page.bbox[0]) / page.width,
                                 (top - page.bbox[1]) / page.height,
                                 (x1 - page.bbox[0]) / page.width,
                                 (bottom - page.bbox[1]) / page.height)))
    return sorted(entries, key=lambda e: e['page'])


def extract_interactions(pdf, images):
    reader = PdfReader(pdf)
    count = len(reader.pages)
    pages = [dict(links=[]) for _ in range(count * 2)]
    toc = []
    refs = {p.indirect_reference.idnum: i for i, p in enumerate(reader.pages)}

    def resolve_destination(dest):
        if isinstance(dest, str):
            dest = reader.named_destinations.get(dest)
            if dest is None:
                return None
            dest = dest.dest_array
        if not dest or len(dest) < 2:
            return None
        target = refs.get(getattr(dest[0], 'idnum', None))
        if target is None:
            return None
        # Fit/unspecified positions open the left page (front on cover spread).
        half = 1 if target == 0 else 0
        if str(dest[1]) in ('/XYZ', '/FitR', '/FitV', '/FitBV') and len(dest) > 2:
            x = dest[2]
            if isinstance(x, (int, float)):
                box = reader.pages[target].mediabox
                half = int(float(x) >= (float(box.left) + float(box.right)) / 2)
        return reading_index(target, half, count) + 1

    with pdfplumber.open(pdf) as document:
        for spread, (page, text_page) in enumerate(zip(reader.pages, document.pages)):
            if page.rotation:
                raise ValueError(f'{pdf.name}: rotate PDF pages before uploading')
            entries = printed_contents(text_page, count)
            words = text_page.extract_words()
            toc.extend(dict(title=e['title'], page=e['page']) for e in entries)
            for entry in entries:
                place_link(pages, spread, entry['box'], dict(
                    pageNumber=entry['page'], title=entry['title'], source='contents'), count)
            media = page.mediabox
            width, height = float(media.width), float(media.height)
            for ref in page.get('/Annots', []):
                annotation = ref.get_object()
                if annotation.get('/Subtype') != '/Link' or '/Rect' not in annotation:
                    continue
                x0, y0, x1, y1 = map(float, annotation['/Rect'])
                box = ((x0 - float(media.left)) / width,
                       (float(media.top) - y1) / height,
                       (x1 - float(media.left)) / width,
                       (float(media.top) - y0) / height)
                action = annotation.get('/A', {}).get_object() if '/A' in annotation else {}
                title = str(annotation.get('/Contents', '')).strip()
                destination = None
                if action.get('/S') == '/URI':
                    url = safe_url(action.get('/URI', ''))
                    if url:
                        # Use the printed issue date beneath a Back Number cover.
                        label_words = [w for w in words
                                       if x0 <= (w['x0'] + w['x1']) / 2 <= x1
                                       and box[3] * height + text_page.bbox[1] - 3 <= w['top']
                                       <= box[3] * height + text_page.bbox[1] + 25]
                        date = re.search(r'20\d{2}年\d{1,2}月号', ''.join(w['text'] for w in label_words))
                        if date:
                            title = 'BACK NUMBER: ' + date[0]
                        destination = dict(url=url, title=title or url, source='pdf')
                elif action.get('/S') == '/GoTo' or '/Dest' in annotation:
                    # Printed TOC entries already cover the original line fragments.
                    cx, cy = (box[0] + box[2]) / 2, (box[1] + box[3]) / 2
                    if any(e['box'][0] <= cx <= e['box'][2] and e['box'][1] <= cy <= e['box'][3]
                           for e in entries):
                        continue
                    number = resolve_destination(action.get('/D', annotation.get('/Dest')))
                    if number:
                        destination = dict(pageNumber=number, title=title or f'Page {number}', source='pdf')
                if destination:
                    place_link(pages, spread, box, destination, count)

    # A normal bookmarked PDF without printed contents still gets Pages' TOC.
    if not toc:
        def outlines(items):
            result = []
            for item in items:
                if isinstance(item, list):
                    if result:
                        result[-1]['children'] = outlines(item)
                else:
                    number = resolve_destination(item.dest_array)
                    if number:
                        result.append(dict(title=item.title, page=number))
            return result
        toc = outlines(reader.outline)

    for spread, image_path in enumerate(images):
        add_qr_links(pages, spread, image_path, count)
    return dict(tableOfContents=toc, pageLinks=pages)


def add_qr_links(pages, spread, image_path, count):
    with Image.open(image_path) as image:
        for code in zxingcpp.read_barcodes(image.convert('RGB'), formats=zxingcpp.BarcodeFormat.QRCode):
            url = safe_url(code.text)
            if not url:
                continue
            corners = [code.position.top_left, code.position.top_right,
                       code.position.bottom_left, code.position.bottom_right]
            left, right = min(p.x for p in corners), max(p.x for p in corners)
            top, bottom = min(p.y for p in corners), max(p.y for p in corners)
            pad = max(4, (right - left) * .06)
            box = ((left - pad) / image.width, (top - pad) / image.height,
                   (right + pad) / image.width, (bottom + pad) / image.height)
            place_link(pages, spread, box, dict(url=url, title='QR: ' + url, source='qr'), count)
