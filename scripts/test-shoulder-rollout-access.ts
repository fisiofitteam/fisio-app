// Real access/view/share services with isolated fixtures. No DB, network, or AI calls.
import assert from "node:assert/strict";
import Module from "node:module";
import { createHash } from "node:crypto";
import { DEFAULT_PILOT_CONFIG, PILOT_PROGRAM_ID, PILOT_TESTS, RUBRIC_VERSION, scorePilot } from "../lib/shoulder-pilot";

const rawSnapshot=JSON.stringify([{id:"task",type:"ASSESSMENT",assessment:{tests:PILOT_TESTS}}]);
const session:any={id:"session",assignmentId:"assignment",scheduledDate:new Date("2026-11-16"),weekNumber:1,tasksSnapshot:rawSnapshot,
  assignment:{id:"assignment",programId:PILOT_PROGRAM_ID,patientId:"patient",patient:{isTest:false,fullName:"Fixture"}}};
const publishedDate=new Date("2026-11-17T10:00:00Z");
const publication={weekNumber:1,publishedAt:publishedDate.toISOString(),rubricVersion:RUBRIC_VERSION,
  observations:{},pain:{},scores:scorePilot({}),narrative:{general:"Publicado inicialmente."}};
let row:any=null,actor:any={kind:"patient",patient:{id:"patient"}},found=true,share:any=null;
const video:any={id:"video",patientId:"patient",sessionId:"session",taskId:"task",testId:PILOT_TESTS.find(t=>t.key==="pvcHold")!.id,
  uploadedAt:new Date("2026-11-14T11:00:00Z"),url:"https://fixture.private.blob.vercel-storage.com/assessments/video/504587d4-c0f6-4f5b-a8e5-c54c7396fdca.mp4"};
const protocol={rubricVersion:RUBRIC_VERSION,configJson:JSON.stringify(DEFAULT_PILOT_CONFIG)};
const db:any={
  programSession:{findUnique:async({where}:any)=>found&&where.id===session.id?session:null},
  shoulderPilotReview:{findUnique:async()=>row,findFirst:async()=>null},
  shoulderPilotProtocol:{findUnique:async()=>protocol},
  assessmentVideo:{findMany:async({where}:any)=>where.sessionId===video.sessionId&&where.patientId===video.patientId?[video]:[]},
  patient:{findUnique:async()=>({anamnesisData:null})},
  $queryRaw:async(strings:TemplateStringsArray,...values:any[])=>{
    const sql=strings.join("?");
    if(sql.includes('SELECT sh."reportJson"')){
      assert(sql.includes('s."assignmentId"=sh."assignmentId"')&&sql.includes('a."patientId"=sh."patientId"'));
      assert(sql.includes('sh."expiresAt">')&&sql.includes('s."weekNumber" IN (1,14)'));
      assert(!sql.includes('p."isTest"'),"shared reports must also work for regular patients");
      if(!share||share.tokenHash!==values[0]||share.expiresAt<=new Date()||session.assignment.programId!==values[2]||
        ![1,14].includes(session.weekNumber)||share.assignmentId!==session.assignmentId||share.patientId!==session.assignment.patientId)return [];
      return [{reportJson:share.reportJson,tasksSnapshot:session.tasksSnapshot}];
    }
    return share&&share.expiresAt>new Date()?[share]:[];
  },
  $executeRaw:async(strings:TemplateStringsArray,...values:any[])=>{
    const sql=strings.join("?");
    if(sql.startsWith('INSERT INTO "ShoulderReportShare"')){
      const [sessionId,patientId,assignmentId,tokenHash,issuedAt,publishedAt,baselinePublishedAt,expiresAt,reportJson]=values;
      share={sessionId,patientId,assignmentId,tokenHash,issuedAt:new Date(issuedAt+"Z"),publishedAt:new Date(publishedAt+"Z"),
        baselinePublishedAt:baselinePublishedAt?new Date(baselinePublishedAt+"Z"):null,expiresAt:new Date(expiresAt+"Z"),reportJson};
    }else if(sql.startsWith('DELETE FROM "ShoulderReportShare"'))share=null;
    else assert.fail("Unexpected write");
    return 1;
  },
};
db.$transaction=(callback:any)=>callback(db);
const originalLoad=(Module as any)._load;
(Module as any)._load=function(id:string,...args:any[]){
  const stubs:Record<string,unknown>={prisma:{prisma:db},session:{getSessionUser:async()=>actor},
    "patient-evidence":{canAccessEvidencePatient:async(patientId:string,professional:any)=>patientId==="patient"&&professional.id==="staff"},
    "onboarding-config":{getOnboardingConfig:async()=>({anamnesisSteps:[]})}};
  for(const [name,value] of Object.entries(stubs))if(id.endsWith("/lib/"+name)||id.endsWith("/lib/"+name+".ts"))return value;
  return originalLoad.call(this,id,...args);
};
async function main(){
  const access=await import("../lib/shoulder-pilot-server"),sharing=await import("../lib/shoulder-share-server");
  const denied=(status:number)=>(error:any)=>error instanceof access.PilotHttpError&&error.status===status;
  for(const isTest of [false,true]){
    session.assignment.patient.isTest=isTest;
    for(const week of [1,14]){session.weekNumber=week;assert.equal((await access.requirePilotAccess("session")).testIds.size,15);}
  }
  session.assignment.patient.isTest=false;session.weekNumber=1;
  actor=null;await assert.rejects(access.requirePilotAccess("session"),denied(401));
  actor={kind:"patient",patient:{id:"other"}};await assert.rejects(access.requirePilotAccess("session"),denied(404));
  actor={kind:"patient",patient:{id:"patient"}};await assert.rejects(access.requirePilotAccess("session",true),denied(403));
  const patientView:any=await access.getPilotView("session");
  assert.equal(patientView.observations,undefined);assert.equal(patientView.published,null);
  actor={kind:"professional",pro:{id:"other"}};await assert.rejects(access.requirePilotAccess("session",true),denied(404));
  actor={kind:"professional",pro:{id:"staff"}};
  const view:any=await access.getPilotView("session");
  assert.equal(view.videos.length,1);assert.equal(view.videos[0].aiReviewBlocked,false,"existing assigned recording does not require reupload");
  assert.deepEqual(view.observations,{});assert.deepEqual(view.pain,{},"missing numeric responses are not fabricated");
  row={version:1,aiConsent:false,aiConsentAt:new Date(),observationsJson:"{}"};
  assert.equal(((await access.getPilotView("session")) as any).videos[0].aiReviewBlocked,true,"explicit withdrawal remains in force");
  row=null;
  found=false;await assert.rejects(access.requirePilotAccess("session"),denied(404));found=true;
  session.assignment.programId="other";await assert.rejects(access.requirePilotAccess("session"),denied(404));session.assignment.programId=PILOT_PROGRAM_ID;
  session.weekNumber=2;await assert.rejects(access.requirePilotAccess("session"),denied(404));session.weekNumber=1;
  session.tasksSnapshot=JSON.stringify([{id:"task",type:"ASSESSMENT",assessment:{tests:PILOT_TESTS.slice(1)}}]);
  await assert.rejects(access.requirePilotAccess("session"),denied(404));session.tasksSnapshot=rawSnapshot;

  row={version:1,publishedAt:publishedDate,publishedJson:JSON.stringify(publication)};
  const issued=await sharing.issueShoulderShare("session",publishedDate.toISOString()),token=issued.path.split("/").pop()!;
  assert.equal(share.tokenHash,createHash("sha256").update(token).digest("hex"));
  assert.equal((await sharing.getSharedShoulderReports(token))?.report.narrative?.general,"Publicado inicialmente.");
  row.publishedAt=new Date(publishedDate.getTime()+1000);row.publishedJson=JSON.stringify({...publication,publishedAt:row.publishedAt.toISOString(),narrative:{general:"Nueva publicación."}});
  assert.equal((await sharing.getSharedShoulderReports(token))?.report.narrative?.general,"Publicado inicialmente.","existing share is immutable after republication");
  assert.equal((await sharing.getShoulderShareStatus("session")).upToDate,false);
  session.tasksSnapshot="[]";assert.equal(await sharing.getSharedShoulderReports(token),null,"shared source must still be an eligible battery");session.tasksSnapshot=rawSnapshot;
  session.assignment.programId="other";assert.equal(await sharing.getSharedShoulderReports(token),null);session.assignment.programId=PILOT_PROGRAM_ID;
  const expiry=share.expiresAt;share.expiresAt=new Date(0);assert.equal(await sharing.getSharedShoulderReports(token),null);share.expiresAt=expiry;
  actor={kind:"patient",patient:{id:"patient"}};await assert.rejects(sharing.issueShoulderShare("session",row.publishedAt.toISOString()),denied(403));
  actor={kind:"professional",pro:{id:"staff"}};await sharing.revokeShoulderShare("session");assert.equal(await sharing.getSharedShoulderReports(token),null);
  console.log("PASS: real/test patient eligibility, role and patient isolation, complete battery/week/program guards, existing videos, withdrawal, missing data, immutable shared reports, expiry and revocation");
}
main().catch(error=>{console.error(error);process.exitCode=1}).finally(()=>{(Module as any)._load=originalLoad});
