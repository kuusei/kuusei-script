const { test } = require('node:test');
const assert = require('node:assert/strict');
const core = require('../model/recognition.cjs');
const config = { ...core.DEFAULTS };

test('transparent pixels are composited onto white, opaque black remains black', () => {
    assert.deepEqual([...core.grayscale(Uint8ClampedArray.from([0,0,0,0,0,0,0,255]))], [255,0]);
});
test('Otsu separates a black/white image including zero-valued black', () => {
    const gray = Uint8Array.from([0,0,255,255]);
    assert.equal(core.otsu(gray), 0);
    assert.deepEqual([...core.masks(new Uint8ClampedArray(16).fill(255),gray,config).binary], [1,1,0,0]);
});
test('HSV removes saturated red and preserves black and neutral gray strokes', () => {
    const rgba = Uint8ClampedArray.from([255,0,0,255,0,0,0,255,100,100,100,255,255,255,255,255]);
    assert.deepEqual([...core.masks(rgba, core.grayscale(rgba),config).hsv], [0,1,1,0]);
});
test('denoising retains a narrow digit and diagonal connected strokes but removes isolated dots', () => {
    const mask = new Uint8Array(25); mask[0]=1; mask[7]=1;mask[12]=1;mask[17]=1;
    const clean = core.removeSpecks(mask,5,5,3);
    assert.equal(clean[0],0); assert.equal(clean[7]+clean[12]+clean[17],3);
    const diagonal = Uint8Array.from([1,0,0,0,1,0,0,0,1]);
    assert.deepEqual(core.removeSpecks(diagonal,3,3,3),diagonal);
});
function fixture(count=6) {
    const width=32,height=16,mask=new Uint8Array(width*height);
    for(let i=0;i<count;i++) for(let y=3;y<13;y++) mask[y*width+2+i*5]=1;
    return {width,height,mask};
}
test('projection detects six narrow characters with exact pixel boundaries', () => {
    const f=fixture(); const result=core.segment(f.mask,f.width,f.height,{...config,expectedLength:6});
    assert.equal(result.valid,true);assert.equal(result.spans.length,6);
    assert.deepEqual(result.spans[0],{left:2,top:3,width:1,height:10});
});
test('segmentation rejects touching characters rather than inventing equal-width regions', () => {
    const f=fixture(); for(let x=2;x<=7;x++) f.mask[7*f.width+x]=1;
    assert.equal(core.segment(f.mask,f.width,f.height,{...config,expectedLength:6}).valid,false);
});
test('normalization supports custom case-sensitive whitelist without confusing O and 0', () => {
    assert.equal(core.normalize('o 0!a\n',config),'O0A');
    assert.equal(core.normalize('aAbB!',{...config,uppercase:false,chars:'ab'}),'ab');
});
test('zero confidence, wrong length and conflicting results block filling', () => {
    assert.equal(core.choose([{text:'ABC123',confidence:0}],config).fill,false);
    assert.equal(core.choose([{text:'ABC',confidence:99}],config).fill,false);
    assert.equal(core.choose([{text:'ABC123',confidence:89},{text:'ABC128',confidence:85}],config).fill,false);
    assert.equal(core.choose([{text:'ABC123',confidence:89},{text:'ABC128',confidence:60}],config).fill,true);
    assert.equal(core.choose([],config).fill,false);
});
test('an invalid high-score candidate does not outrank a valid candidate', () => {
    assert.equal(core.choose([{text:'X',confidence:99},{text:'ABCD',confidence:80}],config).best.text,'ABCD');
});
test('input changed during OCR, including change-and-revert, is never overwritten', () => {
    assert.equal(core.canFill({value:'',disabled:false,readOnly:false},'',2,3),false);
    assert.equal(core.canFill({value:'MANUAL'},'',2,2),false);
    assert.equal(core.canFill({value:'MANUAL'},'MANUAL',2,2),false);
    assert.equal(core.canFill({value:'ABCD'},'ABCD',2,2,'ABCD'),true);
    assert.equal(core.canFill({value:'',readOnly:true},'',2,2),false);
});
test('diagnostics discard URL credentials and query values', () => {
    assert.deepEqual(core.safeSource('https://user:password@pt.example.com/image.php?imagehash=SECRET&action=regimage'),
        {origin:'https://pt.example.com',path:'/image.php',queryKeys:['imagehash','action']});
});
class ImageMock extends EventTarget {
    constructor({complete=false,width=0,height=0,decode=async()=>{}}={}) {
        super();this.complete=complete;this.naturalWidth=width;this.naturalHeight=height;this.decode=decode;
        this.listeners=0;
    }
    addEventListener(...args){this.listeners++;super.addEventListener(...args);}
    removeEventListener(...args){this.listeners--;super.removeEventListener(...args);}
}
test('cached image succeeds; complete=true with zero dimensions is a loading error',async()=>{
    const cached=new ImageMock({complete:true,width:120,height:40});
    await core.waitImage(cached,new AbortController().signal,100);assert.equal(cached.listeners,0);
    const broken=new ImageMock({complete:true});
    await assert.rejects(core.waitImage(broken,new AbortController().signal,100),{code:'IMAGE_LOAD'});
    assert.equal(broken.listeners,0);
});
test('load event is awaited; timeout and abort remove event handlers',async()=>{
    const loaded=new ImageMock();const promise=core.waitImage(loaded,new AbortController().signal,100);
    loaded.naturalWidth=100;loaded.naturalHeight=40;loaded.dispatchEvent(new Event('load'));
    await promise;assert.equal(loaded.listeners,0);
    const waiting=new ImageMock(),abort=new AbortController();
    const pending=core.waitImage(waiting,abort.signal,100);abort.abort();
    await assert.rejects(pending,{code:'STALE'});assert.equal(waiting.listeners,0);
    const timed=new ImageMock();
    await assert.rejects(core.waitImage(timed,new AbortController().signal,5),{code:'IMAGE_TIMEOUT'});
    assert.equal(timed.listeners,0);
});
test('decode failures are reported instead of using CSS dimensions',async()=>{
    const image=new ImageMock({complete:true,width:100,height:40,decode:async()=>{throw Error('bad bytes')}});
    await assert.rejects(core.waitImage(image,new AbortController().signal,100),{code:'IMAGE_DECODE'});
});
test('hung decode and OCR calls have bounded timeouts',async()=>{
    const image=new ImageMock({complete:true,width:100,height:40,decode:()=>new Promise(()=>{})});
    await assert.rejects(core.waitImage(image,new AbortController().signal,5),{code:'IMAGE_TIMEOUT'});
    await assert.rejects(core.timeout(new Promise(()=>{}),5,'OCR_TIMEOUT','timeout'),{code:'OCR_TIMEOUT'});
});
test('refresh cancels a pending decode immediately',async()=>{
    const abort=new AbortController();
    const image=new ImageMock({complete:true,width:100,height:40,decode:()=>new Promise(()=>{})});
    const promise=core.waitImage(image,abort.signal,5000);
    await new Promise(resolve=>setTimeout(resolve,1));abort.abort();
    await assert.rejects(promise,{code:'STALE'});
});
test('template similarity and OCR confidence use separate selection thresholds',()=>{
    const template={metric:'similarity',text:'PCAPB1',similarity:.96,margin:.09};
    assert.equal(core.choose([template,{text:'PCAFRBIL',confidence:13}],config).best,template);
    assert.equal(core.choose([{...template,margin:.01}],config).fill,false);
    assert.equal(core.choose([template,{...template,text:'PCAPBI'}],config).fill,false);
});
test('a thin rectangular frame is removed while a large filled glyph is retained',()=>{
    const width=100,height=40,mask=new Uint8Array(width*height);
    for(let y=0;y<height;y++)for(let x=0;x<width;x++)if(x===0||x===width-1||y===0||y===height-1||(x>=40&&x<48&&y>=15&&y<25))mask[y*width+x]=1;
    const clean=core.cleanMask(mask,width,height,config);
    assert.equal(clean.removedFrames,1);assert.equal(clean.mask[0],0);assert.equal(core.maskStats(clean.mask).foreground,80);
});
test('oversized template input is rejected without an expensive search',()=>{
    assert.equal(core.matchGd(new Uint8Array(1),1,[{left:0,top:0,width:900,height:900}],config),null);
});
