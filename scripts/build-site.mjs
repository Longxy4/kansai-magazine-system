import {readFile, writeFile, mkdir, copyFile} from 'node:fs/promises';
import {generateFlipbookHtml} from '../vendor/pages/generator.js';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = name => readFile(path.join(root, name), 'utf8');
const out = path.join(root, '_site');
const issueRoot = path.resolve(process.env.MAGAZINE_ISSUES_DIR || path.join(root, 'issues'));
await mkdir(path.join(out, 'vendor'), {recursive:true});
await mkdir(path.join(out, 'issues'), {recursive:true});
await copyFile(path.join(root, 'vendor/qrcode.js'), path.join(out, 'vendor/qrcode.js'));
await writeFile(path.join(out, '.nojekyll'), '');
const issues = JSON.parse(await read('.build/issues.json'));
if (!issues.length) throw Error('No issues found');
const names = ['utils','state','navigation','scaling','zoom','pageflip','ui','links','sidebar','main'];
const js = (await Promise.all(names.map(n=>read('vendor/pages/flipbook/'+n+'.js')))).join('\n');
const css = await read('vendor/pages/engine.css') + '\n' + await read('vendor/pages/flipbook.css');
const engine = await read('vendor/pages/engine.js');
const extraJs = await read('scripts/reader-extras.js');
const license = await read('vendor/pages/ENGINE-LICENSE');
const extraCss = await read('scripts/reader-dock.css');
for (const entry of issues) {
    const issue = entry.id;
    const pages = JSON.parse(await read('.build/'+issue+'/pages.json'));
    const interactions = JSON.parse(await read('.build/'+issue+'/interactions.json'));
    const book = await generateFlipbookHtml(pages, {
        title:entry.title+' | freebird Kansai',mode:'folder',doubleSpread:false,extraCss,
        tableOfContents:interactions.tableOfContents,linkPreviews:false
    }, {loadCss:async()=>css,loadJs:async()=>js,loadPageFlipJs:async()=>engine}, [], interactions.pageLinks);
    let html = book.html.replace('<html lang="en">','<html lang="ja" data-issue="'+issue+'">');
    // Move the dock out of the perspective container, so fixed positioning
    // uses the viewport and never overlaps the space reserved for the book.
    const dockStart = html.indexOf('        <div id="controls-panel"');
    const dockEnd = html.indexOf('        <button id="toc-btn"', dockStart);
    const dock = html.slice(dockStart, dockEnd);
    const sidebarEnd = html.indexOf('        <div id="links-modal"', dockEnd);
    const sidebar = html.slice(dockEnd, sidebarEnd);
    html = html.slice(0, dockStart) + html.slice(sidebarEnd);
    html = html.replace('</body>', `${sidebar}${dock}<dialog id="share-dialog" aria-label="この号を共有"><strong>この号を共有</strong><div id="qr-container"></div><input id="share-url" aria-label="共有リンク" readonly><button id="copy-share">リンクをコピー</button><button id="close-share">閉じる</button></dialog><script src="../../vendor/qrcode.js"></script><script>${extraJs}</script><!-- Based on S-poony/Pages (MIT). PagesEngine license:\n${license} -->\n</body>`);
    html = html.replace('__ISSUE_PDF__', '../../issues/' + issue + '.pdf');
    const folder = path.join(out, 'read', issue);
    await mkdir(path.join(folder, 'images'), {recursive:true});
    await writeFile(path.join(folder, 'index.html'), html);
    for (const alias of entry.redirects || []) {
        const aliasFolder = path.join(out, 'read', alias);
        await mkdir(aliasFolder, {recursive:true});
        const destination = JSON.stringify('../' + issue + '/');
        await writeFile(path.join(aliasFolder, 'index.html'),
            '<!doctype html><meta charset="utf-8"><title>関西通信</title><script>location.replace('
            + destination + '+location.hash);</script>');
    }
    for (const asset of book.assets) {
        await writeFile(path.join(folder, asset.filename), Buffer.from(asset.data.slice(asset.data.indexOf(',')+1),'base64'));
    }
    await copyFile(path.join(issueRoot, entry.filename),path.join(out, 'issues', issue+'.pdf'));
    console.log(issue+': generated Pages reader ('+pages.length+' pages)');
}
let router = await read('index.html');
router = router.replace('__LATEST_ISSUE__',issues.at(-1).id);
const aliases = Object.fromEntries(issues.flatMap(entry => entry.aliases.map(alias => [alias, entry.id])));
router = router.replace('__ISSUE_ALIASES__',JSON.stringify(aliases).replaceAll('<','\\u003c'));
await writeFile(path.join(out, 'index.html'),router);
