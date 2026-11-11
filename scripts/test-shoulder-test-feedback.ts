// Run with tsx. The actual server routes use isolated in-memory sessions; no network, credentials or patient data.
import assert from "node:assert/strict";
import Module from "node:module";
import { NextRequest } from "next/server";
import { DEFAULT_PILOT_CONFIG, PILOT_PROGRAM_ID, PILOT_TESTS, RUBRIC_VERSION, scorePilot } from "../lib/shoulder-pilot";
import { mergeTestFeedback, effectivePilotPain, readPatientInput, writePatientInput } from "../lib/shoulder-test-feedback";

const ids=PILOT_TESTS.map(t=>t.id), face=PILOT_TESTS.find(t=>t.key==="facePull8rm")!.id, other=ids[0];
const url="https://fixture.test/api/shoulder-pilot/";
const row=(painJson="{}")=>({version:2,aiConsent:false,aiConsentAt:null,painJson,loadsJson:"{}",observationsJson:JSON.stringify({[other]:{leftProgress:50,rightProgress:50}}),reviewedJson:JSON.stringify(Object.fromEntries(ids.map(id=>[id,{source:null,reviewerId:"staff",reviewedAt:"2026-11-01"}]))),notAssessableJson:JSON.stringify(Object.fromEntries(ids.filter(id=>id!==other).map(id=>[id,"No valorable"]))),publishedJson:null,publishedAt:null});
const rows:Record<string,any>={baseline:row(JSON.stringify({before:1,after:3,painfulTestIds:[other,face]})),retest:row(),legacy:row()};
rows.legacy.publishedJson=JSON.stringify({weekNumber:1, pain:{before:8},observations:{},scores:{axes:[]}});rows.legacy.publishedAt=new Date();
const session=(id:string)=>({id,weekNumber:id==="retest"?14:1,scheduledDate:new Date(id==="retest"?"2027-02-01":"2026-11-01"),assignmentId:"assignment",
  assignment:{programId:PILOT_PROGRAM_ID,patient:{isTest:true,fullName:"Prueba"},patientId:"athlete"},tasksSnapshot:[{id:"task",type:"ASSESSMENT",assessment:{tests:PILOT_TESTS}}]});
const protocol={rubricVersion:RUBRIC_VERSION,configJson:JSON.stringify(DEFAULT_PILOT_CONFIG)};
const db:any={programSession:{findUnique:async({where}:any)=>rows[where.id]?session(where.id):null},assessmentVideo:{findMany:async()=>[]},patient:{findUnique:async()=>null},
  shoulderPilotReview:{findUnique:async({where}:any)=>rows[where.sessionId],upsert:async({where}:any)=>rows[where.sessionId],findFirst:async()=>rows.baseline.publishedAt?{...rows.baseline,sessionId:"baseline",session:session("baseline")}:null,
    updateMany:async({where,data}:any)=>{const target=rows[where.sessionId];if(target.version!==where.version)return {count:0};const {version,...fields}=data;Object.assign(target,fields,{version:target.version+version.increment});return {count:1}}},
  shoulderPilotProtocol:{findUnique:async()=>protocol,upsert:async()=>protocol}};
db.$transaction=(cb:any)=>cb(db);
const patient={kind:"patient",patient:{id:"athlete"}},pro={kind:"professional",pro:{id:"staff"}};
let actor:any=patient;
const oldLoad=(Module as any)._load;
(Module as any)._load=function(id:string,...args:any[]){
  for(const [suffix,value] of Object.entries({prisma:{prisma:db},session:{getSessionUser:async()=>actor},"patient-evidence":{canAccessEvidencePatient:async(_id:string,p:any)=>p.id==="staff"},"onboarding-config":{getOnboardingConfig:async()=>({anamnesisSteps:[]})}})){
    if(id.endsWith("/lib/"+suffix)||id.endsWith("/lib/"+suffix+".ts"))return value;
  }
  return oldLoad.call(this,id,...args);
};
async function main(){
  const api=await import("../app/api/shoulder-pilot/[sessionId]/route");
  const get=(id="baseline")=>api.GET(new NextRequest(url+id),{params:{sessionId:id}});
  const view=async(id="baseline")=>{const res=await get(id);assert.equal(res.status,200);return res.json()};
  const patch=async(input:Record<string,unknown>,id="baseline")=>api.PATCH(new NextRequest(url+id,{method:"PATCH",headers:{"content-type":"application/json",origin:"https://fixture.test",host:"fixture.test"},body:JSON.stringify({action:"patient",version:rows[id].version,...input})}),{params:{sessionId:id}});
  assert.deepEqual((await view()).testFeedback,{});
  assert.deepEqual((await view("legacy")).published,JSON.parse(rows.legacy.publishedJson));
  assert.equal((await (await get("other")).json()).error,"Valoración no disponible.");
  const oldVersion=rows.baseline.version;
  const result=await patch({testFeedback:{[face]:{pain:6,reps:2,loadKg:8,comment:"  Molestia al final.  "},[other]:{pain:0}}});
  assert.equal(result.status,200);const initial=await result.json();
  assert.deepEqual(initial.testFeedback[face],{pain:6,reps:2,loadKg:8,comment:"Molestia al final."});
  assert.deepEqual(initial.pain.painfulTestIds,[face]);assert.deepEqual(initial.legacyPainfulTestIds,[other,face]);
  assert(!initial.observations);assert.deepEqual(initial.loads,{});
  const saved=rows.baseline.painJson;
  assert.equal((await patch({version:oldVersion,testFeedback:{[face]:{pain:1}}})).status,409);
  for(const changes of [{alien:{pain:2}},{[other]:{reps:2}},{[face]:{pain:11}},{[face]:{pain:1.5}},{[face]:{pain:"0"}},{[face]:{comment:"x".repeat(501)}},{[face]:{reps:-1}},{[face]:{loadKg:501}},{[face]:{fakeKey:1}}]){
    assert.equal((await patch({testFeedback:changes})).status,400);
  }
  assert.equal(rows.baseline.painJson,saved);
  assert.equal((await patch({testFeedback:{[face]:{comment:null}},pain:{after:4}})).status,200);
  assert.deepEqual((await view()).testFeedback[face],{pain:6,reps:2,loadKg:8});
  actor={kind:"patient",patient:{id:"other"}};assert.equal((await get()).status,404);
  assert.equal((await patch({testFeedback:{[face]:{pain:1}}})).status,404);
  actor={kind:"professional",pro:{id:"unauthorized"}};assert.equal((await get()).status,404);
  actor=pro;const current=await view();assert.deepEqual(current.testFeedback,{[other]:{pain:0},[face]:{pain:6,reps:2,loadKg:8}});
  assert(!current.reviewedTestIds.includes(face));assert(!current.reviewedTestIds.includes(other));assert.equal(current.reviewedTestIds.length,13);
  assert.equal((await patch({action:"save",testFeedback:{[face]:{pain:7}}})).status,400);
  assert.equal((await patch({action:"publish"})).status,409);
  const save={action:"save",notAssessable:current.notAssessable,observations:current.observations,reviewedTestIds:ids,videoVersions:{}};
  assert.equal((await patch(save)).status,200);assert.equal((await patch({action:"publish"})).status,200);
  const published=JSON.parse(rows.baseline.publishedJson);
  assert.deepEqual(published.testFeedback[face],{pain:6,reps:2,loadKg:8});
  assert.deepEqual(published.pain.painfulTestIds,[face]);
  assert.equal(published.scores.axes.find((a:any)=>a.key==="tolerance").score,6.25);
  assert.equal(published.scores.tests[face].score,null,"a reported attempt is not an official 8RM");
  actor=patient;
  assert.equal((await patch({testFeedback:{[face]:{pain:1}}})).status,409);
  assert.equal((await patch({testFeedback:{[face]:{pain:3,reps:8,loadKg:10}},pain:{before:1,after:3}},"retest")).status,200);
  let retest=await view("retest");assert.deepEqual(retest.baseline.testFeedback[face],published.testFeedback[face]);
  assert.deepEqual(retest.testFeedback[face],{pain:3,reps:8,loadKg:10});assert.equal(retest.pain.painfulTestIds,undefined);
  assert.equal(scorePilot({},retest.pain).axes.find(a=>a.key==="tolerance")?.score,null);
  const remainder=Object.fromEntries(ids.filter(id=>id!==face).map(id=>[id,{pain:0}]));
  assert.equal((await patch({testFeedback:remainder},"retest")).status,200);
  assert.deepEqual((await view("retest")).pain.painfulTestIds,[face]);
  assert.equal((await patch({testFeedback:{[other]:null}},"retest")).status,200);
  assert.equal((await view("retest")).pain.painfulTestIds,undefined);
  assert.equal((await patch({pain:{painfulTestIds:[]}},"retest")).status,200);
  retest=await view("retest");assert.deepEqual(retest.pain.painfulTestIds,[face]);
  assert.equal(rows.baseline.publishedJson,JSON.stringify(published),"retest does not mutate baseline publication");
  assert.deepEqual(readPatientInput(writePatientInput({},mergeTestFeedback({},{[face]:{pain:0,loadKg:0,reps:0}}))).testFeedback[face],{pain:0,loadKg:0,reps:0});
  assert.deepEqual(effectivePilotPain({painfulTestIds:[other]},{[other]:{pain:0}}).painfulTestIds,[]);
  console.log("PASS: 15 assigned tests; scoped, versioned patient feedback; legacy/empty/zero/unknown; unique tolerance; independent 8RM; frozen baseline and retest comparison.");
}
main().catch(e=>{console.error(e);process.exitCode=1}).finally(()=>{(Module as any)._load=oldLoad});
