import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../vendor/pages/flipbook/ui.js',import.meta.url),'utf8');
function fixture(){
  class Target{
    constructor(){this.listeners={};this.value='1';this.min='1';this.max='3';this.style={};this.classes=new Set();this.classList={add:x=>this.classes.add(x),remove:x=>this.classes.delete(x)};}
    addEventListener(type,fn){(this.listeners[type]??=[]).push(fn);}
    dispatchEvent(e){e.target??=this;for(const fn of this.listeners[e.type]??[])fn(e);}
    contains(e){return e===this;}
    matches(){return false;}
  }
  const document=new Target(),window=new Target(),slider=new Target(),controls=new Target(),wrapper=new Target(),timers=new Map();
  document.documentElement=new Target();document.querySelector=()=>null;window.innerHeight=720;
  let id=0,transforms=0,qualityUpdates=0;
  const context=vm.createContext({document,window,zoom:1,Event:class{constructor(type){this.type=type;}},matchMedia:()=>({matches:true}),
    setTimeout:(fn,ms)=>{timers.set(++id,{fn,ms});return id;},clearTimeout:i=>timers.delete(i),
    updateTransform:()=>transforms++,debouncedUpdateImageSizes:()=>qualityUpdates++,
    isZoomed:()=>context.zoom>1});
  vm.runInContext(source,context);context.setupUI(30,null,slider,new Target(),controls,null,null,wrapper);
  const emit=(type,props={})=>{const e={type,target:{tagName:'BODY'},preventDefault(){this.prevented=true;},...props};document.dispatchEvent(e);return e;};
  return {context,slider,controls,timers,emit,counts:()=>({transforms,qualityUpdates})};
}
test('Ctrl+wheel uses the existing slider transform and leaves ordinary wheel alone',()=>{
  const f=fixture();assert.equal(f.emit('wheel',{deltaY:-120,ctrlKey:false}).prevented,undefined);assert.equal(f.context.zoom,1);
  assert.equal(f.emit('wheel',{deltaY:-120,ctrlKey:true}).prevented,true);assert.equal(f.context.zoom,1.1);
  assert.deepEqual(f.counts(),{transforms:1,qualityUpdates:1});
  f.slider.value='3';f.slider.dispatchEvent({type:'input'});const before=f.counts();
  assert.equal(f.emit('wheel',{deltaY:-120,ctrlKey:true}).prevented,true);assert.equal(f.context.zoom,3);assert.deepEqual(f.counts(),before);
  f.emit('wheel',{deltaY:120,ctrlKey:true});assert.equal(f.context.zoom,2.9);
});
test('plus/minus and keypad zoom do not consume typing in the page-number field',()=>{
  const f=fixture();assert.equal(f.emit('keydown',{key:'+'}).prevented,true);assert.equal(f.context.zoom,1.1);
  f.emit('keydown',{key:'-',ctrlKey:true});assert.equal(f.context.zoom,1);
  f.emit('keydown',{key:'Add',code:'NumpadAdd'});assert.equal(f.context.zoom,1.1);
  assert.equal(f.emit('keydown',{key:'-',target:{tagName:'INPUT',type:'number'}}).prevented,undefined);assert.equal(f.context.zoom,1.1);
  for(let i=0;i<10;i++)f.emit('keydown',{key:'-'});assert.equal(f.context.zoom,1);
});
test('only moving to the bottom reveals controls; leaving uses the Pages hide timer',()=>{
  const f=fixture();assert.equal(f.controls.classes.has('active'),false);
  f.emit('pointermove',{pointerType:'mouse',clientY:710});assert.equal(f.controls.classes.has('active'),true);
  f.emit('pointermove',{pointerType:'mouse',clientY:100});assert.equal(f.controls.classes.has('active'),true);
  const timer=[...f.timers.values()][0];assert.equal(timer.ms,1000);timer.fn();assert.equal(f.controls.classes.has('active'),false);
});
test('a bottom-edge touch reveals controls without also turning the page',()=>{
  const f=fixture();const e=f.emit('touchstart',{touches:[{clientY:710}],cancelable:true,stopPropagation(){this.stopped=true;}});
  assert.equal(e.prevented,true);assert.equal(e.stopped,true);assert.equal(f.controls.classes.has('active'),true);
});

test('PDF links and QR codes near the bottom remain clickable without revealing the dock',()=>{
  const f=fixture(),target={tagName:'A',closest:()=>({})};
  f.emit('pointermove',{target,pointerType:'mouse',clientY:710});
  assert.equal(f.controls.classes.has('active'),false);
  const e=f.emit('touchstart',{target,touches:[{clientY:710}],cancelable:true,stopPropagation(){this.stopped=true;}});
  assert.equal(e.prevented,undefined);assert.equal(e.stopped,undefined);
  assert.equal(f.controls.classes.has('active'),false);
});

test('tapping low-positioned sidebar thumbnails is not consumed by the bottom dock',()=>{
  const f=fixture(),target={tagName:'A',closest:selector=>selector.includes('.page-sidebar')?{}:null};
  const e=f.emit('touchstart',{target,touches:[{clientY:710}],cancelable:true,stopPropagation(){this.stopped=true;}});
  assert.equal(e.prevented,undefined);assert.equal(e.stopped,undefined);
  assert.equal(f.controls.classes.has('active'),false);
});
