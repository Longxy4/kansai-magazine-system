import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const source = readFileSync(new URL('../vendor/pages/flipbook/zoom.js', import.meta.url), 'utf8');
function fixture() {
    class Element {
        listeners = {}; style = {}; clientWidth = 400; clientHeight = 800;
        closest() { return null; }
        getBoundingClientRect() { return {left:0, top:0, width:400, height:800}; }
        addEventListener(type, fn) { (this.listeners[type] ??= []).push(fn); }
        dispatchEvent(e) { for (const fn of this.listeners[e.type] ?? []) fn(e); }
    }
    const wrapper = new Element(), container = new Element(), label = new Element(), slider = new Element(), window = new Element();
    const timers = new Map(), turns = [], settings = {}; let id = 0, resizes = 0, quality = 0, reveals = 0;
    window.innerHeight = 800;
    window.addEventListener('resize', () => resizes++);
    const pageFlip = {getState:()=>'read', getSettings:()=>settings, flipPrev:()=>turns.push(-1), flipNext:()=>turns.push(1)};
    window.pageFlip = pageFlip;
    const context = vm.createContext({window, pageFlip, zoom:1, panX:0, panY:0, isPanning:false,
        BOOK_WIDTH_AT_1X:400, BOOK_HEIGHT_AT_1X:560,
        document:{querySelector:()=>null, getElementById:id=>id==='flipbook-wrapper'?wrapper:container},
        Event:class {constructor(type){this.type=type;}},
        setTimeout:fn=>{timers.set(++id, fn);return id;}, clearTimeout:id=>timers.delete(id),
        updateEpubContentScale(){}, debouncedUpdateImageSizes:()=>quality++, isZoomed:()=>context.zoom>1,
        isNearReaderBottom:y=>y>=window.innerHeight-96});
    vm.runInContext(source, context);
    context.setupTouchGestures(wrapper, slider, label, () => reveals++);
    const emit = (type, points=[], extra={}) => {
        const touches=points.map(([clientX,clientY])=>({clientX,clientY}));
        const e={type, target:wrapper, touches, changedTouches:touches, cancelable:true,
            preventDefault(){this.prevented=true;}, stopPropagation(){this.stopped=true;}, ...extra};
        wrapper.dispatchEvent(e); return e;
    };
    const end=(x,y,extra={})=>emit('touchend',[],{changedTouches:[{clientX:x,clientY:y}],...extra});
    const tap=(x,y)=>{emit('touchstart',[[x,y]]);end(x,y);};
    const flush=()=>{const work=[...timers.values()];timers.clear();work.forEach(fn=>fn());};
    return {context, emit, end, tap, flush, turns, container, label, slider, settings, counts:()=>({resizes,quality,reveals})};
}
test('side taps turn once; compatibility clicks cannot turn twice; swipes still work',()=>{
    const f=fixture(); f.tap(360,400);f.flush();assert.deepEqual(f.turns,[1]);
    assert.equal(f.emit('mousedown',[],{detail:1}).prevented,true);
    f.tap(40,400);f.flush();assert.deepEqual(f.turns,[1,-1]);
    f.tap(200,400);f.flush();assert.deepEqual(f.turns,[1,-1]);
    f.emit('touchstart',[[300,400]]);f.emit('touchmove',[[180,410]]);f.end(180,410);f.flush();
    assert.deepEqual(f.turns,[1,-1,1]);
});
test('double tap zooms at the finger, single-finger pans, double tap and reset return to 1x',()=>{
    const f=fixture();f.tap(300,400);f.tap(300,400);f.flush();
    assert.equal(f.context.zoom,2);assert.equal(f.context.panX,-100);assert.deepEqual(f.turns,[]);
    f.emit('touchstart',[[200,400]]);f.emit('touchmove',[[250,450]]);f.end(250,450);
    assert.equal(f.context.panX,-50);assert.equal(f.context.panY,50);assert.deepEqual(f.turns,[]);
    f.tap(200,400);f.tap(200,400);assert.equal(f.context.zoom,1);assert.equal(f.context.panX,0);
    f.tap(200,400);f.tap(200,400);f.label.dispatchEvent({type:'click'});assert.equal(f.context.zoom,1);
});
test('pinch follows midpoint, clamps scale, resizes only on release and ignores the remaining finger',()=>{
    const f=fixture();f.emit('touchstart',[[150,400]]);f.emit('touchstart',[[150,400],[250,400]]);
    f.emit('touchmove',[[100,400],[300,400]]);assert.equal(f.context.zoom,2);assert.equal(f.counts().resizes,0);
    assert.match(f.container.style.transform,/scale\(2\)/);
    f.emit('touchmove',[[0,400],[400,400]]);assert.equal(f.context.zoom,3);
    f.end(0,400,{touches:[{clientX:400,clientY:400}]});assert.equal(f.counts().resizes,1);
    f.end(400,400);f.flush();assert.deepEqual(f.turns,[]);assert.equal(f.context.isPanning,false);
    f.emit('touchstart',[[0,400],[400,400]]);f.emit('touchmove',[[195,400],[205,400]]);f.end(195,400);
    assert.equal(f.context.zoom,1);assert.equal(f.context.panX,0);assert.equal(f.settings.useMouseEvents,true);
});
test('link taps stay native, dragging a link suppresses navigation, controls are excluded',()=>{
    const f=fixture(), link={closest:s=>s==='a'?{}:null};
    f.emit('touchstart',[[360,400]],{target:link});assert.equal(f.end(360,400,{target:link}).prevented,undefined);
    f.flush();assert.deepEqual(f.turns,[]);
    assert.equal(f.emit('click',[],{target:link,detail:1,sourceCapabilities:{firesTouchEvents:true}}).prevented,undefined);
    f.emit('touchstart',[[360,400]],{target:link});f.emit('touchmove',[[260,400]],{target:link});f.end(260,400,{target:link});
    assert.equal(f.emit('click',[],{target:link,detail:1}).prevented,true);
    const button={closest:()=>({})};assert.equal(f.emit('touchstart',[[360,400]],{target:button}).stopped,undefined);
});
test('cancelled pinch leaves no stuck scaling or pending page turn',()=>{
    const f=fixture();f.emit('touchstart',[[150,400],[250,400]]);f.emit('touchmove',[[100,400],[300,400]]);
    f.emit('touchcancel');f.flush();assert.equal(f.context.isPanning,false);
    assert.doesNotMatch(f.container.style.transform,/scale/);assert.deepEqual(f.turns,[]);
});
test('zoomed bottom taps reveal controls while bottom drags still pan',()=>{
    const f=fixture();f.tap(200,400);f.tap(200,400);f.tap(200,760);f.flush();
    assert.equal(f.counts().reveals,1);assert.equal(f.context.zoom,2);
    f.emit('touchstart',[[200,760]]);f.emit('touchmove',[[200,710]]);f.end(200,710);
    assert.equal(f.counts().reveals,1);assert.equal(f.context.panY,-50);assert.deepEqual(f.turns,[]);
});
