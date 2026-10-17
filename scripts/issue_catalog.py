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


def discover_issues(directory, *, previous=(), on_skip=None):
    directory = Path(directory)
    if not directory.is_dir():
        raise ValueError('Set MAGAZINE_ISSUES_DIR to the publication repository issues folder')
    catalog, seen, contents = [], {}, {}
    owners = {alias: entry for entry in previous for alias in entry.get('aliases', [entry['id']])}
    preferred = {entry['filename'] for entry in previous}

    def skip(pdf, reason, **extra):
        if on_skip:
            on_skip(dict(filename=pdf.name, status='skipped', reason=reason, **extra))

    for pdf in sorted(directory.iterdir(), key=lambda p: (p.name not in preferred, p.name)):
        if not pdf.is_file() or pdf.suffix.lower() != '.pdf':
            continue
        try:
            entry = describe_issue(pdf.name)
            with pdf.open('rb') as stream:
                digest = hashlib.file_digest(stream, 'sha256').hexdigest()
        except (ValueError, OSError) as error:
            skip(pdf, str(error))
            continue
        known = owners.get(entry['id'])
        if known:
            entry['redirects'] = sorted(set(known.get('redirects', []) +
                                           ([entry['id']] if entry['id'] != known['id'] else [])))
            entry['id'], entry['sort'] = known['id'], known['sort']
            entry['aliases'] = sorted(set(entry['aliases'] + known['aliases']))
            if '特別号' in known['title']:
                entry['title'] = known['title']
        entry['filenames'] = [pdf.name]
        if entry['id'] in seen and seen[entry['id']]['sha256'] != digest:
            skip(pdf, f'Duplicate issue {entry["id"]} has different contents; keeping '
                 f'{seen[entry["id"]]["filename"]}', issue=entry['id'])
            continue
        if digest in contents:
            merged = contents[digest]
            merged['aliases'] = sorted(set(merged['aliases'] + entry['aliases']))
            merged['redirects'] = sorted(set(merged.get('redirects', []) + entry.get('redirects', [])
                                            + ([entry['id']] if merged['id'] != entry['id'] else [])))
            if entry['id'].endswith('-special'):
                merged['title'] = entry['title']
            merged['filenames'].append(pdf.name)
            seen[entry['id']] = merged
            if on_skip:
                on_skip(dict(filename=pdf.name, issue=merged['id'], status='duplicate',
                             reason='Identical PDF already included; names and links merged'))
            continue
        entry['sha256'] = digest
        seen[entry['id']] = contents[digest] = entry
        catalog.append(entry)
    return sorted(catalog, key=lambda entry: (*entry['sort'], entry['id']))
