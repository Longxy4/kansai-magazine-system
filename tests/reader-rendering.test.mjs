import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';

test('turning-page copies keep the selected image without responsive-source reloads', () => {
    const source = readFileSync(new URL('../vendor/pages/engine.js', import.meta.url), 'utf8')
        .replace('return q(Z);', 'return {ImagePage:A};');
    const context = vm.createContext({});
    vm.runInContext(source, context);
    const original = {currentSrc:'selected-1400.jpg', src:'fallback-700.jpg'};
    const copied = {src:'fallback-700.jpg', srcset:'candidates', sizes:'100vw',
        removeAttribute(name) { delete this[name]; }};
    const clone = {classList:{add(){}}, querySelectorAll:() => [copied]};
    let appended = false;
    const element = {classList:{add(){}}, querySelectorAll:() => [original],
        cloneNode:() => clone, parentElement:{appendChild(){appended=true;}}};
    const page = new context.St.ImagePage({}, element, 'soft');
    page.newTemporaryCopy();
    assert.equal(appended, true);
    assert.equal(copied.src, original.currentSrc);
    assert.equal(copied.srcset, undefined);
    assert.equal(copied.sizes, undefined);
    assert.equal(copied.decoding, 'sync');
});

test('steady flips do not clear srcset or change image layers; portrait uses full width', () => {
    const source = readFileSync(new URL('../vendor/pages/flipbook/scaling.js', import.meta.url), 'utf8');
    let changes = 0;
    const image = {sizes:'50vw', hasAttribute:() => true,
        set srcset(value) { throw Error('Unexpected image-source reset'); },
        style:{set transform(value) { throw Error('Unexpected compositor-layer change'); }}};
    const context = vm.createContext({window:{innerWidth:390,innerHeight:844,currentZoom:1},
        document:{querySelectorAll:() => [image]}, debounce:fn => fn});
    vm.runInContext(source, context);
    const sizes = Object.getOwnPropertyDescriptor(image, 'sizes');
    let current = sizes.value;
    Object.defineProperty(image, 'sizes', {get:() => current, set:value => {changes++;current=value;}});
    context.updateImageSizes();
    context.updateImageSizes();
    assert.equal(image.sizes, '100vw');
    assert.equal(changes, 1);
    context.window.innerWidth = 1100;
    context.window.innerHeight = 800;
    context.updateImageSizes();
    assert.equal(image.sizes, '50vw');
});
