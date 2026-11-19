// Offline browser/server contract. Synthetic JPEGs only; no real video or API.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { analyzeShoulderVideo } from "../lib/shoulder-video-client";
import { validateFrames, type FrameRequest } from "../lib/shoulder-video-analysis";
import { HOLD_PVC, MAX_FRAME_REQUEST_BYTES } from "../lib/shoulder-analysis-types";

const wallFlexion="19ce1cc3-bcee-40cb-89d8-3329290f9780";
const jpegBySize=new Map<string,string>();
for(const dimensions of ["1024x728","704x1048","1536x928","864x1600"]){
  const f=spawnSync("ffmpeg",["-hide_banner","-loglevel","error","-f","lavfi","-i","color=gray:s="+dimensions,"-frames:v","1","-f","image2pipe","-c:v","mjpeg","pipe:1"]);
  assert.equal(f.status,0,"ffmpeg creates only synthetic JPEG fixtures");
  jpegBySize.set(dimensions,f.stdout.toString("base64"));
}
type Options={duration:number;width:number;height:number;hold?:boolean;denied?:boolean;tooLarge?:boolean;abort?:boolean};
async function check(options:Options){
  const {duration,width,height}=options,controller=new AbortController();
  const events:string[]=[],seeks:number[]=[],canvases:FakeCanvas[]=[];
  let posted:FrameRequest|undefined,video:FakeVideo|undefined;
  class FakeVideo extends EventTarget {
    src="";duration=options.duration;videoWidth=options.width;videoHeight=options.height;removed=false;time=0;
    set currentTime(t:number){this.time=t;seeks.push(t);queueMicrotask(()=>this.dispatchEvent(new Event("seeked")));}
    get currentTime(){return this.time;}
    load(){if(this.src)queueMicrotask(()=>this.dispatchEvent(new Event("loadeddata")));}
    removeAttribute(name:string){if(name==="src")this.src="";}
    remove(){this.removed=true;}
  }
  class FakeCanvas {
    width=0;height=0;quality:number[]=[];encodedSizes:string[]=[];
    frames:Array<{t:number;x:number;y:number;width:number;height:number}>=[];
    getContext(){return {
      fillStyle:"",font:"",fillRect(){},fillText(){},
      drawImage:(v:FakeVideo,x:number,y:number,w:number,h:number)=>this.frames.push({t:v.currentTime,x,y,width:w,height:h}),
    };}
    toDataURL(type:string,quality:number){
      assert.equal(type,"image/jpeg");this.quality.push(quality);
      const dimensions=this.width+"x"+this.height;this.encodedSizes.push(dimensions);
      const jpeg=options.tooLarge?"A".repeat(500004):jpegBySize.get(dimensions);
      assert(jpeg,"known bounded canvas size");return "data:image/jpeg;base64,"+jpeg;
    }
  }
  const scope=globalThis as any,original=new Map<string,unknown>();
  for(const key of ["window","document","fetch"])original.set(key,scope[key]);
  scope.window={location:{origin:"https://local.invalid"}};
  scope.document={createElement(tag:string){
    events.push(tag);
    if(tag==="video"){video=new FakeVideo();return video;}
    assert.equal(tag,"canvas");const canvas=new FakeCanvas();canvases.push(canvas);return canvas;
  }};
  scope.fetch=async (url:string,init?:RequestInit)=>{
    assert.equal(init?.credentials,"same-origin");
    if(init?.signal?.aborted)throw new DOMException("Aborted","AbortError");
    if(init?.method!=="POST"){events.push("authorized");return new Response(JSON.stringify({available:!options.denied,error:options.denied?"Sin acceso":undefined}),{status:options.denied?403:200});}
    events.push("posted");const body=String(init.body);
    assert(new TextEncoder().encode(body).byteLength<=MAX_FRAME_REQUEST_BYTES);
    posted=validateFrames(JSON.parse(body));
    return new Response(JSON.stringify({draft:{observationFields:{},kind:options.hold?"hold":"measurement"}}));
  };
  try{
    const call=()=>analyzeShoulderVideo({sessionId:"synthetic-session",testId:options.hold?HOLD_PVC:wallFlexion,videoId:"synthetic-upload",uploadedAt:"2026-01-01T00:00:00.000Z"},()=>{
      if(options.abort)controller.abort();
    },controller.signal);
    if(options.denied)await assert.rejects(call,/Sin acceso/);
    else if(options.tooLarge)await assert.rejects(call,/límite de imágenes/);
    else if(options.abort)await assert.rejects(call,/cancelado/);
    else await call();
  }finally{
    for(const [key,value] of original)if(value===undefined)delete scope[key];else scope[key]=value;
  }
  assert.equal(events[0],"authorized","authorization precedes private media extraction");
  if(options.denied){assert.equal(video,undefined);assert.equal(posted,undefined);return;}
  assert(video?.removed);assert.equal(video.src,"");
  for(const c of canvases){assert.equal(c.width,0);assert.equal(c.height,0);}
  if(options.tooLarge||options.abort){assert.equal(posted,undefined);return;}
  assert(posted);
  const fps=options.hold?8:3,count=Math.ceil(duration*fps),detailCount=Math.ceil(duration);
  assert.equal(seeks.length,count-1,"detail frames reuse overview seeks");
  assert.equal(canvases[0].frames.length,count);
  assert.equal(canvases[1].frames.length,detailCount);
  assert.equal(posted.detailSheets?.flatMap(s=>s.times).length,detailCount);
  const landscape=width>=height,detailW=landscape?768:432,detailH=landscape?432:768;
  const scale=Math.min(detailW/width,detailH/height);
  for(const frame of canvases[1].frames){
    assert.equal(frame.width,Math.round(width*scale));assert.equal(frame.height,Math.round(height*scale));
  }
  assert.deepEqual(posted.detailSheets?.flatMap(s=>s.times),Array.from({length:detailCount},(_,i)=>Math.round(Math.min(i,duration-.01)*1000)/1000));
  assert.equal(canvases[1].encodedSizes[0],landscape?"1536x928":"864x1600");
}
async function main(){
  for(const duration of [.5,1.005,4.001,24,60]){
    await check({duration,width:1080,height:1920});
    await check({duration,width:1920,height:1080,hold:true});
  }
  // Letterboxing preserves non-16:9 source geometry.
  await check({duration:2,width:1000,height:1000});
  await check({duration:2,width:1080,height:1920,denied:true});
  await check({duration:2,width:1080,height:1920,tooLarge:true});
  await check({duration:2,width:1080,height:1920,abort:true});
  console.log("PASS: client extraction validates on server, overview/detail timing and aspect ratio, shared seeks, access before media, no oversized POST and cleanup on completion/failure/abort");
}
main().catch(e=>{console.error(e);process.exitCode=1;});
