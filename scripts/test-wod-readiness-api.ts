// Offline: never calls an AI provider or changes a patient's data.
import assert from "node:assert/strict";
import Module from "node:module";
import { NextRequest } from "next/server";
let actor:any={kind:"patient",patient:{id:"patient"}};
let programType="RECUPERA",parses=0,adapts=0,aiCalls=0,patientReads=0,writes:any[]=[];
let lastReadiness:unknown;
const db={patient:{findUnique:async({where}:any)=>{patientReads++;return where.id==="patient"?{id:"patient",programType}:null;}},
  wodLog:{create:async({data}:any)=>{writes.push(data);return {id:"log",...data};}}};
const original=(Module as any)._load;
(Module as any)._load=function(id:string,...args:any[]){
  const stubs:Record<string,unknown>={
    prisma:{prisma:db},session:{getSessionUser:async()=>actor},
    "patient-evidence":{canAccessEvidencePatient:async(id:string,pro:any)=>id==="patient"&&["manager","assigned","derived"].includes(pro.id)},
    wodParser:{parseWod:async()=>{parses++;return [{raw:"10 squats",matchedMovementId:"squat"}];},adaptWod:async(lines:any[],id:string,readiness:unknown)=>{adapts++;assert.equal(id,"patient");lastReadiness=readiness;return lines.map(l=>({...l,state:"OK",adaptedLoad:"50%"}));}},
    "ai-wod":{aiWodConfigured:()=>true,parseWodWithAI:async()=>{aiCalls++;return [];}},
  };
  for(const [name,stub]of Object.entries(stubs))if(id.endsWith("/lib/"+name)||id.endsWith("/lib/"+name+".ts"))return stub;
  return original.call(this,id,...args);
};
function req(route:string,body:unknown){return new NextRequest("https://app.fisiofitteam.com/api/wod/"+route,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)});}
async function main(){
  const adapt=await import("../app/api/wod/adapt/route");
  const log=await import("../app/api/wod/log/route");
  const body={patientId:"patient",rawText:" 10 squats ",adaptedText:"10 squats · 50%",readiness:"AMBER"};
  actor=null;
  assert.equal((await adapt.POST(req("adapt",body))).status,401);
  assert.equal((await log.POST(req("log",body))).status,401);
  actor={kind:"patient",patient:{id:"other"}};
  assert.equal((await adapt.POST(req("adapt",body))).status,404);
  assert.equal((await log.POST(req("log",body))).status,404);
  actor={kind:"professional",pro:{id:"unassigned"}};
  assert.equal((await adapt.POST(req("adapt",body))).status,404);
  assert.equal((await log.POST(req("log",body))).status,404);
  assert.equal(patientReads,0);assert.equal(parses+adapts+aiCalls,0);assert.equal(writes.length,0);
  actor={kind:"patient",patient:{id:"patient"}};
  for(const readiness of [undefined,null,"red","OTHER",1,{}]){
    assert.equal((await adapt.POST(req("adapt",{...body,readiness,programType:"ADVANCE"}))).status,400);
    assert.equal((await log.POST(req("log",{...body,readiness}))).status,400);
  }
  assert.equal(parses+adapts+aiCalls,0);assert.equal(writes.length,0);
  for(const program of ["RECUPERA","CONSOLIDA"]){
    programType=program;
    for(const readiness of ["RED","AMBER","GREEN"]){
      const response=await adapt.POST(req("adapt",{...body,readiness}));
      assert.equal(response.status,200);assert.equal(lastReadiness,readiness);
      assert.equal((await response.json()).readiness,readiness);
      assert.match(response.headers.get("cache-control")!,/no-store/);
      const saved=await log.POST(req("log",{...body,readiness,rpe:7,painScore:3,notes:" Bien "}));
      assert.equal(saved.status,200);assert.equal(writes.at(-1).readiness,readiness);
      assert.equal(writes.at(-1).rawText,"10 squats");assert.equal(writes.at(-1).notes,"Bien");
    }
  }
  for(const pro of ["manager","assigned","derived"]){
    actor={kind:"professional",pro:{id:pro}};
    assert.equal((await adapt.POST(req("adapt",body))).status,200);
  }
  actor={kind:"patient",patient:{id:"patient"}};
  for(const program of ["ADVANCE","PREVENTION","OTHER"]){
    programType=program;
    const response=await adapt.POST(req("adapt",{...body,readiness:"GREEN"}));
    assert.equal(response.status,200);assert.equal(lastReadiness,null);
    assert.equal((await log.POST(req("log",{...body,readiness:undefined}))).status,200);
    assert.equal(writes.at(-1).readiness,null);
  }
  programType="RECUPERA";
  const beforeWrites=writes.length,beforeParses=parses;
  for(const patch of [{rawText:""},{rawText:9},{rawText:"x".repeat(20001)}])assert.equal((await adapt.POST(req("adapt",{...body,...patch}))).status,400);
  for(const patch of [{adaptedText:""},{rpe:11},{painScore:-1},{rpe:"5"},{notes:{}}])assert.equal((await log.POST(req("log",{...body,...patch}))).status,400);
  assert.equal(writes.length,beforeWrites);assert.equal(parses,beforeParses);
  assert.equal((await adapt.POST(req("adapt",null))).status,400);
  assert.equal((await log.POST(req("log",[]))).status,400);
  console.log("PASS: WOD ownership and clinical scope, no parser or writes on rejected requests, required readiness by server programme, three colours through adapt/log, legacy programmes and input validation.");
}
main().catch(e=>{console.error(e);process.exitCode=1;}).finally(()=>{(Module as any)._load=original;});
