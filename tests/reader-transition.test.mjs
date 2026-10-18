import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const source = name => readFileSync(new URL('../vendor/pages/flipbook/'+name+'.js',import.meta.url),'utf8');

test('toolbar follows visual viewport offsets, keyboard height and browser zoom', () => {
    const handlers={},values={},viewport={offsetLeft:80,offsetTop:120,width:195,height:300,scale:2,
        addEventListener:(type,fn)=>handlers[type]=fn};
    let moved=false;
    const context=vm.createContext({window:{visualViewport:viewport,innerHeight:844,addEventListener(){}},
        document:{body:{appendChild(){moved=true;}}}});
    vm.runInContext(source('ui'),context);
    context.setupViewportDock({style:{setProperty:(key,value)=>values[key]=value}});
    assert.equal(moved,true);
    assert.equal(values['--dock-center'],'177.5px');
    assert.equal(values['--dock-inset'],'424px');
    assert.equal(values['--dock-scale'],'0.5');
    assert.equal(values['--dock-width'],'390px');
    assert.equal(context.isNearReaderBottom(380),true);
    assert.equal(context.isNearReaderBottom(360),false);
    viewport.offsetTop=200;handlers.scroll();assert.equal(values['--dock-inset'],'344px');
    viewport.height=200;handlers.resize();assert.equal(values['--dock-inset'],'444px');
});

function fixture() {
    const events=[],animations=[],nodes=[];let current=0,state='read',mode='single';
    const element=tag=>({tag,style:{},dataset:{},children:[],setAttribute(){},
        appendChild(child){this.children.push(child);},remove(){events.push('remove');},
        decode:()=>Promise.resolve(),animate(frames){let done;
            const animation={frames,finished:new Promise(resolve=>done=resolve),finish:()=>done(),cancel(){}};
            animations.push(animation);return animation;}});
    const container=element('container');
    const book={getSettings:()=>({display:mode}),getState:()=>state,getCurrentPageIndex:()=>current,
        getPageCount:()=>3,getPage:i=>({getElement:()=>({querySelector:()=>({currentSrc:`page-${i}.jpg`})})}),
        getBoundsRect:()=>({left:0,top:0,pageWidth:390,height:550}),
        getFlipController:()=>({setState:s=>state=s}),getRender:()=>({drawFrame:()=>events.push('paint:'+current)}),
        turnToPage:i=>{current=i;events.push('commit:'+i);},flipNext:()=>events.push('curl'),flipPrev:()=>events.push('curl')};
    const context=vm.createContext({document:{createElement:tag=>{const n=element(tag);nodes.push(n);return n;}},
        console,matchMedia:()=>({matches:false}),isZoomed:()=>false});
    vm.runInContext(source('pageflip'),context);context.setupSinglePageTransition(book,container);
    return {book,events,animations,nodes,container,current:()=>current,state:()=>state,setMode:s=>mode=s};
}
const ready=async()=>{for(let i=0;i<5;i++)await Promise.resolve();};
test('single-page transition uses different images and commits exactly once before removing the cover',async()=>{
    const f=fixture(),pending=f.book.flipNext();await ready();
    assert.equal(f.current(),0);assert.equal(f.state(),'flipping');
    assert.deepEqual(f.nodes.filter(n=>n.tag==='img').map(n=>n.src),['page-0.jpg','page-1.jpg']);
    await f.book.flipNext();assert.equal(f.animations.length,1);
    f.animations[0].finish();await pending;
    assert.deepEqual(f.events,['commit:1','paint:1','remove']);assert.equal(f.state(),'read');
    const back=f.book.flipPrev();await ready();
    assert.equal(f.animations[1].frames[0].transform,'translateX(-100%)');
    f.animations[1].finish();await back;assert.equal(f.current(),0);
});
test('direct jumps cancel a transition; boundaries do nothing; desktop keeps Pages curls',async()=>{
    const f=fixture();await f.book.flipPrev();assert.equal(f.animations.length,0);
    const pending=f.book.flipNext();await ready();f.book.turnToPage(2);
    f.animations[0].finish();await pending;assert.equal(f.current(),2);
    assert.equal(f.events.filter(x=>x.startsWith('commit:')).join(','),'commit:2');
    await f.book.flipNext();assert.equal(f.animations.length,1);
    f.setMode('double');f.book.flipPrev();assert.equal(f.events.at(-1),'curl');
});
