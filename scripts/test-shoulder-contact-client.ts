// Synthetic image fixtures and a mock DOM only. No patient media or external API.
import assert from "node:assert/strict";
import {spawnSync} from "node:child_process";
import {prepareContactComparison,runContactProbe,type PreparedContactComparison} from "../lib/shoulder-contact-client";
import {validateContactProbe} from "../lib/shoulder-contact-analysis";
import {WALL_PRESS_TEST_ID,type CropRegion,type ContactProbeResult} from "../lib/shoulder-contact-analysis-types";
import {MAX_FRAME_REQUEST_BYTES,type VideoInput} from "../lib/shoulder-analysis-types";

const input:VideoInput={sessionId:"synthetic-session",testId:WALL_PRESS_TEST_ID,videoId:"synthetic-video",uploadedAt:"2026-01-01T00:00:00.000Z"};
const box:CropRegion={x:.2,y:.3,width:.6,height:.45};
const fixtures=new Map<string,string>();
function jpeg(width:number,height:number){
  const key=width+"x"+height;
  if(!fixtures.has(key)){
    const image=spawnSync("ffmpeg",["-hide_banner","-loglevel","error","-f","lavfi","-i","color=gray:s="+key,"-frames:v","1","-f","image2pipe","-c:v","mjpeg","pipe:1"]);
    assert.equal(image.status,0,"ffmpeg creates a bounded synthetic JPEG");
    fixtures.set(key,image.stdout.toString("base64"));
  }
  return fixtures.get(key)!;
}
type Options={width?:number;height?:number;duration?:number;time?:number;crop?:CropRegion;source?:VideoInput;
  denied?:boolean;invalidAccess?:boolean;abortBefore?:boolean;abortAfterPreflight?:boolean;abortAtSeek?:boolean;loadError?:boolean;missingContext?:boolean;tooLarge?:boolean;mosaicFallback?:boolean;
  postError?:boolean;invalidJSON?:boolean;emptyResult?:boolean;wrongTime?:boolean;abortAfterPost?:boolean;};
type Capture={time:number;args:number[]};
async function scenario(options:Options={},work?:(prepared:PreparedContactComparison,controller:AbortController,posted:unknown[],source:VideoInput)=>Promise<void>){
  const width=options.width??1080,height=options.height??1920,duration=options.duration??41,time=options.time??14,crop=options.crop??box,source=options.source??input;
  const controller=new AbortController(),events:string[]=[],seeks:number[]=[],posted:unknown[]=[],canvases:FakeCanvas[]=[];
  let video:FakeVideo|undefined;
  class FakeVideo extends EventTarget {
    src="";duration=options.duration??41;videoWidth=width;videoHeight=height;removed=false;time=0;
    get currentTime(){return this.time;}
    set currentTime(value:number){this.time=value;seeks.push(value);if(options.abortAtSeek)controller.abort();queueMicrotask(()=>this.dispatchEvent(new Event("seeked")));}
    load(){if(this.src){events.push("private-media");queueMicrotask(()=>this.dispatchEvent(new Event(options.loadError?"error":"loadeddata")));}}
    removeAttribute(name:string){if(name==="src")this.src="";}
    remove(){this.removed=true;}
  }
  class FakeCanvas {
    width=0;height=0;frames:Capture[]=[];quality:number[]=[];encodedSizes:Array<[number,number]>=[];
    getContext(){if(options.missingContext)return null;return {fillStyle:"",font:"",fillRect(){},fillText(){},
      drawImage:(v:FakeVideo,...args:number[])=>{this.frames.push({time:v.currentTime,args});}};}
    toDataURL(type:string,quality:number){
      assert.equal(type,"image/jpeg");this.quality.push(quality);this.encodedSizes.push([this.width,this.height]);
      const isMosaic=this===canvases[0];
      const budget=Math.min(450000,(MAX_FRAME_REQUEST_BYTES*.62-30000)/Math.ceil(Math.ceil(duration)/4));
      const encoded=options.tooLarge?"A".repeat(1_000_004):options.mosaicFallback&&isMosaic&&quality>.65?"A".repeat(Math.ceil(budget)+8):jpeg(this.width,this.height);
      return "data:image/jpeg;base64,"+encoded;
    }
  }
  const scope=globalThis as any,original=new Map<string,unknown>();
  for(const key of ["window","document","fetch"])original.set(key,scope[key]);
  scope.window={location:{origin:"https://local.invalid"}};
  scope.document={createElement(tag:string){events.push(tag);if(tag==="video"){video=new FakeVideo();return video;}assert.equal(tag,"canvas");const canvas=new FakeCanvas();canvases.push(canvas);return canvas;}};
  scope.fetch=async(url:string,init?:RequestInit)=>{
    assert.equal(init?.credentials,"same-origin");assert.equal(init?.cache,"no-store");assert.equal(init?.signal,controller.signal);
    if(init?.signal?.aborted)throw new DOMException("Aborted","AbortError");
    if(init?.method!=="POST"){
      events.push("authorized");const u=new URL(url);assert.equal(u.origin,"https://local.invalid");assert.equal(u.pathname,"/api/shoulder-pilot/synthetic-session/analyze");
      assert.equal(u.searchParams.get("videoId"),source.videoId);assert.equal(u.searchParams.get("testId"),source.testId);assert.equal(u.searchParams.get("uploadedAt"),source.uploadedAt);
      if(options.abortAfterPreflight)controller.abort();
      return new Response(JSON.stringify({available:!(options.denied||options.invalidAccess),error:options.denied?"Sin acceso":undefined}),{status:options.denied?403:200});
    }
    events.push("posted");assert.equal(url,"/api/shoulder-pilot/synthetic-session/analyze");
    const data=JSON.parse(String(init.body));posted.push(data);validateContactProbe(data);
    assert.deepEqual(Object.keys(data).sort(),["mode","videoId","testId","uploadedAt","duration","time","variant","times","jpeg"].sort());
    assert.equal(data.mode,"contact-probe");assert.equal(data.time,time);assert.equal(data.videoId,source.videoId);
    assert(!String(init.body).includes("/api/assessments/media"),"no private media URL is transmitted");
    assert(!("sessionId" in data)&&!("sourceKey" in data),"client bookkeeping is not sent to the provider route");
    if(options.postError)return new Response(JSON.stringify({error:"Proveedor no disponible"}),{status:503});
    if(options.invalidJSON)return new Response("not-json");
    if(options.emptyResult)return new Response(JSON.stringify({}));
    if(options.abortAfterPost)controller.abort();
    const probe:ContactProbeResult={model:"synthetic-opus",time:options.wrongTime?time+1:time,leftImageArm:{status:"visible_gap",reason:"Separación visible."},rightImageArm:{status:"not_visible",reason:"Oculto."},limitations:[]};
    return new Response(JSON.stringify({probe}));
  };
  if(options.abortBefore)controller.abort();
  let prepared:PreparedContactComparison|undefined,error:unknown;
  try{prepared=await prepareContactComparison(source,time,crop,controller.signal);assert.equal(posted.length,0,"preparing previews never invokes inference");if(work)await work(prepared,controller,posted,source);}
  catch(e){error=e;}
  finally{for(const [key,value] of original)if(value===undefined)delete scope[key];else scope[key]=value;}
  if(video){assert(video.removed,"the temporary video is removed");assert.equal(video.src,"");}
  for(const canvas of canvases){assert.equal(canvas.width,0);assert.equal(canvas.height,0);}
  return {prepared,error,events,seeks,posted,video,canvases,width,height,duration,time,crop};
}
async function preparedCase(options:Options={}){
  const r=await scenario(options,async(prepared,controller,posted,source)=>{
    for(const variant of prepared.variants){const response=await runContactProbe(source,prepared,variant,controller.signal);assert.equal(response.model,"synthetic-opus");assert.equal(response.leftImageArm.status,"visible_gap");}
    assert.equal(posted.length,3,"inference is explicit and once per chosen image");
  });
  assert.equal(r.error,undefined);assert(r.prepared);const prepared=r.prepared;
  assert.equal(r.events[0],"authorized");assert(r.events.indexOf("private-media")>r.events.indexOf("authorized"));
  assert.deepEqual(prepared.variants.map(v=>v.variant),["mosaic","frame","crop"]);
  const [mosaic,frame,crop]=prepared.variants;
  const start=Math.floor(r.time/4)*4,expectedTimes=Array.from({length:Math.min(4,Math.ceil(r.duration)-start)},(_,i)=>Math.round(Math.min(start+i,r.duration-.01)*1000)/1000);
  assert.deepEqual(mosaic.times,expectedTimes);assert.deepEqual(frame.times,[r.time]);assert.deepEqual(crop.times,[r.time]);
  assert.deepEqual(r.canvases[0].frames.map(f=>f.time),expectedTimes);
  assert.deepEqual(r.canvases[1].frames.map(f=>f.time),[r.time]);assert.deepEqual(r.canvases[2].frames.map(f=>f.time),[r.time]);
  const landscape=r.width>=r.height,tileW=landscape?768:432,tileH=landscape?432:768;
  assert.deepEqual([mosaic.width,mosaic.height],[tileW*2,(tileH+32)*2],"baseline matches the existing detail-sheet geometry");
  const scale=Math.min(tileW/r.width,tileH/r.height),w=Math.round(r.width*scale),h=Math.round(r.height*scale);
  for(let index=0;index<expectedTimes.length;index++)assert.deepEqual(r.canvases[0].frames[index].args,[(index%2)*tileW+(tileW-w)/2,Math.floor(index/2)*(tileH+32)+(tileH-h)/2,w,h]);
  for(const variant of [frame,crop])assert(Math.max(variant.width,variant.height)<=1920,"the image including its label stays within the maximum edge");
  const full=r.canvases[1].frames[0].args;
  assert.deepEqual(full.slice(0,6),[0,0,r.width,r.height,0,0]);assert(full[6]<=r.width&&full[7]<=r.height,"the source is never enlarged");
  assert(Math.abs(full[6]/full[7]-r.width/r.height)<.002,"the full frame retains source geometry");
  const sx=Math.floor(r.crop.x*r.width),sy=Math.floor(r.crop.y*r.height),sw=Math.min(r.width-sx,Math.round(r.crop.width*r.width)),sh=Math.min(r.height-sy,Math.round(r.crop.height*r.height));
  const region=r.canvases[2].frames[0].args;assert.deepEqual(region.slice(0,6),[sx,sy,sw,sh,0,0],"crop uses the selected source pixels, not a previously reduced mosaic");
  assert(region[6]<=sw&&region[7]<=sh);assert.equal(crop.height,region[7]+32);
  const maxMosaic=Math.min(450000,(MAX_FRAME_REQUEST_BYTES*.62-30000)/Math.ceil(Math.ceil(r.duration)/4));
  assert(mosaic.jpeg.length<=maxMosaic);assert(frame.jpeg.length<=1_000_000&&crop.jpeg.length<=1_000_000);
  if(options.mosaicFallback){assert.equal(mosaic.quality,.65);assert.deepEqual(r.canvases[0].quality,[.85,.75,.65]);}
}
async function rejected(options:Options,pattern:RegExp,expectNoVideo=false){
  const result=await scenario(options);assert(result.error instanceof Error);assert.match(result.error.message,pattern);assert.equal(result.posted.length,0);
  if(expectNoVideo)assert.equal(result.video,undefined,"invalid input/access cannot read media");return result;
}
async function main(){
  await preparedCase();
  await preparedCase({width:3840,height:2160,mosaicFallback:true});
  await preparedCase({width:720,height:1280});
  await preparedCase({width:1000,height:1000});
  await preparedCase({duration:15.001,time:14});
  await preparedCase({duration:.5,time:0});
  await preparedCase({duration:1.2,time:1,crop:{x:0,y:0,width:1,height:1}});
  await rejected({denied:true},/Sin acceso/,true);
  await rejected({invalidAccess:true},/no disponible/,true);
  await rejected({abortBefore:true},/cancelada/,true);
  await rejected({abortAfterPreflight:true},/cancelada/,true);
  await rejected({abortAtSeek:true},/cancelada/);
  await rejected({loadError:true},/leer el vídeo/);
  await rejected({missingContext:true},/extraer el fotograma/);
  await rejected({tooLarge:true},/límite de detalle/);
  for(const time of [-1,14.5,NaN,Infinity])await rejected({time},/segundo entero/,true);
  await rejected({time:41},/fuera del tramo/);
  await rejected({duration:4.001,time:4},/fuera del tramo/);
  for(const duration of [.1,60.1,NaN,Infinity])await rejected({duration},/entre 0,5 y 60/);
  await rejected({width:0},/imagen disponible/);
  for(const change of [{testId:"another-test"},{videoId:""},{sessionId:""},{uploadedAt:"invalid"}])await rejected({source:{...input,...change}},/no admite/,true);
  for(const crop of [{x:-.1,y:0,width:1,height:1},{x:0,y:0,width:0,height:1},{x:.8,y:0,width:.3,height:1},{x:0,y:.8,width:1,height:.3},{x:0,y:0,width:NaN,height:1}])await rejected({crop},/recorte debe/,true);
  await rejected({crop:{x:0,y:0,width:.001,height:.001}},/demasiado pequeño/);
  const stale=await scenario({},async(prepared,controller,posted,source)=>{
    await assert.rejects(()=>runContactProbe({...source,uploadedAt:"2026-02-01T00:00:00.000Z"},prepared,prepared.variants[0],controller.signal),/no corresponden/);
    await assert.rejects(()=>runContactProbe({...source,videoId:"replacement"},prepared,prepared.variants[0],controller.signal),/no corresponden/);
    await assert.rejects(()=>runContactProbe(source,prepared,{...prepared.variants[0]},controller.signal),/no corresponden/);
    assert.equal(posted.length,0,"stale or substituted prepared images are never posted");
  });assert.equal(stale.error,undefined);
  for(const [option,pattern] of [["postError",/Proveedor no disponible/],["invalidJSON",/No se ha podido comparar/],["emptyResult",/No se ha podido comparar/],["wrongTime",/no corresponde al instante/],["abortAfterPost",/cancelada/]] as const){
    const failed=await scenario({[option]:true},async(prepared,controller,_posted,source)=>{await assert.rejects(()=>runContactProbe(source,prepared,prepared.variants[0],controller.signal),pattern);});
    assert.equal(failed.error,undefined);assert.equal(failed.posted.length,1,"failed inference is not retried implicitly");
  }
  console.log("PASS: contact comparison preflight/privacy, same instant across variants, source-pixel crop/aspect ratio, baseline JPEG budget, no upscaling, explicit inference only, revision isolation, server-compatible payloads, errors/abort cleanup");
}
main().catch(e=>{console.error(e);process.exitCode=1;});
