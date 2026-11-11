// Offline integration: no real API key, production data, patient footage or Google calls.
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { once } from "node:events";
import { spawnSync } from "node:child_process";
import { parseAIDraft,readLimitedBody,validateFrames,analyzeFrames } from "../lib/shoulder-video-analysis";
import { HOLD_PVC } from "../lib/shoulder-analysis-types";
import { DEFAULT_PILOT_CONFIG as config } from "../lib/shoulder-pilot";

async function main(){
  const b={testId:HOLD_PVC,videoId:"synthetic-upload",uploadedAt:"2026-01-01T00:00:00.000Z",consentVersion:"test",duration:24,fps:8,sheets:[] as {times:number[],jpeg:string}[]};
  const response={hold:{start:2,end:24},rangeVisible:true,stabilityVisible:true,aboveEars:[{start:2,end:10},{start:8,end:14}],lossOfPosition:[{start:10,end:12}],tremor:[{start:11,end:12},{start:13,end:14},{start:17,end:19},{start:23,end:24}],notes:"Borrador verificable.",findings:[{start:10,end:12,text:"Cambio de posición."}],limitations:[]};
  const d=parseAIDraft(response,b,config);
  assert.deepEqual(d.observationFields,{holdSeconds:20,inRangeSeconds:12,unstableSeconds:5});
  assert.deepEqual(parseAIDraft({...response,rangeVisible:false,stabilityVisible:false},b,config).observationFields,{holdSeconds:20});
  assert.deepEqual(parseAIDraft({...response,hold:null},b,config).observationFields,{});
  assert.deepEqual(parseAIDraft({...response,lossOfPosition:[{start:-3,end:4}]},b,config).observationFields,{holdSeconds:20,inRangeSeconds:12});
  const q={...b,testId:"08f41761-3bfd-4172-8be8-0b860a0df414",fps:3};
  assert.equal(parseAIDraft({notes:"No verificable",findings:[]},q,config).notes,"");
  assert.deepEqual(parseAIDraft(response,q,config).observationFields,{});
  await assert.rejects(()=>readLimitedBody(new Request("https://local.invalid",{method:"POST",body:"[]",headers:{"Content-Type":"application/json","Content-Length":"9000000"}})),/grande/);
  assert.throws(()=>validateFrames({...b,sheets:[{times:[0],jpeg:"https://example.invalid/image.jpg"}]}));
  const f=spawnSync("ffmpeg",["-hide_banner","-loglevel","error","-f","lavfi","-i","color=gray:s=1024x728","-frames:v","1","-f","image2pipe","-c:v","mjpeg","pipe:1"],{maxBuffer:1024*1024});
  if(f.status!==0)throw Error("This offline SDK transport test needs ffmpeg for its synthetic JPEG fixture.");
  const jpeg=f.stdout.toString("base64");
  for(let i=0;i<b.duration*b.fps;i+=16)b.sheets.push({jpeg,times:Array.from({length:16},(_,j)=>(i+j)/b.fps)});
  validateFrames(b);
  assert.throws(()=>validateFrames({...b,sheets:[{...b.sheets[0],times:b.sheets[0].times.map(()=>0)},...b.sheets.slice(1)]}));
  let received=false;
  const mock=createServer((req,res)=>{
    const chunks:Buffer[]=[];req.on("data",x=>chunks.push(Buffer.from(x)));req.on("end",()=>{
      const body=JSON.parse(Buffer.concat(chunks).toString());assert.equal(req.url,"/v1/messages");assert.equal(req.headers["x-api-key"],"synthetic-only");
      const parts=body.messages[0].content;assert.equal(parts.filter((x:any)=>x.type==="image").length,b.sheets.length);
      assert.equal(parts.find((x:any)=>x.type==="image").source.media_type,"image/jpeg");assert(!JSON.stringify(body).includes("synthetic-upload"));
      received=true;res.writeHead(200,{"Content-Type":"application/json"});res.end(JSON.stringify({
        id:"mock-only",type:"message",role:"assistant",model:"synthetic",content:[{type:"text",text:JSON.stringify(response)}],stop_reason:"end_turn",usage:{input_tokens:20,output_tokens:12}
      }));
    });
  });mock.listen(0,"127.0.0.1");await once(mock,"listening");const addr=mock.address();assert(addr&&typeof addr==="object");
  const old=process.env.ANTHROPIC_API_KEY,oldUrl=process.env.ANTHROPIC_BASE_URL;
  try{process.env.ANTHROPIC_API_KEY="synthetic-only";process.env.ANTHROPIC_BASE_URL="http://127.0.0.1:"+addr.port;
    assert.deepEqual((await analyzeFrames(b,config)).observationFields,d.observationFields);assert(received);
  }finally{if(old===undefined)delete process.env.ANTHROPIC_API_KEY;else process.env.ANTHROPIC_API_KEY=old;
    if(oldUrl===undefined)delete process.env.ANTHROPIC_BASE_URL;else process.env.ANTHROPIC_BASE_URL=oldUrl;mock.close();}
  console.log("PASS: bounded visual input, interval union/clipping, missing ≠ zero, timestamped evidence and real SDK against local transport");
}
main().catch(e=>{console.error(e.message);process.exitCode=1;});
