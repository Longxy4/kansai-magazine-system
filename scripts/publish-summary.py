"""Always show per-file outcomes in the GitHub Actions run summary."""
import json
import os
from pathlib import Path
from urllib.parse import quote

build = Path(os.environ.get('MAGAZINE_BUILD_DIR', Path(__file__).resolve().parents[1] / '.build'))
report = build / 'publish-report.json'
if report.exists():
    events = json.loads(report.read_text(encoding='utf-8'))
    labels = dict(reused='已复用', converted='已转换', duplicate='重复已跳过', skipped='出错已跳过',
                  retained='保留旧版', warning='警告')
    def cell(value):
        return str(value).replace('|', '\\|').replace('\n', ' ').replace('\r', ' ').replace('<', '&lt;')
    counts = ' · '.join(f'{label} {sum(e["status"] == status for e in events)}' for status, label in labels.items())
    try:
        published = {r['entry']['id'] for r in json.loads((build / 'last-success.json').read_text(encoding='utf-8'))['issues']}
    except (OSError, ValueError, KeyError):
        published = set()
    base = os.environ.get('MAGAZINE_PUBLISHED_URL', '').rstrip('/')
    def link(event):
        issue = event.get('issue')
        return f'[{issue}]({base}/?issue={quote(issue)})' if base and issue in published else '—'
    lines = ['## 杂志发布结果', '', counts, '', '相同内容只转换一次；单份文件出错不会阻止其他期刊发布。', '',
             '| 文件 | 处理结果 | 阅读链接 | 原因 |', '| --- | --- | --- | --- |']
    lines += [f'| {cell(e["filename"])} | {labels.get(e["status"], e["status"])} | {link(e)} | {cell(e["reason"])} |' for e in events]
    text = '\n'.join(lines) + '\n'
    print(text)
    if os.environ.get('GITHUB_STEP_SUMMARY'):
        with open(os.environ['GITHUB_STEP_SUMMARY'], 'a', encoding='utf-8') as summary:
            summary.write(text)
