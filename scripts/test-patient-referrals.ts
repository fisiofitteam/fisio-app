// Offline referral invariants. Never opens WhatsApp, creates a booking or pays money.
import assert from "node:assert/strict";
import Module from "node:module";
import { NextRequest } from "next/server";
import { isReferralProgram, validReferralCode, sameReferralContact, referralQualifyingSale } from "../lib/patient-referrals";
const patient:any={id:"patient",programType:"RECUPERA",referralCode:null,email:"patient@example.invalid",phone:"+34 600 123 456"};
let actor:any={kind:"patient",patient:{id:"patient"}},existing=false,reads=0,writes=0;
let storedPhone:string|null=null,phoneQueries=0;
const db={patient:{
  findUnique:async({where,select}:any)=>{
    reads++;
    if(where.id && where.id!==patient.id || where.referralCode && where.referralCode!==patient.referralCode)return null;
    return Object.fromEntries(Object.keys(select).map(k=>[k,patient[k]]));
  },
  updateMany:async({where,data}:any)=>{
    writes++;
    if(where.id===patient.id && patient.referralCode===null){patient.referralCode=data.referralCode;return {count:1};}
    return {count:0};
  },
  findFirst:async({where}:any)=>{
    assert.equal(where.email.mode,"insensitive");
    return existing?{id:"existing"}:null;
  }
},$queryRaw:async(strings:TemplateStringsArray,...values:unknown[])=>{
  phoneQueries++;
  // Assert a bound parameter and all three PostgreSQL normalization steps.
  const sql=strings.join("?");
  assert.equal(values.length,1);
  assert.match(sql,/regexp_replace\(regexp_replace\(COALESCE\("phone", ''\), '\[\^0-9\]', '', 'g'\), '\^00', ''\)/);
  assert.match(sql,/CASE WHEN length\(digits\) = 9 THEN '34' \|\| digits ELSE digits END/);
  assert.match(sql,/LIMIT 1/);
  assert(!sql.includes(String(values[0])));
  // Emulate PostgreSQL's expression over synthetic data, never a real DB.
  let digits=(storedPhone??"").split("").filter(c=>c>="0"&&c<="9").join("");
  if(digits.startsWith("00"))digits=digits.slice(2);
  if(digits.length===9)digits="34"+digits;
  return digits===values[0]?[{id:"existing-phone"}]:[];
}};
const original=(Module as any)._load;
(Module as any)._load=function(id:string,...args:any[]){
  const stubs:Record<string,unknown>={prisma:{prisma:db},session:{getSessionUser:async()=>actor},
    "patient-evidence":{canAccessEvidencePatient:async(id:string,pro:any)=>id===patient.id&&pro.id==="manager"}};
  for(const [name,stub] of Object.entries(stubs))if(id.endsWith("/lib/"+name)||id.endsWith("/lib/"+name+".ts"))return stub;
  return original.call(this,id,...args);
};
async function main(){
  for(const program of ["RECUPERA","CONSOLIDA","ADVANCE"])assert(isReferralProgram(program));
  for(const program of ["PREVENTION",null,undefined,"", "recupera","OTHER"])assert(!isReferralProgram(program));
  assert(sameReferralContact(patient,{email:" PATIENT@example.invalid "}));
  assert(sameReferralContact(patient,{phone:"600123456"}));
  assert(!sameReferralContact({email:null,phone:null},{email:"",phone:""}));
  const service=await import("../lib/patient-referrals-server");
  const denied=(status:number)=>(e:any)=>e instanceof service.ReferralError&&e.status===status;
  actor=null;await assert.rejects(service.getReferralPath(patient.id),denied(401));assert.equal(writes,0);
  actor={kind:"patient",patient:{id:"other"}};await assert.rejects(service.getReferralPath(patient.id),denied(404));assert.equal(writes,0);
  actor={kind:"professional",pro:{id:"unassigned"}};await assert.rejects(service.getReferralPath(patient.id),denied(404));
  actor={kind:"patient",patient:{id:patient.id}};
  patient.programType="PREVENTION";await assert.rejects(service.getReferralPath(patient.id),denied(404));assert.equal(writes,0);
  patient.programType="ADVANCE";
  const paths=await Promise.all([service.getReferralPath(patient.id),service.getReferralPath(patient.id)]);
  assert.equal(paths[0],paths[1]);assert(validReferralCode(patient.referralCode));assert(!paths[0].includes(patient.id));
  const code=patient.referralCode,before=writes;await service.getReferralPath(patient.id);assert.equal(writes,before);
  actor={kind:"professional",pro:{id:"manager"}};assert.equal(await service.getReferralPath(patient.id),paths[0]);
  assert.deepEqual(await service.getPublicReferral(code),{valid:true});
  const beforeInvalid=reads;assert.deepEqual(await service.getPublicReferral("../patient"),{valid:false});assert.equal(reads,beforeInvalid);
  assert.equal(await service.resolveReferralAttribution(code,{email:patient.email,phone:"999999999"}),null);
  assert.equal(await service.resolveReferralAttribution(code,{email:"friend@example.invalid",phone:"600123456"}),null);
  assert.deepEqual(await service.resolveReferralAttribution(code,{email:"friend@example.invalid",phone:"+34 611 222 333"}),{referredByPatientId:patient.id});
  existing=true;assert.equal(await service.resolveReferralAttribution(code,{email:"friend@example.invalid",phone:"+34 611 222 333"}),null);existing=false;
  // Another existing patient must stay ineligible even with a different email.
  for(const stored of ["+34 611 222 333","0034 (611) 222-333","611.222.333","34611222333"]){
    storedPhone=stored;
    for(const entered of ["+34611222333","0034 611 222 333","611222333"]){
      const queriesBefore=phoneQueries;
      assert.equal(await service.resolveReferralAttribution(code,{email:"different@example.invalid",phone:entered}),null,`existing phone: ${stored} / ${entered}`);
      assert.equal(phoneQueries,queriesBefore+1);
    }
  }
  storedPhone="00 44 (7700) 900-123";
  assert.equal(await service.resolveReferralAttribution(code,{email:"different@example.invalid",phone:"+447700900123"}),null);
  storedPhone="+34 611 222 334";
  assert.deepEqual(await service.resolveReferralAttribution(code,{email:"new@example.invalid",phone:"+34 611 222 333"}),{referredByPatientId:patient.id});
  storedPhone=null;
  const beforeNoPhone=phoneQueries;
  assert.deepEqual(await service.resolveReferralAttribution(code,{email:"new@example.invalid"}),{referredByPatientId:patient.id});
  assert.equal(phoneQueries,beforeNoPhone);
  patient.programType="PREVENTION";assert.deepEqual(await service.getPublicReferral(code),{valid:false});
  assert.equal(await service.resolveReferralAttribution(code,{email:"friend@example.invalid"}),null);patient.programType="CONSOLIDA";
  const sale={status:"paid",isReservation:false,programType:"RECUPERA",amountCents:10000,paidAt:new Date()};
  assert.equal(referralQualifyingSale([sale]),sale);
  for(const patch of [{status:"pending"},{status:"refunded"},{refundedAt:new Date()},{isReservation:true},{programType:"PREVENTION"},{amountCents:0},{paidAt:null}])assert.equal(referralQualifyingSale([{...sale,...patch}]),null);
  const route=await import("../app/api/patient-referrals/share/route");
  const result=await route.GET(new NextRequest("https://untrusted.invalid/api/patient-referrals/share?patientId=patient"));
  assert.equal(result.status,303);
  const target=new URL(result.headers.get("location")!);
  assert.equal(target.origin,"https://wa.me");assert.equal(target.searchParams.get("phone"),null);
  const message=target.searchParams.get("text")!;
  assert(message.includes("50 €"));assert(message.includes("https://app.fisiofitteam.com"+paths[0]));
  assert(!message.includes("untrusted.invalid"));assert(!message.includes(patient.email));assert(!message.includes(patient.phone));
  assert.equal(result.headers.get("referrer-policy"),"no-referrer");
  console.log("PASS: eligibility, own/scoped access, stable opaque code, public privacy, self/existing referrals with formatted phones, paid-program rewards and WhatsApp contact chooser.");
}
main().catch(e=>{console.error(e);process.exitCode=1;}).finally(()=>{(Module as any)._load=original;});
