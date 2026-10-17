"""Stage uploads and copy only verified, published PDFs into the reader repository."""
import argparse
import hashlib
import json
from pathlib import Path
import shutil
from urllib.parse import quote


def digest(file):
    with file.open('rb') as stream:
        return hashlib.file_digest(stream, 'sha256').hexdigest()


def pdfs(folder):
    return sorted(p for p in folder.iterdir()
                  if p.is_file() and not p.is_symlink() and p.suffix.lower() == '.pdf')


def prepare(publication, incoming, combined):
    if combined.exists():
        raise ValueError('The staging directory must be fresh')
    combined.mkdir(parents=True)
    for source in pdfs(publication / 'issues'):
        shutil.copyfile(source, combined / source.name)
    for source in pdfs(incoming):
        if source.stat().st_size > 100 * 1024 * 1024:
            print(f'Skipped {source.name}: exceeds the Git file limit of 100 MiB')
            continue
        shutil.copyfile(source, combined / source.name)


def collect(publication, incoming, combined, site):
    manifest = json.loads((site / 'publication.json').read_text(encoding='utf-8'))
    entries = [record['entry'] for record in manifest['issues']]
    accepted = {entry['filename']: entry['sha256'] for entry in entries}
    for source in pdfs(incoming):
        # A broken replacement must never overwrite the good source PDF.
        if accepted.get(source.name) == digest(source):
            shutil.copyfile(combined / source.name, publication / 'issues' / source.name)
            print(f'Accepted PDF: {source.name}')
        else:
            print(f'Not added to reader repository: {source.name} (duplicate or skipped)')
    lines = ['# 関西通信', '', '日中学生交流団体 freebird 関西支部の広報誌です。', '',
             '**[最新号を読む](https://longxy4.github.io/kansai-magazine/)**', '',
             '## バックナンバー', '', '| 発行号 | オンラインで読む | PDF |', '| --- | --- | --- |']
    for entry in reversed(entries):
        title = entry['title'].replace('|', '\\|').replace('\n', ' ')
        lines.append(f"| {title} | [読む](https://longxy4.github.io/kansai-magazine/?issue={entry['id']}) "
                     f"| [PDFを開く](issues/{quote(entry['filename'])}) |")
    lines += ['', '## ご利用ガイド', '', '[日本語](docs/reader-guide.md) · [中文](docs/reader-guide.zh-CN.md)', '']
    (publication / 'README.md').write_text('\n'.join(lines), encoding='utf-8')
    shutil.copyfile(publication / 'README.md', site / 'README.md')
    shutil.copytree(publication / 'docs', site / 'docs', dirs_exist_ok=True)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('mode', choices=['prepare', 'collect'])
    parser.add_argument('--publication', type=Path, required=True)
    parser.add_argument('--incoming', type=Path, required=True)
    parser.add_argument('--combined', type=Path, required=True)
    parser.add_argument('--site', type=Path)
    args = parser.parse_args()
    args.incoming.mkdir(parents=True, exist_ok=True)
    if args.mode == 'prepare':
        prepare(args.publication, args.incoming, args.combined)
    else:
        if not args.site:
            parser.error('collect requires --site')
        collect(args.publication, args.incoming, args.combined, args.site)
