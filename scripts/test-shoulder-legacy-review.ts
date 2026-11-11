// The real GET/PATCH routes against an isolated in-memory prior publication.
import assert from "node:assert/strict";
import Module from "node:module";
import { NextRequest } from "next/server";
import { DEFAULT_PILOT_CONFIG, PILOT_PROGRAM_ID, PILOT_TESTS, RUBRIC_VERSION } from "../lib/shoulder-pilot";
import { HOLD_PVC } from "../lib/shoulder-analysis-types";

const oldMeasure={holdSeconds:20,inRangeSeconds:15,unstableSeconds:4};
const reasons=Object.fromEntries(PILOT_TESTS.filter(t=>t.id!==HOLD_PVC).map(t=>[t.id,"No registrado"]));
const marks=Object.fromEntries(PILOT_TESTS.map(t=>[t.id,{source:null,reviewerId:"staff",reviewedAt:"2026-11-01T13:00:00Z"}]));
const oldPublication=JSON.stringify({weekNumber:1, observations:{[HOLD_PVC]:oldMeasure},scores:{axes:[{key:"stability",score:8}]}});
const row:any={version:1,aiConsent:false,aiConsentAt:null,observationsJson:JSON.stringify({[HOLD_PVC]:oldMeasure}),reviewedJson:JSON.stringify(marks),
  notAssessableJson:JSON.stringify(reasons),publishedJson:oldPublication,publishedAt:new Date("2026-11-01")};
const session={id:"session",assignmentId:"assign",scheduledDate:new Date("2026-11-01"),weekNumber:1,assignment:{patient:{isTest:true,fullName:"Fixture"},patientId:"p",programId:PILOT_PROGRAM_ID},
  tasksSnapshot:[{id:"task",type:"ASSESSMENT",assessment:{tests:PILOT_TESTS}}]};
const protocol={rubricVersion:RUBRIC_VERSION,configJson:JSON.stringify(DEFAULT_PILOT_CONFIG)};
const db:any={programSession:{findUnique:async()=>session},assessmentVideo:{findMany:async()=>[]},patient:{findUnique:async()=>null},
  shoulderPilotReview:{findUnique:async()=>row,upsert:async()=>row,updateMany:async({data}:any)=>{
    const {version,...fields}=data;Object.assign(row,fields,{version:row.version+version.increment});return {count:1};}},
  shoulderPilotProtocol:{findUnique:async()=>protocol,upsert:async()=>protocol}};
db.$transaction=(cb:any)=>cb(db);
let actor:any={kind:"professional",pro:{id:"staff"}};
const load=(Module as any)._load;
(Module as any)._load=function(id:string,...args:any[]){
  for(const [suffix,value] of Object.entries({
    prisma:{prisma:db},session:{getSessionUser:async()=>actor},"patient-evidence":{canAccessEvidencePatient:async()=>true},
    "onboarding-config":{getOnboardingConfig:async()=>({anamnesisSteps:[]})},
  }))if(id.endsWith("/lib/"+suffix)||id.endsWith("/lib/"+suffix+".ts"))return value;
  return load.call(this,id,...args);
};
async function main(){
  const api=await import("../app/api/shoulder-pilot/[sessionId]/route");
  const url="https://fixture.test/api/shoulder-pilot/session",ctx={params:{sessionId:"session"}};
  const get=async()=>{const r=await api.GET(new NextRequest(url),ctx);assert.equal(r.status,200);return r.json()};
  const patch=(body:Record<string,unknown>)=>api.PATCH(new NextRequest(url,{method:"PATCH",headers:{"content-type":"application/json",origin:"https://fixture.test",host:"fixture.test"},body:JSON.stringify({version:row.version,...body})}),ctx);
  const current=await get();
  assert.equal(current.reviewedTestIds.length,PILOT_TESTS.length-1);
  assert(!current.reviewedTestIds.includes(HOLD_PVC));
  assert.deepEqual(current.observations[HOLD_PVC],{holdSeconds:20,inRangeSeconds:15});
  assert.equal((await patch({action:"publish"})).status,409,"cannot republish old check without human review");
  const save={action:"save",notAssessable:reasons,reviewedTestIds:PILOT_TESTS.map(t=>t.id),videoVersions:{}};
  assert.equal((await patch({...save,observations:{[HOLD_PVC]:oldMeasure}})).status,409,"an old browser must refresh");
  assert.equal(row.publishedJson,oldPublication);
  actor={kind:"patient",patient:{id:"p"}};
  const patient=await get();assert.equal(patient.observations,undefined);assert.deepEqual(patient.published,JSON.parse(oldPublication));
  actor={kind:"professional",pro:{id:"staff"}};
  const reviewed={holdSeconds:20,inRangeSeconds:15,positionLossSeconds:2};
  assert.equal((await patch({...save,observations:{[HOLD_PVC]:reviewed}})).status,200);
  assert.equal(row.publishedJson,oldPublication,"saving a fresh measurement cannot silently change the old publication");
  assert.equal((await patch({action:"publish"})).status,200);
  assert.deepEqual(JSON.parse(row.publishedJson).observations[HOLD_PVC],reviewed);
  console.log("PASS: old mixed hold loses only its draft verification; stale saves rejected, publication unchanged until human review and republish.");
}
main().catch(e=>{console.error(e);process.exitCode=1}).finally(()=>{(Module as any)._load=load});
