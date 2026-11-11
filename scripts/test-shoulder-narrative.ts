// Synthetic fixtures and loopback provider only; no actual identity, key or production database.
import assert from "node:assert/strict";
import Module from "node:module";
import {createServer} from "node:http";
import {once} from "node:events";
import {NextRequest} from "next/server";
import {DEFAULT_PILOT_CONFIG as config,PILOT_PROGRAM_ID,PILOT_TESTS,RUBRIC_VERSION,scorePilot} from "../lib/shoulder-pilot";
import {readReviewDraft,cleanShoulderNarrative} from "../lib/shoulder-narrative";
import {makeNarrativeEvidence} from "../lib/shoulder-narrative-evidence";
import {writePatientInput} from "../lib/shoulder-test-feedback";
const test=PILOT_TESTS[0].id,ids=PILOT_TESTS.map(t=>t.id),face=PILOT_TESTS.find(t=>t.key==="facePull8rm")!.id,hold=PILOT_TESTS.find(t=>t.key==="pvcHold")!.id;
const privateText="PERSONAL_UNSENT_MARKER",patient="SYNTHETIC_PATIENT",pro="SYNTHETIC_PHYSIO";
const validObs={[test]:{leftProgress:50,rightProgress:50}};
const inputPain={before:10,after:10,painfulTestIds:ids};
const feedback={[face]:{pain:3,reps:8,loadKg:10,comment:privateText}};
const reasons=Object.fromEntries(ids.filter(id=>id!==test).map(id=>[id,privateText]));
const row:any={version:2,observationsJson:JSON.stringify(validObs),loadsJson:"{}",notAssessableJson:JSON.stringify(reasons),reviewedJson:"{}",painJson:writePatientInput(inputPain,feedback)};
const prior:any={weekNumber:1,rubricVersion:RUBRIC_VERSION,observations:{[hold]:{unstableSeconds:1}},testFeedback:{[face]:{pain:6,reps:2,loadKg:8,comment:privateText}},scores:{axes:[{key:"stability",score:1},{key:"tolerance",score:2}]}};
const session={id:"ss",weekNumber:14,assignmentId:"assn",scheduledDate:new Date("2027-02-01"),tasksSnapshot:[{id:"task",type:"ASSESSMENT",assessment:{tests:PILOT_TESTS}}],assignment:{patientId:patient,programId:PILOT_PROGRAM_ID,patient:{isTest:true,fullName:privateText}}};
const protocol={rubricVersion:RUBRIC_VERSION,configJson:JSON.stringify(config)};
const db:any={programSession:{findUnique:async()=>session},assessmentVideo:{findMany:async()=>[]},patient:{findUnique:async()=>null},
  shoulderPilotReview:{findUnique:async()=>row,upsert:async()=>row,findFirst:async()=>({publishedJson:JSON.stringify(prior),sessionId:"baseline",session}),updateMany:async({where,data}:any)=>{
    if(row.version!==where.version)return {count:0};const {version,...fields}=data;Object.assign(row,fields,{version:row.version+version.increment});return {count:1};
  }},shoulderPilotProtocol:{findUnique:async()=>protocol,upsert:async()=>protocol}};
db.$transaction=(cb:any)=>cb(db);
let actor:any={kind:"professional",pro:{id:pro}};
const original=(Module as any)._load;
(Module as any)._load=function(id:string,...args:any[]){
  for(const [suffix,value] of Object.entries({prisma:{prisma:db},session:{getSessionUser:async()=>actor},"patient-evidence":{canAccessEvidencePatient:async(_id:string,p:any)=>p.id===pro},"onboarding-config":{getOnboardingConfig:async()=>({anamnesisSteps:[]})}}))
    if(id.endsWith("/lib/"+suffix)||id.endsWith("/lib/"+suffix+".ts"))return value;
  return original.call(this,id,...args);
};
const base="https://fixture.test/api/shoulder-pilot/ss",ctx={params:{sessionId:"ss"}};
const request=(url:string,method:string,body?:unknown,origin="https://fixture.test")=>new NextRequest(url,{method,headers:{"content-type":"application/json",origin,host:"fixture.test"},...(body===undefined?{}:{body:JSON.stringify(body)})});
const fixtureKey=process.env.ANTHROPIC_API_KEY,fixtureUrl=process.env.ANTHROPIC_BASE_URL;
let calls=0,mode:"valid"|"wrong"|"stale"="valid";
async function main(){
  const api=await import("../app/api/shoulder-pilot/[sessionId]/route");
  const gen=await import("../app/api/shoulder-pilot/[sessionId]/narrative/route");
  const get=async()=>{const res=await api.GET(request(base,"GET"),ctx);assert.equal(res.status,200);return res.json();};
  const patch=(v:Record<string,unknown>)=>api.PATCH(request(base,"PATCH",{version:row.version,...v}),ctx);
  const generate=(body:unknown={version:row.version},origin?:string)=>gen.POST(request(base+"/narrative","POST",body,origin),ctx);
  const pain={before:0,after:10,painfulTestIds:ids}; // zero tolerance must still generate prose
  row.painJson=writePatientInput(pain,feedback);
  assert.deepEqual(readReviewDraft(JSON.stringify(validObs)),{observations:validObs,narrative:{}});
  assert.throws(()=>cleanShoulderNarrative({alien:"Text"}));assert.throws(()=>cleanShoulderNarrative({general:"x".repeat(1201)}));
  assert.deepEqual(cleanShoulderNarrative({general:"  Texto  ",mobility:"  "}),{general:"Texto"});
  const observations:any={}; for(const k of ["pvcHold","bumperHold"])observations[PILOT_TESTS.find(t=>t.key===k)!.id]={holdSeconds:20,inRangeSeconds:20,positionLossSeconds:0};
  const evidence=makeNarrativeEvidence({weekNumber:14,config,observations,pain,testFeedback:feedback},prior);
  assert.equal(evidence.capacidades.find(a=>a.key==="stability")?.comparacion,null);
  assert.equal(evidence.capacidades.find(a=>a.key==="tolerance")?.nota,0);
  assert.deepEqual(evidence.intentosDeclarados[0].actual,{dolorDurante:3,repeticionesRealizadas:8,cargaIntentadaKg:10});
  assert.deepEqual(evidence.intentosDeclarados[0].inicial,{dolorDurante:6,repeticionesRealizadas:2,cargaIntentadaKg:8});
  assert(!JSON.stringify(evidence).includes(privateText));
  const getPro=await get();assert.deepEqual(getPro.narrative,{});
  const save={action:"save",observations:validObs,reviewedTestIds:ids,notAssessable:reasons,videoVersions:{}};
  const human={general:"Comentario revisado de la valoración.",tolerance:"Primera valoración del dolor."};
  assert.equal((await patch({...save,narrative:human})).status,200);
  assert.deepEqual((await get()).narrative,human);
  // Existing staff clients not sending narrative do not erase a newer narrative.
  assert.equal((await patch(save)).status,200);assert.deepEqual((await get()).narrative,human);
  assert.equal((await patch({...save,narrative:{general:"x".repeat(1201)}})).status,400);
  actor={kind:"patient",patient:{id:patient}};
  assert.equal((await get()).narrative,undefined);
  assert.equal((await patch({action:"patient",narrative:{general:"injected"}})).status,400);
  assert.equal((await generate()).status,403);
  assert.equal((await patch({action:"patient",loads:{[face]:{affectedKg:8}}})).status,200);
  assert.deepEqual(readReviewDraft(row.observationsJson).narrative,human);
  actor={kind:"professional",pro:{id:"other"}};assert.equal((await generate()).status,404);
  actor={kind:"professional",pro:{id:pro}};
  assert.equal((await generate({version:row.version},"https://other.test")).status,403);
  assert.equal((await generate({version:row.version-1})).status,409);
  assert.equal((await generate({version:row.version,notes:"injected"})).status,400);
  delete process.env.ANTHROPIC_API_KEY;
  assert.equal((await generate()).status,503);assert.deepEqual((await get()).narrative,human);
  const server=createServer((req,res)=>{
    let buf="";req.on("data",x=>buf+=x);req.on("end",()=>{
      const payload=JSON.parse(buf),sent=JSON.parse(payload.messages[0].content);
      const measured=sent.capacidades.filter((a:any)=>a.nota!==null);
      assert(!buf.includes(privateText)&&!buf.includes(patient)&&!buf.includes(pro)&&!buf.includes(face));
      assert.deepEqual(measured.map((a:any)=>a.key),["tolerance"]);
      assert.equal(sent.intentosDeclarados[0].actual.dolorDurante,3);
      calls++;if(mode==="stale")row.version++;
      const input=mode==="wrong"?{general:"incompleto"}:{general:"La respuesta al esfuerzo se describe en las pruebas con datos.",tolerance:"El atleta refirió dolor en las pruebas."};
      res.writeHead(200,{"content-type":"application/json"});res.end(JSON.stringify({id:"msg_test",type:"message",role:"assistant",model:"test",content:[{type:"tool_use",id:"tool_test",name:"proponer_comentarios",input}],stop_reason:"tool_use",stop_sequence:null,usage:{input_tokens:1,output_tokens:1}}));
    });
  });
  server.listen(0,"127.0.0.1");await once(server,"listening");const addr=server.address();assert(addr&&typeof addr!=="string");
  process.env.ANTHROPIC_API_KEY="synthetic-only";process.env.ANTHROPIC_BASE_URL="http://127.0.0.1:"+addr.port;
  try{
    const res=await generate();assert.equal(res.status,200);const {proposal,version}=await res.json();assert.equal(version,row.version);
    assert.equal(Object.keys(proposal).length,7);assert.equal(proposal.mobility,"Aún no hay datos suficientes para valorar esta capacidad.");assert.match(proposal.tolerance,/dolor/);
    assert.deepEqual((await get()).narrative,human,"generation never writes");
    mode="wrong";assert.equal((await generate()).status,502);
    mode="stale";assert.equal((await generate()).status,409);assert.equal(calls,3);
    assert.equal((await patch(save)).status,200);
    assert.equal((await patch({action:"publish"})).status,200);
    actor={kind:"patient",patient:{id:patient}};assert.deepEqual((await get()).published.narrative,human);
    actor={kind:"professional",pro:{id:pro}};assert.equal((await patch({...save,narrative:{general:"Borrador distinto."}})).status,200);
    actor={kind:"patient",patient:{id:patient}};const pv=await get();assert(!pv.narrative);assert.deepEqual(pv.published.narrative,human);
    assert(!JSON.stringify(pv).includes("Borrador distinto."));
  }finally{server.close();}
  console.log("PASS: professional-only, scoped numerical evidence, actual SDK on loopback, zero vs missing, legacy comparison, clinical edits, frozen publication and stale response.");
}
main().catch(e=>{console.error(e);process.exitCode=1;}).finally(()=>{(Module as any)._load=original;
  if(fixtureKey===undefined)delete process.env.ANTHROPIC_API_KEY;else process.env.ANTHROPIC_API_KEY=fixtureKey;
  if(fixtureUrl===undefined)delete process.env.ANTHROPIC_BASE_URL;else process.env.ANTHROPIC_BASE_URL=fixtureUrl;
});
