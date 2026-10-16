import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const catalog = JSON.parse(execFileSync(process.env.PYTHON || 'python', ['-X','utf8','-c',
    'import json; from issue_catalog import describe_issue; print(json.dumps([describe_issue(n) for n in '
    + '["関西通信2025年9月号.pdf", "2026年特別号.pdf", "特别号.pdf", "2026-07.pdf"]]))'],
    {cwd:fileURLToPath(new URL('../scripts',import.meta.url)), encoding:'utf8'}));
const aliases = Object.fromEntries(catalog.flatMap(entry => entry.aliases.map(alias => [alias,entry.id])));
const source = readFileSync(new URL('../index.html',import.meta.url),'utf8')
    .replace('__LATEST_ISSUE__','2026-07').replace('__ISSUE_ALIASES__',JSON.stringify(aliases))
    .match(/<script>([\s\S]*?)<\/script>/)[1];

function route(issue, hash='#page=8') {
    let target;
    const status = {};
    const location = {search:issue === undefined ? '' : '?issue='+encodeURIComponent(issue), hash,
                      replace:value => target=value};
    vm.runInNewContext(source,{URLSearchParams,location,document:{getElementById:()=>status}});
    return {target,status};
}

test('uploaded monthly names and old IDs reach the same reader and preserve page links',()=>{
    for(const name of ['2025-09','関西通信2025年9月号','関西通信２０２５年０９月号.PDF'])
        assert.equal(route(name).target,'./read/2025-09/#page=8');
    assert.equal(route('2026-07').target,'./read/2026-07/#page=8');
    assert.equal(route().target,'./read/2026-07/#page=8');
});

test('Chinese and Japanese special names resolve to their independent readers',()=>{
    for(const name of ['2026-special','2026年特别号','関西通信2026年特別号.pdf'])
        assert.equal(route(name).target,'./read/2026-special/#page=8');
    for(const name of ['special','特别号','特別号.pdf'])
        assert.equal(route(name).target,'./read/special/#page=8');
});

test('unpublished or unsafe issue names show a message without redirecting',()=>{
    for(const name of ['2099-01','../2026-07','__proto__','constructor','<script>']) {
        const result=route(name);
        assert.equal(result.target,undefined);
        assert.match(result.status.textContent,/見つかりません/);
    }
});
