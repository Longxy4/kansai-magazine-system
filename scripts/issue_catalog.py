"""Resolve uploaded PDF names once for both rendering and site generation."""
from pathlib import Path
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
    catalog, seen = [], {}
    for pdf in sorted(directory.iterdir()):
        if not pdf.is_file() or pdf.suffix.lower() != '.pdf':
            continue
        entry = describe_issue(pdf.name)
        if entry['id'] in seen:
            raise ValueError(f'Duplicate issue {entry["id"]}: {seen[entry["id"]]} and {pdf.name}. '
                             'Keep one PDF for each issue; include a year for different special issues.')
        seen[entry['id']] = pdf.name
        catalog.append(entry)
    if not catalog:
        raise ValueError('No magazine PDFs found')
    return sorted(catalog, key=lambda entry: (*entry['sort'], entry['id']))
