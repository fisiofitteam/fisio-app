// Offline integration: no real API key, production data, patient footage or Google calls.
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { once } from "node:events";
import { spawnSync } from "node:child_process";
import { parseAIDraft,readLimitedBody,validateFrames,analyzeFrames,buildVideoInstruction } from "../lib/shoulder-video-analysis";
import { HOLD_PVC,SHOULDER_VIDEO_TESTS } from "../lib/shoulder-analysis-types";
import { DEFAULT_PILOT_CONFIG as config,PILOT_TESTS } from "../lib/shoulder-pilot";

async function main(){
  const b={testId:HOLD_PVC,videoId:"synthetic-upload",uploadedAt:"2026-01-01T00:00:00.000Z",duration:24,fps:8,sheets:[] as {times:number[],jpeg:string}[]};
  const response={hold:{start:2,end:24},rangeVisible:true,stabilityVisible:true,aboveEars:[{start:2,end:10},{start:8,end:14}],lossOfPosition:[{start:10,end:12}],notes:"Borrador verificable.",findings:[{start:10,end:12,text:"Cambio de posición."}],limitations:[]};
  const d=parseAIDraft(response,b,config);
  assert.deepEqual(d.observationFields,{holdSeconds:20,positionLossSeconds:2});
  assert.deepEqual(Object.keys(d.intervals).sort(),["lossOfPosition"]);
  // Disregard obsolete model fields even if a provider still includes them.
  assert.deepEqual(parseAIDraft({...response,tremor:[{start:2,end:19}]},b,config),d);
  assert.equal(parseAIDraft({...response,lossOfPosition:[]},b,config).observationFields.positionLossSeconds,0);
  assert(!("positionLossSeconds" in parseAIDraft({...response,lossOfPosition:null},b,config).observationFields));
  // Only count observable loss within the scored portion of the hold; overlap counts once.
  assert.equal(parseAIDraft({...response,lossOfPosition:[{start:1,end:4},{start:3,end:5},{start:21,end:24}]},b,config).observationFields.positionLossSeconds,4);
  assert.deepEqual(parseAIDraft({...response,rangeVisible:false,stabilityVisible:false},b,config).observationFields,{holdSeconds:20});
  assert.deepEqual(parseAIDraft({...response,hold:null},b,config).observationFields,{});
  assert.deepEqual(parseAIDraft({...response,lossOfPosition:[{start:-3,end:4}]},b,config).observationFields,{holdSeconds:20});
  assert.deepEqual(parseAIDraft({...response,aboveEars:null,rangeVisible:false,inRangeSeconds:2},b,config),d);
  assert.doesNotMatch(buildVideoInstruction(b),/aboveEars|rangeVisible|inRangeSeconds/);
  const numeric=PILOT_TESTS.find(t=>t.key==="wallFlexion")!;
  const measurement={...b,testId:numeric.id,fps:3};
  const validMeasurement={value:75,start:2,end:3};
  const measured=parseAIDraft({measurements:{leftProgress:validMeasurement,rightProgress:{value:60,start:4,end:5},affectedKg:{value:20,start:2,end:3}}},measurement,config);
  assert.deepEqual(measured.observationFields,{leftProgress:75,rightProgress:60});
  assert.equal(measured.findings.length,2);
  assert.deepEqual(parseAIDraft({measurements:{leftProgress:{value:80},rightProgress:{...validMeasurement,end:50}}},measurement,config).observationFields,{});
  assert.deepEqual(parseAIDraft({measurements:{leftProgress:{...validMeasurement,value:101},rightProgress:{...validMeasurement,value:"80"}}},measurement,config).observationFields,{});
  assert.deepEqual(parseAIDraft({measurements:{leftProgress:{...validMeasurement,value:0},rightProgress:null}},measurement,config).observationFields,{leftProgress:0});
  const pullover={...b,testId:PILOT_TESTS.find(t=>t.key==="pullover")!.id,fps:3};
  assert.deepEqual(parseAIDraft({measurements:{angle:{value:170,start:2,end:2.1}}},pullover,config).observationFields,{});
  assert.deepEqual(parseAIDraft({measurements:{angle:{value:170,start:2,end:3}}},pullover,config).observationFields,{angle:170});
  const scap={...b,testId:PILOT_TESTS.find(t=>t.key==="scapLateral")!.id,fps:3};
  assert.deepEqual(parseAIDraft({measurements:{r1Smooth:{...validMeasurement,value:.5},r2Smooth:{...validMeasurement,value:1}}},scap,config).observationFields,{r2Smooth:1});
  const raises={...b,testId:PILOT_TESTS.find(t=>t.key==="bumperRaises")!.id,fps:3};
  assert.deepEqual(parseAIDraft({measurements:{reps5:{...validMeasurement,value:4},range5:{...validMeasurement,value:6},range10:{...validMeasurement,value:2}}},raises,config).observationFields,{reps5:4});
  const wallPress={...b,testId:PILOT_TESTS.find(t=>t.key==="wallPress")!.id,fps:3};
  assert.deepEqual(parseAIDraft({measurements:{externalDeficit:{...validMeasurement,value:0},abduction:{...validMeasurement,value:45}}},wallPress,config).observationFields,{externalDeficit:0});
  assert.deepEqual(parseAIDraft({measurements:{externalDeficit:{...validMeasurement,value:15},abduction:{...validMeasurement,value:120}}},wallPress,config).observationFields,{externalDeficit:15});
  assert.deepEqual(parseAIDraft({measurements:{abduction:{...validMeasurement,value:120}}},wallPress,config).observationFields,{});
  for(const t of PILOT_TESTS){
    const desc=SHOULDER_VIDEO_TESTS[t.id];assert(desc,t.name+" has analysis support");
    const input={...b,testId:t.id,fps:desc.kind==="hold"?8:3};
    const instruction=buildVideoInstruction(input);
    if(desc.kind==="measurement"){
      assert.match(instruction,/measurements/);for(const f of t.fields)assert(instruction.includes(f.key));
      const fields=Object.fromEntries(t.fields.map(f=>[f.key,{...validMeasurement,value:f.min??0}]));
      assert.deepEqual(Object.keys(parseAIDraft({measurements:fields},input,config).observationFields).sort(),t.fields.map(f=>f.key).sort());
    }else if(desc.kind==="load"){
      assert.match(instruction,/No infieras cargas/);
      const proposed=parseAIDraft({notes:"Ocho repeticiones visibles.",findings:[{start:1,end:4,text:"Ejecución visible."}],measurements:{affectedKg:{...validMeasurement,value:99},referenceKg:{...validMeasurement,value:99}}},input,config);
      assert.deepEqual(proposed.observationFields,{});
      assert.equal(proposed.notes,"Ocho repeticiones visibles.");
      assert.equal(parseAIDraft({notes:"Sin evidencia"},input,config).notes,"");
    }
  }
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
  for(const t of PILOT_TESTS){
    const fps=SHOULDER_VIDEO_TESTS[t.id].kind==="hold"?8:3;
    const duration=1,times=Array.from({length:fps},(_,i)=>Math.round(i/fps*1000)/1000);
    validateFrames({...b,testId:t.id,duration,fps,sheets:[{jpeg,times}]});
  }
  assert.throws(()=>validateFrames({...b,sheets:[{...b.sheets[0],times:b.sheets[0].times.map(()=>0)},...b.sheets.slice(1)]}));
  let received=false;
  const mock=createServer((req,res)=>{
    const chunks:Buffer[]=[];req.on("data",x=>chunks.push(Buffer.from(x)));req.on("end",()=>{
      const body=JSON.parse(Buffer.concat(chunks).toString());assert.equal(req.url,"/v1/messages");assert.equal(req.headers["x-api-key"],"synthetic-only");
      const parts=body.messages[0].content;assert.doesNotMatch(parts[0].text,/temblor|tremor|aboveEars|rangeVisible|inRangeSeconds/i);assert.match(parts[0].text,/lossOfPosition/);assert.equal(parts.filter((x:any)=>x.type==="image").length,b.sheets.length);
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
  console.log("PASS: all 15 tests, bounded measurements and evidence, retired range ignored, interval clipping, missing ≠ zero and local SDK transport");
}
main().catch(e=>{console.error(e.message);process.exitCode=1;});
