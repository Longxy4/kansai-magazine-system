"""Read GitHub Release attachments, preserving PDF names via labels, title or ZIP."""
import argparse
import hashlib
import json
import re
from pathlib import Path, PurePosixPath
import shutil
import subprocess
import tempfile
from urllib.parse import quote
import zipfile

LIMIT = 100 * 1024 * 1024


def filename(value):
    value = (value or '').strip()
    if not value or '/' in value or '\\' in value or '\0' in value or value in ('.', '..'):
        raise ValueError('Invalid attachment filename')
    return value


def pdf_name(asset, title, pdf_count):
    label = asset.get('label') or ''
    if label.lower().endswith('.pdf'):
        return filename(label)
    # GitHub strips non-ASCII letters from attachment filenames. A one-PDF
    # release can recover the issue name from its human-readable title.
    name = filename(asset['name'])
    if re.fullmatch(r'(?:[0-9]{4}-(?:[0-9]{2}|special)|special)\.pdf', name, flags=re.I):
        return name
    if pdf_count == 1 and title:
        return filename(title if title.lower().endswith('.pdf') else title + '.pdf')
    return name if name.lower().endswith('.pdf') else name + '.pdf'


def save_pdf(source, name, destination):
    name = filename(name)
    target = destination / name
    if target.exists():
        if hashlib.sha256(target.read_bytes()).digest() == hashlib.sha256(source.read_bytes()).digest():
            return
        raise ValueError(f'Different PDFs have the same upload filename: {name}')
    shutil.copyfile(source, target)
    print(f'Received PDF: {name}')


def unpack(source, destination, on_skip=lambda name, reason: print(f'Skipped {name}: {reason}')):
    with zipfile.ZipFile(source) as archive:
        total = 0
        for member in archive.infolist():
            parts = PurePosixPath(member.filename).parts
            if member.is_dir() or '__MACOSX' in parts or not member.filename.lower().endswith('.pdf'):
                continue
            if member.file_size > LIMIT:
                on_skip(member.filename, 'exceeds 100 MiB')
                continue
            total += member.file_size
            if total > 2 * 1024 * 1024 * 1024:
                raise ValueError('ZIP PDF contents exceed the 2 GiB upload batch limit')
            name = filename(PurePosixPath(member.filename).name)
            with tempfile.TemporaryDirectory() as scratch:
                extracted = Path(scratch) / 'issue.pdf'
                with archive.open(member) as incoming, extracted.open('wb') as outgoing:
                    shutil.copyfileobj(incoming, outgoing)
                try:
                    save_pdf(extracted, name, destination)
                except ValueError as error:
                    on_skip(name, str(error))


def download(repository, tag, destination):
    release = json.loads(subprocess.check_output(
        ['gh', 'api', f'repos/{repository}/releases/tags/{quote(tag, safe="")}'], encoding='utf-8'))
    assets = release.get('assets', [])
    pdfs = [a for a in assets if a['name'].lower().endswith('.pdf') or a.get('content_type') == 'application/pdf']
    selected = [a for a in assets if a in pdfs or a['name'].lower().endswith('.zip')]
    if not selected:
        raise ValueError('Release has no PDF or ZIP attachments')
    destination.mkdir(parents=True, exist_ok=True)
    rejected = []
    def skip(name, reason):
        rejected.append(dict(filename=name, status='skipped', reason=reason))
        print(f'Skipped {name}: {reason}')
    for asset in selected:
        if asset in pdfs and asset['size'] > LIMIT:
            skip(asset['name'], 'exceeds 100 MiB')
            continue
        try:
            if asset['size'] > 2 * 1024 * 1024 * 1024:
                raise ValueError('Attachment exceeds the 2 GiB batch limit')
            with tempfile.TemporaryDirectory() as scratch:
                source = Path(scratch) / 'attachment'
                with source.open('wb') as stream:
                    subprocess.run(['gh', 'api', f'repos/{repository}/releases/assets/{int(asset["id"])}',
                                    '-H', 'Accept: application/octet-stream'], stdout=stream, check=True)
                if source.stat().st_size != asset['size']:
                    raise ValueError('Release attachment download size mismatch')
                if (asset.get('digest') or '').startswith('sha256:'):
                    with source.open('rb') as stream:
                        if 'sha256:' + hashlib.file_digest(stream, 'sha256').hexdigest() != asset['digest']:
                            raise ValueError('Release attachment checksum mismatch')
                if asset in pdfs:
                    save_pdf(source, pdf_name(asset, release.get('name'), len(pdfs)), destination)
                else:
                    unpack(source, destination, on_skip=skip)
        except Exception as error:
            skip(asset['name'], str(error))
    (destination / '.rejected.json').write_text(json.dumps(rejected, ensure_ascii=False), encoding='utf-8')


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--repository', required=True)
    parser.add_argument('--tag', required=True)
    parser.add_argument('--destination', type=Path, required=True)
    args = parser.parse_args()
    download(args.repository, args.tag, args.destination)
