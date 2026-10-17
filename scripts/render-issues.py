"""Render only changed PDFs, and isolate failures to the affected issue."""
import json
import os
from pathlib import Path
import signal
import subprocess
import sys
import tempfile
from issue_catalog import discover_issues
from publication_cache import (renderer_key, object_key, valid, stamp, install,
                               previous_manifest, restore)


def convert(source, destination, timeout):
    worker = subprocess.Popen([sys.executable, '-X', 'utf8', str(Path(__file__).with_name('render_pdf.py')),
                               str(source), str(destination)], stdout=subprocess.PIPE,
                              stderr=subprocess.PIPE, start_new_session=os.name != 'nt')
    try:
        stdout, stderr = worker.communicate(timeout=timeout)
    except subprocess.TimeoutExpired:
        if os.name == 'nt':
            subprocess.run(['taskkill', '/PID', str(worker.pid), '/T', '/F'], capture_output=True)
        else:
            os.killpg(worker.pid, signal.SIGKILL)
        worker.communicate()
        raise ValueError(f'PDF conversion exceeded {timeout} seconds')
    if worker.returncode:
        reason = stderr.decode('utf-8', errors='replace').strip().splitlines()
        raise ValueError(reason[-1][:600] if reason else f'PDF conversion exited {worker.returncode}')


def prepare(root, issues, build, base='', converter=convert, timeout=900):
    objects = build / 'objects'
    objects.mkdir(parents=True, exist_ok=True)
    events, ready = [], []
    baseline = previous_manifest(build, base)
    previous = [record['entry'] for record in baseline['issues']]
    lookup = {alias: record for record in baseline['issues']
              for alias in record['entry'].get('aliases', [record['entry']['id']])}
    catalog = discover_issues(issues, previous=previous, on_skip=events.append)
    renderer = renderer_key(root)

    def old_copy(record):
        if not record:
            return None
        try:
            key = restore(record, objects, base)
            return dict(record['entry'], cache=key) if key else None
        except Exception as error:
            events.append(dict(filename=record['entry']['filename'], status='warning',
                               reason=f'Previous version unavailable: {error}'))
            return None

    for entry in catalog:
        print(f"Checking {entry['filename']}", flush=True)
        prior = old_copy(lookup.get(entry['id']))
        key = object_key(entry['sha256'], renderer)
        destination = objects / key
        try:
            if valid(destination, entry['sha256'], renderer):
                status, reason = 'reused', 'Unchanged PDF; reused verified pages and links'
            else:
                print(f"Converting {entry['filename']}", flush=True)
                with tempfile.TemporaryDirectory(prefix='.convert-', dir=objects) as scratch:
                    staging = Path(scratch) / 'object'
                    staging.mkdir()
                    converter(issues / entry['filename'], staging, timeout)
                    stamp(staging, entry['sha256'], renderer)
                    if not valid(staging, entry['sha256'], renderer):
                        raise ValueError('Incomplete conversion output')
                    install(staging, destination, objects)
                status, reason = 'converted', 'New or changed PDF converted successfully'
            prepared = dict(entry, cache=key)
            if prior:
                prepared['previous'] = prior
            ready.append(prepared)
            events.append(dict(filename=entry['filename'], issue=entry['id'], status=status, reason=reason))
            print(f"{entry['id']}: {status}", flush=True)
        except Exception as error:
            events.append(dict(filename=entry['filename'], issue=entry['id'], status='skipped', reason=str(error)))
            if prior:
                prior['aliases'] = sorted(set(prior['aliases'] + entry['aliases']))
                prior['redirects'] = sorted(set(prior.get('redirects', []) + entry.get('redirects', [])))
                ready.append(prior)
                events.append(dict(filename=entry['filename'], issue=entry['id'], status='retained',
                                   reason='Kept the last successfully published version'))
    # Preserve an old version when its file is present but could not be catalogued/read.
    present = {p.name for p in issues.iterdir() if p.is_file()}
    included = {entry['id'] for entry in ready}
    for record in baseline['issues']:
        entry = record['entry']
        if entry['id'] not in included and present.intersection(entry.get('filenames', [entry['filename']])):
            prior = old_copy(record)
            if prior:
                ready.append(prior)
                included.add(entry['id'])
                events.append(dict(filename=entry['filename'], issue=entry['id'], status='retained',
                                   reason='Kept the last successfully published version'))
    ready.sort(key=lambda entry: (*entry['sort'], entry['id']))
    (build / 'issues.json').write_text(json.dumps(ready, ensure_ascii=False), encoding='utf-8')
    (build / 'publish-report.json').write_text(json.dumps(events, ensure_ascii=False), encoding='utf-8')
    for event in events:
        if event['status'] in ('skipped', 'warning'):
            message = f"{event['filename']}: {event['reason']}".replace('%', '%25').replace('\n', '%0A').replace('\r', '%0D')
            print(f'::warning::{message}', flush=True)
    if not ready:
        raise ValueError('No readable issues remain; preserve the existing published site')
    return ready, events


if __name__ == '__main__':
    root = Path(__file__).resolve().parents[1]
    prepare(root, Path(os.environ.get('MAGAZINE_ISSUES_DIR', root / 'issues')).resolve(),
            Path(os.environ.get('MAGAZINE_BUILD_DIR', root / '.build')).resolve(),
            os.environ.get('MAGAZINE_PUBLISHED_URL', ''),
            timeout=int(os.environ.get('MAGAZINE_PDF_TIMEOUT', '900')))
