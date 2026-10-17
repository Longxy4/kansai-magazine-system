import {readFile, writeFile, mkdir, copyFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {generateFlipbookHtml} from '../vendor/pages/generator.js';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const build = path.resolve(process.env.MAGAZINE_BUILD_DIR || path.join(root, '.build'));
const out = path.resolve(process.env.MAGAZINE_SITE_DIR || path.join(root, '_site'));
const read = name => readFile(path.join(root, name), 'utf8');
const json = async file => JSON.parse(await readFile(file, 'utf8'));
const sha = data => createHash('sha256').update(data).digest('hex');
const descriptor = (file, data) => ({path:file, size:data.length, sha256:sha(data)});
const events = await json(path.join(build, 'publish-report.json'));
const issues = await json(path.join(build, 'issues.json'));
const successful = [], manifest = {schema:1, issues:[]};
await mkdir(path.join(out, 'vendor'), {recursive:true});
await mkdir(path.join(out, 'issues'), {recursive:true});
await copyFile(path.join(root, 'vendor/qrcode.js'), path.join(out, 'vendor/qrcode.js'));
await writeFile(path.join(out, '.nojekyll'), '');
const names = ['utils','state','navigation','scaling','zoom','pageflip','ui','links','sidebar','main'];
const js = (await Promise.all(names.map(n=>read('vendor/pages/flipbook/'+n+'.js')))).join('\n');
const css = await read('vendor/pages/engine.css') + '\n' + await read('vendor/pages/flipbook.css');
const engine = await read('vendor/pages/engine.js');
const extraJs = await read('scripts/reader-extras.js');
const license = await read('vendor/pages/ENGINE-LICENSE');
const extraCss = await read('scripts/reader-dock.css');
function cacheFolder(entry) {
    if (!/^[a-f0-9]{64}-[a-f0-9]{64}$/.test(entry.cache)) throw Error('Invalid cache key');
    if (!/^(?:[0-9]{4}-(?:[0-9]{2}|special)|special)$/.test(entry.id)) throw Error('Invalid issue ID');
    return path.join(build, 'objects', entry.cache);
}
async function load(entry) {
    const folder = cacheFolder(entry);
    const info = await json(path.join(folder, 'cache.json'));
    if (info.sha256 !== entry.sha256 || entry.cache !== info.sha256+'-'+info.rendererKey) throw Error('Cache identity mismatch');
    const data = {};
    for (const name of ['pages.json', 'interactions.json', 'source.pdf']) {
        data[name] = await readFile(path.join(folder, name));
        if (sha(data[name]) !== info.hashes[name]) throw Error('Cache checksum mismatch: '+name);
    }
    const pages = JSON.parse(data['pages.json']), interactions = JSON.parse(data['interactions.json']);
    if (!pages.length || pages.length !== interactions.pageLinks.length) throw Error('Incomplete issue');
    return {folder, pages, interactions, pdf:data['source.pdf'], rendererKey:info.rendererKey};
}
async function generate(entry, data) {
    const book = await generateFlipbookHtml(data.pages, {
        title:entry.title+' | freebird Kansai',mode:'folder',doubleSpread:false,extraCss,
        tableOfContents:data.interactions.tableOfContents,linkPreviews:false
    }, {loadCss:async()=>css,loadJs:async()=>js,loadPageFlipJs:async()=>engine}, [], data.interactions.pageLinks);
    let html = book.html.replace('<html lang="en">','<html lang="ja" data-issue="'+entry.id+'">');
    // Fixed controls must use the viewport, outside the book's perspective container.
    const dockStart = html.indexOf('        <div id="controls-panel"');
    const dockEnd = html.indexOf('        <button id="toc-btn"', dockStart);
    const sidebarEnd = html.indexOf('        <div id="links-modal"', dockEnd);
    if (dockStart < 0 || dockEnd < dockStart || sidebarEnd < dockEnd) throw Error('Reader controls template changed');
    const dock = html.slice(dockStart, dockEnd), sidebar = html.slice(dockEnd, sidebarEnd);
    html = html.slice(0, dockStart) + html.slice(sidebarEnd);
    html = html.replace('</body>', `${sidebar}${dock}<dialog id="share-dialog" aria-label="この号を共有"><strong>この号を共有</strong><div id="qr-container"></div><input id="share-url" aria-label="共有リンク" readonly><button id="copy-share">リンクをコピー</button><button id="close-share">閉じる</button></dialog><script src="../../vendor/qrcode.js"></script><script>${extraJs}</script><!-- Based on S-poony/Pages (MIT). PagesEngine license:\n${license} -->\n</body>`);
    return html.replace('__ISSUE_PDF__', '../../issues/' + entry.id + '.pdf');
}
async function emit(entry, data, html) {
    const folder = path.join(out, 'read', entry.id);
    await mkdir(path.join(folder, 'images'), {recursive:true});
    const pageDescriptors = [];
    for (const [i, variants] of data.pages.entries()) {
        const row = [];
        if (!Array.isArray(variants) || !variants.length) throw Error('Missing page image');
        for (const variant of variants) {
            const bytes = Buffer.from(variant.dataUrl.split(',')[1], 'base64');
            if (!bytes.length || !Number.isFinite(variant.width)) throw Error('Invalid page image');
            const file = `read/${entry.id}/images/page-${i+1}-${variant.width}w.jpg`;
            await writeFile(path.join(out, file), bytes);
            row.push({...descriptor(file, bytes), scale:variant.scale, width:variant.width, height:variant.height});
        }
        pageDescriptors.push(row);
    }
    const pdfPath = 'issues/'+entry.id+'.pdf', readerPath = 'read/'+entry.id+'/index.html';
    await writeFile(path.join(out, pdfPath), data.pdf);
    await writeFile(path.join(out, readerPath), html);
    for (const alias of entry.redirects || []) {
        if (!/^(?:[0-9]{4}-(?:[0-9]{2}|special)|special)$/.test(alias) || alias === entry.id) continue;
        const aliasFolder = path.join(out, 'read', alias);
        await mkdir(aliasFolder, {recursive:true});
        await writeFile(path.join(aliasFolder, 'index.html'),
            '<!doctype html><meta charset="utf-8"><title>関西通信</title><script>location.replace('
            + JSON.stringify('../'+entry.id+'/') + '+location.hash);</script>');
    }
    const {cache, previous, ...metadata} = entry;
    manifest.issues.push({entry:metadata, rendererKey:data.rendererKey, pages:pageDescriptors,
        interactions:data.interactions, pdf:descriptor(pdfPath, data.pdf), reader:descriptor(readerPath, Buffer.from(html))});
    successful.push(entry);
    await writeFile(path.join(data.folder, 'reader.html'), html);
    console.log(entry.id+': generated Pages reader ('+data.pages.length+' pages)');
}
for (const entry of issues) {
    try {
        const data = await load(entry);
        await emit(entry, data, await generate(entry, data));
    } catch (error) {
        events.push({filename:entry.filename, issue:entry.id, status:'skipped', reason:'Reader generation: '+error.message});
        if (entry.previous) {
            try {
                const data = await load(entry.previous);
                const html = await readFile(path.join(data.folder, 'reader.html'), 'utf8');
                await emit(entry.previous, data, html);
                events.push({filename:entry.filename, issue:entry.id, status:'retained', reason:'Kept the last successfully published reader'});
            } catch (fallbackError) {
                events.push({filename:entry.filename, issue:entry.id, status:'warning', reason:'Previous reader unavailable: '+fallbackError.message});
            }
        }
    }
}
await writeFile(path.join(build, 'publish-report.json'), JSON.stringify(events));
if (!successful.length) throw Error('No readable issues remain; preserve the existing published site');
let router = await read('index.html');
router = router.replace('__LATEST_ISSUE__',successful.at(-1).id);
const aliases = Object.fromEntries(successful.flatMap(entry => entry.aliases.map(alias => [alias, entry.id])));
router = router.replace('__ISSUE_ALIASES__',JSON.stringify(aliases).replaceAll('<','\\u003c'));
await writeFile(path.join(out, 'index.html'),router);
const serialized = JSON.stringify(manifest);
await writeFile(path.join(out, 'publication.json'), serialized);
await writeFile(path.join(build, 'last-success.json'), serialized);
console.log('Published readers: '+successful.length);
