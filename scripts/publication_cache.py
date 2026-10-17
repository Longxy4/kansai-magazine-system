"""Content-addressed rendering cache, with the published site as durable backup."""
import base64
from concurrent.futures import ThreadPoolExecutor
import hashlib
import json
from pathlib import Path
import re
import shutil
import tempfile
from urllib.parse import urljoin, urlsplit, unquote
from urllib.request import Request, urlopen

SCHEMA = 1


def digest(path):
    with Path(path).open('rb') as stream:
        return hashlib.file_digest(stream, 'sha256').hexdigest()


def renderer_key(root):
    result = hashlib.sha256()
    for name in ('render_pdf.py', 'pdf_interactions.py', 'page_layout.py', 'requirements.txt'):
        result.update(name.encode())
        result.update((root / 'scripts' / name).read_bytes().replace(b'\r\n', b'\n'))
    return result.hexdigest()


def object_key(sha, renderer):
    key = f'{sha}-{renderer}'
    if not re.fullmatch(r'[a-f0-9]{64}-[a-f0-9]{64}', key):
        raise ValueError('Invalid cache key')
    return key


def stamp(directory, sha, renderer):
    if digest(directory / 'source.pdf') != sha:
        raise ValueError('PDF changed during conversion; retry this file')
    hashes = {name: digest(directory / name) for name in ('pages.json', 'interactions.json', 'source.pdf')}
    (directory / 'cache.json').write_text(json.dumps(dict(schema=SCHEMA, sha256=sha,
                                                        rendererKey=renderer, hashes=hashes)), encoding='utf-8')


def valid(directory, sha, renderer):
    try:
        info = json.loads((directory / 'cache.json').read_text(encoding='utf-8'))
        if (info['schema'], info['sha256'], info['rendererKey']) != (SCHEMA, sha, renderer):
            return False
        if any(digest(directory / name) != info['hashes'][name]
               for name in ('pages.json', 'interactions.json', 'source.pdf')):
            return False
        pages = json.loads((directory / 'pages.json').read_text(encoding='utf-8'))
        links = json.loads((directory / 'interactions.json').read_text(encoding='utf-8'))
        return bool(pages) and len(pages) == len(links['pageLinks'])
    except (OSError, ValueError, KeyError, TypeError):
        return False


def install(staging, destination, objects):
    # Only replace a validated hash-named child of this build's cache directory.
    if destination.resolve().parent != objects.resolve() or not re.fullmatch(
            r'[a-f0-9]{64}-[a-f0-9]{64}', destination.name):
        raise ValueError('Unsafe cache destination')
    if destination.exists():
        shutil.rmtree(destination)
    staging.replace(destination)


def published_url(base, relative):
    target = urlsplit(relative)
    decoded = unquote(target.path)
    if (urlsplit(base).scheme not in ('http', 'https') or target.scheme or target.netloc
            or target.query or target.fragment or decoded.startswith('/')
            or '\\' in decoded or any(p in ('.', '..') for p in decoded.split('/'))):
        raise ValueError('Invalid published asset path')
    return urljoin(base.rstrip('/') + '/', relative)


def fetch_asset(base, descriptor, limit):
    size = descriptor['size']
    if not isinstance(size, int) or not 0 < size <= limit:
        raise ValueError('Invalid published asset size')
    with urlopen(Request(published_url(base, descriptor['path']),
                         headers={'User-Agent': 'Kansai-magazine-publisher'}), timeout=60) as response:
        data = response.read(size + 1)
    if len(data) != size or hashlib.sha256(data).hexdigest() != descriptor['sha256']:
        raise ValueError('Published asset checksum mismatch')
    return data


def previous_manifest(build, base):
    def checked(data):
        if data.get('schema') != SCHEMA or not isinstance(data.get('issues'), list):
            raise ValueError('Unsupported publication manifest')
        for record in data['issues']:
            entry = record['entry']
            object_key(entry['sha256'], record['rendererKey'])
            if not re.fullmatch(r'(?:[0-9]{4}-(?:[0-9]{2}|special)|special)', entry['id']):
                raise ValueError('Invalid published issue')
            if Path(entry['filename']).name != entry['filename']:
                raise ValueError('Invalid PDF filename')
        return data
    if base:
        try:
            with urlopen(Request(published_url(base, 'publication.json'),
                                 headers={'Cache-Control': 'no-cache'}), timeout=30) as response:
                return checked(json.loads(response.read(5 * 1024 * 1024)))
        except (OSError, ValueError, KeyError, TypeError):
            pass
    try:
        return checked(json.loads((build / 'last-success.json').read_text(encoding='utf-8')))
    except (OSError, ValueError, KeyError, TypeError):
        return dict(schema=SCHEMA, issues=[])


def restore(record, objects, base):
    entry, renderer = record['entry'], record['rendererKey']
    key = object_key(entry['sha256'], renderer)
    destination = objects / key
    if valid(destination, entry['sha256'], renderer):
        return key
    if not base:
        return None
    objects.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix='.restore-', dir=objects) as scratch:
        staging = Path(scratch) / 'object'
        staging.mkdir()
        pages = [[dict(v) for v in page] for page in record['pages']]
        if not 0 < len(pages) <= 5000 or any(not 0 < len(p) <= 4 for p in pages):
            raise ValueError('Invalid published pages')
        variants = [v for page in pages for v in page]
        with ThreadPoolExecutor(max_workers=8) as pool:
            downloaded = list(pool.map(lambda v: fetch_asset(base, v, 50 * 1024 * 1024), variants))
        for variant, data in zip(variants, downloaded):
            variant['dataUrl'] = 'data:image/jpeg;base64,' + base64.b64encode(data).decode('ascii')
        restored = [[{k: v[k] for k in ('scale', 'width', 'height', 'dataUrl')} for v in page] for page in pages]
        (staging / 'pages.json').write_text(json.dumps(restored), encoding='utf-8')
        (staging / 'interactions.json').write_text(json.dumps(record['interactions']), encoding='utf-8')
        (staging / 'source.pdf').write_bytes(fetch_asset(base, record['pdf'], 512 * 1024 * 1024))
        (staging / 'reader.html').write_bytes(fetch_asset(base, record['reader'], 20 * 1024 * 1024))
        stamp(staging, entry['sha256'], renderer)
        if not valid(staging, entry['sha256'], renderer):
            raise ValueError('Incomplete published issue')
        install(staging, destination, objects)
    return key
