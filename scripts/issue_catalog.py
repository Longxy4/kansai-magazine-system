"""Resolve uploaded PDF names once for both rendering and site generation."""
from pathlib import Path
import hashlib
import re
import unicodedata


PREFIXES = ('', '関西通信', '关西通讯', '關西通訊')
PREFIX = r'(?:関西通信|关西通讯|關西通訊)?'


def normalize_name(value):
    value = unicodedata.normalize('NFKC', value)
    return re.sub(r'\.pdf$', '', re.sub(r'\s+', '', value), flags=re.I)


def describe_issue(filename):
    stem = normalize_name(filename)
    monthly = re.fullmatch(r'([0-9]{4})-([0-9]{2})', stem)
    if not monthly:
        monthly = re.fullmatch(PREFIX + r'([0-9]{4})年([0-9]{1,2})月号', stem)
    if monthly:
        year, month = map(int, monthly.groups())
        if not 1 <= month <= 12:
            raise ValueError(f'{filename}: month must be between 1 and 12')
        issue = f'{year:04d}-{month:02d}'
        aliases = [issue, stem]
        for prefix in PREFIXES:
            aliases.extend(f'{prefix}{year:04d}年{m}月号' for m in {str(month), f'{month:02d}'})
        return dict(id=issue, title=f'関西通信{year:04d}年{month}月号', filename=filename,
                    aliases=sorted(set(aliases)), sort=[year, month])
    special = re.fullmatch(PREFIX + r'(?:([0-9]{4})年)?(?:特別|特别)号', stem)
    canonical_special = re.fullmatch(r'(?:([0-9]{4})-)?special', stem)
    if special or canonical_special:
        year = (special or canonical_special).group(1)
        issue = f'{year}-special' if year else 'special'
        aliases = [issue, stem]
        for prefix in PREFIXES:
            aliases.extend(f'{prefix}{year + "年" if year else ""}{word}号'
                           for word in ('特別', '特别'))
        return dict(id=issue, title=f'関西通信{year + "年" if year else ""}特別号',
                    filename=filename, aliases=sorted(set(aliases)), sort=[int(year or 0), 0])
    raise ValueError(f'Unsupported PDF filename: {filename}. Use 関西通信2025年9月号.pdf, '
                     '2026年特別号.pdf, 特別号.pdf or YYYY-MM.pdf.')


def discover_issues(directory):
    directory = Path(directory)
    if not directory.is_dir():
        raise ValueError('Set MAGAZINE_ISSUES_DIR to the publication repository issues folder')
    catalog, seen, contents = [], {}, {}
    for pdf in sorted(directory.iterdir()):
        if not pdf.is_file() or pdf.suffix.lower() != '.pdf':
            continue
        entry = describe_issue(pdf.name)
        with pdf.open('rb') as stream:
            digest = hashlib.file_digest(stream, 'sha256').hexdigest()
        if entry['id'] in seen and seen[entry['id']]['sha256'] != digest:
            raise ValueError(f'Duplicate issue {entry["id"]} has different PDF contents: '
                             f'{seen[entry["id"]]["filename"]} and {pdf.name}. Keep the intended revision.')
        if digest in contents:
            previous = contents[digest]
            previous['aliases'] = sorted(set(previous['aliases'] + entry['aliases']))
            if previous['id'] != entry['id']:
                previous['redirects'] = sorted(set(previous.get('redirects', []) + [entry['id']]))
            if entry['id'].endswith('-special'):
                previous['title'] = entry['title']
            seen[entry['id']] = previous
            continue
        entry['sha256'] = digest
        seen[entry['id']] = contents[digest] = entry
        catalog.append(entry)
    if not catalog:
        raise ValueError('No magazine PDFs found')
    return sorted(catalog, key=lambda entry: (*entry['sort'], entry['id']))
