// Synthetic JPEG fixtures, read-only database doubles and a loopback provider only.
// These tests verify transport/permissions; they do not establish visual accuracy.
import assert from "node:assert/strict";
import Module from "node:module";
import {createServer} from "node:http";
import {once} from "node:events";
import {spawnSync} from "node:child_process";
import {NextRequest} from "next/server";
import {validateContactProbe,buildContactProbeInstruction,buildContactProbeSchema,analyzeContactProbe} from "../lib/shoulder-contact-analysis";
import {DEFAULT_PILOT_CONFIG as config,PILOT_PROGRAM_ID,PILOT_TESTS,RUBRIC_VERSION} from "../lib/shoulder-pilot";

const wall=PILOT_TESTS.find(t=>t.key==="wallPress")!.id;
const patient="synthetic-patient",professional="synthetic-professional",privateMarker="PRIVATE_IDENTIFIER_NEVER_SENT";
const stamp="2026-01-01T00:00:00.000Z";
function jpeg(size:string){
  const r=spawnSync("ffmpeg",["-hide_banner","-loglevel","error","-f","lavfi","-i","color=gray:s="+size,"-frames:v","1","-f","image2pipe","-c:v","mjpeg","pipe:1"],{maxBuffer:2000000});
  assert.equal(r.status,0,"ffmpeg creates a synthetic JPEG without patient media");return r.stdout.toString("base64");
}
let actor:any={kind:"professional",pro:{id:professional}};
const row:any={aiConsent:true,aiConsentAt:new Date(stamp),observationsJson:'{"manual":"preserved"}',version:3};
const session:any={id:"synthetic-session",assignmentId:"synthetic-assignment",weekNumber:1,scheduledDate:new Date(stamp),
  tasksSnapshot:[{id:"synthetic-task",type:"ASSESSMENT",assessment:{tests:PILOT_TESTS}}],
  assignment:{patientId:patient,programId:PILOT_PROGRAM_ID,patient:{fullName:privateMarker}}};
const video:any={patientId:patient,sessionId:session.id,taskId:"synthetic-task",testId:wall,uploadedAt:new Date(stamp),url:"https://example.invalid/private-video"};
let writes=0;
const cannotWrite=()=>{writes++;throw Error("This read-only probe must never write patient data");};
const readOnly=(reads:Record<string,unknown>)=>new Proxy(reads,{get(target,key){return key in target?target[key as string]:cannotWrite;}});
const db:any={programSession:readOnly({findUnique:async()=>session}),assessmentVideo:readOnly({findUnique:async()=>video}),
  shoulderPilotReview:readOnly({findUnique:async()=>row}),shoulderPilotProtocol:readOnly({findUnique:async()=>({rubricVersion:RUBRIC_VERSION,configJson:JSON.stringify(config)})}),$transaction:cannotWrite};
const originalLoad=(Module as any)._load;
(Module as any)._load=function(id:string,...args:any[]){
  const mocks:any={prisma:{prisma:db},session:{getSessionUser:async()=>actor},"patient-evidence":{canAccessEvidencePatient:async(id:string,p:any)=>id===patient&&p.id===professional},"onboarding-config":{getOnboardingConfig:async()=>({anamnesisSteps:[]})}};
  for(const [suffix,value] of Object.entries(mocks))if(id.endsWith("/lib/"+suffix)||id.endsWith("/lib/"+suffix+".ts"))return value;
  return originalLoad.call(this,id,...args);
};
const envKeys=["ANTHROPIC_API_KEY","ANTHROPIC_BASE_URL","SHOULDER_VIDEO_AI_MODEL"] as const;
const saved=Object.fromEntries(envKeys.map(k=>[k,process.env[k]]));
async function main(){
  const base={mode:"contact-probe",videoId:privateMarker,testId:wall,uploadedAt:stamp,duration:41,time:14,variant:"frame",times:[14],jpeg:jpeg("720x1312")};
  const frame=validateContactProbe(base);
  const mosaic=validateContactProbe({...base,variant:"mosaic",times:[12,13,14,15],jpeg:jpeg("864x1600")});
  const crop=validateContactProbe({...base,variant:"crop",jpeg:jpeg("640x512")});
  assert.equal(frame.time,14);assert.equal(crop.variant,"crop");
  for(const changes of [
    {mode:"other"},{testId:PILOT_TESTS[0].id},{videoId:""},{uploadedAt:"invalid"},
    {duration:0},{duration:60.02},{duration:NaN},{time:-1},{time:41},{time:"14"},
    {variant:"video"},{times:[]},{times:[13]},{times:[14,15]},{times:[14,14]},
    {jpeg:"https://example.invalid/frame.jpg"},{jpeg:"data:image/jpeg;base64,"+base.jpeg},
    {jpeg:base.jpeg.slice(0,-4)},{jpeg:base.jpeg+"\n"},{jpeg:"/9j/"+"A".repeat(1000000)},
  ])assert.throws(()=>validateContactProbe({...base,...changes}),"invalid probe input: "+Object.keys(changes).join(","));
  for(const times of [[12,13,15,16],[12,13,14,15,16],[12,14,13,15],[14,14,14,14],[-1,0,14],[14,42]])
    assert.throws(()=>validateContactProbe({...mosaic,times}));
  assert.throws(()=>validateContactProbe({...base,jpeg:jpeg("2000x1000")}));
  assert.throws(()=>validateContactProbe({...mosaic,jpeg:base.jpeg}),"a mosaic uses the existing detail-sheet dimensions");
  assert.equal(buildContactProbeInstruction(frame),buildContactProbeInstruction(crop),"full frame and crop use the identical question without a suggested answer");
  for(const input of [frame,mosaic,crop]){
    const prompt=buildContactProbeInstruction(input);
    for(const status of ["visible_contact","visible_gap","not_visible"])assert(prompt.includes(status));
    assert(!prompt.includes(privateMarker)&&!prompt.includes(stamp)&&!prompt.includes(patient));
  }
  const schema:any=buildContactProbeSchema();
  assert.equal(schema.additionalProperties,false);
  assert.deepEqual(schema.properties.leftImageArm.properties.status.enum,["visible_contact","visible_gap","not_visible"]);
  assert.deepEqual(schema.properties.rightImageArm.properties.status.enum,schema.properties.leftImageArm.properties.status.enum);
  assert(!JSON.stringify(schema).includes("externalDeficit")&&!JSON.stringify(schema).includes("abduction"),"this recognition experiment cannot return clinical angles or scores");

  const data={leftImageArm:{status:"visible_gap",reason:"Una porción del antebrazo se ve separada de la pared."},rightImageArm:{status:"not_visible",reason:"La mano queda oculta."},limitations:["Los grados no forman parte de esta comparación."]};
  let reply:any={content:[{type:"text",text:JSON.stringify(data)}],stop_reason:"end_turn"};
  let requests=0,status=200,stall=false,expectedInput=frame,expectedModel="claude-opus-5-5";
  let arrive:(()=>void)|undefined,release:(()=>void)|undefined,onRequest:(()=>void)|undefined;
  const server=createServer((req,res)=>{let text="";req.on("data",b=>text+=b);req.on("end",()=>{
    const sent=JSON.parse(text);requests++;
    assert.equal(req.url,"/v1/messages");assert.equal(req.headers["x-api-key"],"synthetic-only");
    assert.equal(sent.model,expectedModel);assert.equal(sent.output_config.effort,"medium");
    assert.deepEqual(sent.output_config.format,{type:"json_schema",schema});
    assert.equal(sent.tool_choice,undefined);assert.equal(sent.thinking,undefined);
    const images=sent.messages[0].content.filter((p:any)=>p.type==="image");
    assert.equal(images.length,1);assert.equal(images[0].source.data,expectedInput.jpeg);
    assert(!text.includes(privateMarker)&&!text.includes(patient)&&!text.includes(stamp));
    onRequest?.();arrive?.();arrive=undefined;
    const send=()=>{res.writeHead(status,{"content-type":"application/json"});res.end(JSON.stringify(status===200?{id:"synthetic",type:"message",role:"assistant",model:"resolved-provider-model",usage:{input_tokens:1,output_tokens:1},...reply}:{error:{type:"overloaded_error",message:"synthetic failure"}}));};
    if(stall)release=send;else send();
  });});
  server.listen(0,"127.0.0.1");await once(server,"listening");const address=server.address();assert(address&&typeof address!=="string");
  process.env.ANTHROPIC_API_KEY="synthetic-only";process.env.ANTHROPIC_BASE_URL="http://127.0.0.1:"+address.port;delete process.env.SHOULDER_VIDEO_AI_MODEL;
  try{
    for(const input of [frame,mosaic,crop]){
      expectedInput=input;const result=await analyzeContactProbe(input);
      assert.equal(result.leftImageArm.status,"visible_gap","a visible gap survives without an angle or back/wrist verdict");
      assert.equal(result.rightImageArm.status,"not_visible","the arms are classified independently");
      assert.equal(result.model,"resolved-provider-model");assert.equal(result.time,14);
      assert(!("observationFields" in result)&&!("score" in result));
    }
    expectedInput=frame;expectedModel="test-explicit-override";process.env.SHOULDER_VIDEO_AI_MODEL=expectedModel;
    await analyzeContactProbe(frame);delete process.env.SHOULDER_VIDEO_AI_MODEL;expectedModel="claude-opus-5-5";
    async function rejectResponse(next:any){reply=next;const n=requests;await assert.rejects(()=>analyzeContactProbe(frame));assert.equal(requests,n+1,"failure must not automatically resend the image");}
    for(const stop_reason of ["max_tokens","refusal","pause_turn","tool_use"])
      await rejectResponse({content:[{type:"text",text:JSON.stringify(data)}],stop_reason});
    for(const invalid of [null,[],{}, {...data,leftImageArm:{status:"inferred_contact",reason:"Unknown"}}, {...data,rightImageArm:null}, {...data,leftImageArm:{status:"visible_gap",reason:""}}, {...data,limitations:[3]}, {...data,externalDeficit:0}, {...data,leftImageArm:{...data.leftImageArm,angle:0}}])
      await rejectResponse({content:[{type:"text",text:JSON.stringify(invalid)}],stop_reason:"end_turn"});
    for(const invalid of ["","not JSON","```json\n"+JSON.stringify(data)+"\n```",JSON.stringify(data).slice(0,-1)])
      await rejectResponse({content:[{type:"text",text:invalid}],stop_reason:"end_turn"});
    reply={content:[{type:"thinking",thinking:"",signature:"synthetic"},{type:"text",text:JSON.stringify(data)}],stop_reason:"end_turn"};
    await analyzeContactProbe(frame);
    status=529;const beforeError=requests;await assert.rejects(()=>analyzeContactProbe(frame));assert.equal(requests,beforeError+1);status=200;
    // Exercise actual SDK timeout cancellation promptly instead of waiting 85 s.
    const timer=globalThis.setTimeout;stall=true;
    (globalThis as any).setTimeout=(fn:any,delay:number,...args:any[])=>timer(fn,delay===85000?25:delay,...args);
    try{const n=requests;await assert.rejects(()=>analyzeContactProbe(frame));assert.equal(requests,n+1);}finally{globalThis.setTimeout=timer;stall=false;release=undefined;}

    const api=await import("../app/api/shoulder-pilot/[sessionId]/analyze/route");
    const origin="https://fixture.test",url=origin+"/api/shoulder-pilot/"+session.id+"/analyze",ctx={params:{sessionId:session.id}};
    const request=(body:unknown=base,from:string=origin)=>new NextRequest(url,{method:"POST",headers:{origin:from,host:"fixture.test","content-type":"application/json"},body:JSON.stringify(body)});
    const post=(body:unknown=base,from?:string)=>api.POST(request(body,from),ctx);
    const expectBlocked=async(code:number,body?:unknown,from?:string)=>{const n=requests;assert.equal((await post(body,from)).status,code);assert.equal(requests,n,"denied input must not reach the provider");};
    const beforeRow=JSON.stringify(row);
    actor=null;await expectBlocked(401);
    actor={kind:"patient",patient:{id:patient}};await expectBlocked(403);
    actor={kind:"professional",pro:{id:"other"}};await expectBlocked(404);
    actor={kind:"professional",pro:{id:professional}};
    await expectBlocked(403,base,"https://other.test");
    await expectBlocked(400,{...base,testId:PILOT_TESTS[0].id});
    video.taskId="unassigned-task";await expectBlocked(404);video.taskId="synthetic-task";
    video.patientId="different-patient";await expectBlocked(404);video.patientId=patient;
    video.sessionId="different-session";await expectBlocked(404);video.sessionId=session.id;
    video.uploadedAt=new Date("2026-01-02T00:00:00.000Z");await expectBlocked(409);video.uploadedAt=new Date(stamp);
    row.aiConsent=false;await expectBlocked(409);row.aiConsent=true;
    delete process.env.ANTHROPIC_API_KEY;await expectBlocked(503);process.env.ANTHROPIC_API_KEY="synthetic-only";
    assert.equal((await post()).status,200);
    onRequest=()=>{video.uploadedAt=new Date("2026-01-02T00:00:00.000Z");};assert.equal((await post()).status,409);onRequest=undefined;video.uploadedAt=new Date(stamp);
    onRequest=()=>{row.aiConsent=false;};assert.equal((await post()).status,409);onRequest=undefined;row.aiConsent=true;
    onRequest=()=>{actor={kind:"professional",pro:{id:"revoked"}};};assert.equal((await post()).status,404);onRequest=undefined;actor={kind:"professional",pro:{id:professional}};
    stall=true;const incoming=new Promise<void>(resolve=>{arrive=resolve;});const running=post();await incoming;
    await expectBlocked(409);stall=false;release!();release=undefined;assert.equal((await running).status,200);
    assert.equal((await post()).status,200,"the worker lock is released after completion");
    assert.equal(JSON.stringify(row),beforeRow,"probe generation does not alter clinical data");assert.equal(writes,0);
  }finally{server.closeAllConnections();server.close();}
  console.log("PASS: contact-probe image/time validation, identical classification prompt, independent arm evidence, SDK provenance/schema/errors/timeout without retries, private scoped route, stale/withdrawn/revoked checks, concurrency and zero patient writes");
}
main().catch(e=>{console.error(e);process.exitCode=1;}).finally(()=>{(Module as any)._load=originalLoad;for(const key of envKeys){if(saved[key]===undefined)delete process.env[key];else process.env[key]=saved[key];}});
