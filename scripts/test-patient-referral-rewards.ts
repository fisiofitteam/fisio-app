// Offline reward ledger tests. No database, payment provider or messages.
import assert from "node:assert/strict";
import Module from "node:module";
import { NextRequest } from "next/server";

let actor:any={id:"ceo",role:"ceo",extraRoles:[]};
let lead:any,duplicate=false,writes=0,transactions=0,failConflict=false,identityQuery:any;
const fresh=()=>({
  id:"lead",fullName:"Synthetic friend",referredByPatientId:"referrer",convertedPatientId:"new-client",
  email:"friend@example.invalid",contactType:"phone",contactValue:"+34600000000",
  referralRewardPaidAt:null,referralRewardPaidById:null,status:"won",
  referredByPatient:{id:"referrer",isTest:false},
  convertedPatient:{id:"new-client",email:"friend@example.invalid",isTest:false},
  sales:[{status:"paid",isReservation:false,programType:"RECUPERA",amountCents:100000,paidAt:new Date("2026-11-19T08:00:00Z"),refundedAt:null,patientId:"new-client"}],
});
lead=fresh();
const db:any={
  lead:{
    findUnique:async({where}:any)=>where.id===lead?.id?lead:null,
    findFirst:async({where}:any)=>{identityQuery=where;return duplicate?{id:"other-lead"}:null;},
    update:async({where,data}:any)=>{assert.equal(where.id,"lead");writes++;Object.assign(lead,data);return lead;},
  },
  $transaction:async(fn:any,options:any)=>{transactions++;assert.equal(options.isolationLevel,"Serializable");if(failConflict)throw {code:"P2034"};return fn(db);},
};
const originalLoad=(Module as any)._load;
(Module as any)._load=function(id:string,...args:any[]){
  if(/\/lib\/prisma(?:\.ts)?$/.test(id))return {prisma:db};
  if(/\/lib\/session(?:\.ts)?$/.test(id))return {getActiveProfessional:async()=>actor};
  if(/\/lib\/auth(?:\.ts)?$/.test(id))return {hasRole:(user:any,role:string)=>user.role===role||user.extraRoles.includes(role)};
  return originalLoad.call(this,id,...args);
};
async function main(){
  const {updateReferralReward,ReferralRewardError}=await import("../lib/patient-referral-rewards");
  const {PATCH}=await import("../app/api/patient-referrals/rewards/[leadId]/route");
  const {itemsForRoles}=await import("../lib/sidebar-items");
  const denied=(status:number)=>(error:any)=>error instanceof ReferralRewardError&&error.status===status;
  const reset=()=>{lead=fresh();duplicate=false;writes=0;actor={id:"ceo",role:"ceo",extraRoles:[]};};
  actor=null;await assert.rejects(updateReferralReward("lead","mark_delivered",null),denied(403));
  actor={id:"closer",role:"closer",extraRoles:[]};await assert.rejects(updateReferralReward("lead","mark_delivered",null),denied(403));
  reset();lead.referredByPatientId=null;await assert.rejects(updateReferralReward("lead","mark_delivered",null),denied(404));
  for(const invalid of [
    {status:"pending"}, {isReservation:true}, {refundedAt:new Date()}, {status:"refunded"},
    {amountCents:0}, {paidAt:null}, {programType:"PREVENTION"},
  ]){
    reset();Object.assign(lead.sales[0],invalid);await assert.rejects(updateReferralReward("lead","mark_delivered",null),denied(409));assert.equal(writes,0);
  }
  reset();lead.sales=[];await assert.rejects(updateReferralReward("lead","mark_delivered",null),denied(409),"manual won without paid sale is not proof");
  reset();lead.referredByPatient.isTest=true;await assert.rejects(updateReferralReward("lead","mark_delivered",null),denied(409));
  reset();lead.convertedPatient.isTest=true;await assert.rejects(updateReferralReward("lead","mark_delivered",null),denied(409));
  reset();lead.convertedPatientId="referrer";await assert.rejects(updateReferralReward("lead","mark_delivered",null),denied(409));
  reset();duplicate=true;await assert.rejects(updateReferralReward("lead","mark_delivered",null),denied(409));assert.equal(writes,0);
  assert.deepEqual(identityQuery.id,{not:"lead"});
  assert.deepEqual(identityQuery.referralRewardPaidAt,{not:null});
  assert(identityQuery.OR.some((x:any)=>x.convertedPatientId?.in.includes("new-client")));
  assert(identityQuery.OR.some((x:any)=>x.email?.equals==="friend@example.invalid"));
  reset();actor={id:"combined",role:"fisio",extraRoles:["ceo"]};
  const marked=await updateReferralReward("lead","mark_delivered",null);assert(marked.paidAt);assert.equal(writes,1);assert.equal(lead.referralRewardPaidById,"combined");
  const again=await updateReferralReward("lead","mark_delivered",null);assert.deepEqual(again,marked);assert.equal(writes,1);
  await assert.rejects(updateReferralReward("lead","undo","2026-01-01T00:00:00Z"),denied(409));
  assert.deepEqual(await updateReferralReward("lead","undo",marked.paidAt),{paidAt:null});assert.equal(writes,2);assert.equal(lead.referralRewardPaidById,null);
  assert.deepEqual(await updateReferralReward("lead","undo",marked.paidAt),{paidAt:null});assert.equal(writes,2);
  await assert.rejects(updateReferralReward("lead","undo","bad-date"),denied(400));
  assert(itemsForRoles("ceo",[],{withResumenes:false}).some(x=>x.id==="referidos"));
  assert(itemsForRoles("fisio",["ceo"],{withResumenes:false}).some(x=>x.id==="referidos"));
  assert(!itemsForRoles("closer",[],{withResumenes:false}).some(x=>x.id==="referidos"));
  assert(!itemsForRoles("setter",[],{withResumenes:false}).some(x=>x.id==="referidos"));
  const request=(body:unknown,origin="https://app.invalid")=>new NextRequest("https://app.invalid/api/patient-referrals/rewards/lead",{method:"PATCH",headers:{"Content-Type":"application/json",Origin:origin},body:JSON.stringify(body)});
  reset();
  assert.equal((await PATCH(request({action:"mark_delivered",expectedPaidAt:null},"https://attacker.invalid"),{params:{leadId:"lead"}})).status,403);
  assert.equal((await PATCH(request({action:"mark_delivered"}),{params:{leadId:"lead"}})).status,400);
  assert.equal((await PATCH(request({action:"mark_delivered",expectedPaidAt:null,amount:5000}),{params:{leadId:"lead"}})).status,400);
  assert.equal(writes,0);
  const response=await PATCH(request({action:"mark_delivered",expectedPaidAt:null}),{params:{leadId:"lead"}});
  assert.equal(response.status,200);assert.equal(response.headers.get("Cache-Control"),"private, no-store");assert((await response.json()).paidAt);
  reset();failConflict=true;
  assert.equal((await PATCH(request({action:"mark_delivered",expectedPaidAt:null}),{params:{leadId:"lead"}})).status,409);failConflict=false;
  assert(transactions>0);
  console.log("PASS: CEO and extra-role access, referral ledger only, paid programme guards, no reservation/refund/test rewards, duplicate identity, serializable conflict, idempotent mark/undo and origin checks.");
}
main().catch(error=>{console.error(error);process.exitCode=1;}).finally(()=>{(Module as any)._load=originalLoad;});
