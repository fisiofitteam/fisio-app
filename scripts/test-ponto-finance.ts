import assert from "node:assert/strict";
import Module from "node:module";
import { NextRequest } from "next/server";
import { PontoClient, PontoError, pontoConfiguration } from "../lib/ponto-client";
import { classifyMovement, detectSubscriptions, matchStripePayout, cents } from "../lib/bank-finance-contract";

async function main(){
  let scope="ai",externalNext=false,invalidDate=false,calls:{url:string;method:string}[]=[];
  const request:typeof fetch=async(input,init)=>{
    const url=String(input);calls.push({url,method:init?.method||"GET"});
    if(url.endsWith("/oauth2/token"))return Response.json({access_token:"TEST_ONLY_TOKEN",scope,token_type:"bearer"});
    if(url.includes("/transactions"))return Response.json({data:[{id:"t1",type:"transaction",attributes:{amount:-20,currency:"EUR",executionDate:invalidDate?"invalid":"2026-10-01T12:00:00Z",description:"OpenAI"}}],links:externalNext?{next:"https://evil.example/accounts/a/transactions"}:{}});
    return Response.json({data:{id:"a",type:"account",attributes:{currency:"EUR",currentBalance:300}}});
  };
  const client=new PontoClient("test","test",request);
  assert.equal((await client.account("a")).attributes.currentBalance,300);
  assert.equal((await client.transactions("a")).rows.length,1);
  assert.equal(calls.filter(c=>c.method==="POST").length,1);
  assert(calls.every(c=>c.method==="GET"||c.url==="https://api.myponto.com/oauth2/token"));
  externalNext=true;await assert.rejects(client.transactions("a"),/pagination_incomplete/);assert(!calls.some(c=>c.url.includes("evil")));externalNext=false;
  for(scope of ["ai pi","pi","","ai unknown"])await assert.rejects(new PontoClient("test","test",request).account("a"),/ais_only_required/);
  scope="ai";await assert.rejects(client.account("../../payments"));
  delete process.env.PONTO_CLIENT_ID;delete process.env.PONTO_CLIENT_SECRET;delete process.env.PONTO_ACCOUNT_IDS;
  assert.equal(pontoConfiguration().ready,false);
  assert.equal(cents(10.29),1029);assert.throws(()=>cents(Infinity));
  assert.equal(classifyMovement("CaixaBank","CUOTA HIPOTECA",-20300,[]).personal,true);
  assert.equal(classifyMovement("Vercel","Servicio",-20300,[]).personal,false);
  assert.equal(classifyMovement("CaixaBank","CUOTA HIPOTECA",-20299,[]).personal,false);
  assert.equal(classifyMovement("OPENAI *123","Pago tarjeta",-2000,[]).category,"software");
  assert.equal(classifyMovement("Vercel","",-20300,[{id:"r",merchantKey:"vercel",amountCents:20300,category:"otros",personal:true,enabled:true}]).personal,true);
  const recurrence=["2026-09-01","2026-10-01","2026-11-01"].map(d=>({merchantKey:"vercel",merchant:"Vercel",amountCents:-2000,occurredAt:new Date(d),personal:false,conflict:false}));
  assert.equal(detectSubscriptions(recurrence,new Date("2026-11-26")).length,1);
  assert.equal(detectSubscriptions(recurrence.slice(1),new Date("2026-11-26")).length,0);
  assert.equal(detectSubscriptions(recurrence.map(r=>({...r,personal:true})),new Date("2026-11-26")).length,0);
  const payout={id:"po_1",amount:10000,currency:"eur",status:"paid",arrival_date:Date.parse("2026-11-25")/1000};
  const credit={amountCents:10000,currency:"EUR",occurredAt:new Date("2026-11-26"),description:"Abono Stripe"};
  assert.equal(matchStripePayout(credit,[payout],new Set()),"po_1");
  assert.equal(matchStripePayout(credit,[payout,{...payout,id:"po_2"}],new Set()),null);
  assert.equal(matchStripePayout(credit,[payout],new Set(["po_1"])),null);
  assert.equal(matchStripePayout({...credit,description:"Otro"},[payout],new Set()),null);

  // Exercise production import/review handlers with synthetic records only.
  let state:Record<string,any[]>={bankMovement:[],businessExpenseCandidate:[],transaction:[],bankClassificationRule:[],bankSyncState:[],pontoBankAccount:[]};
  let seq=0,current:any={id:"founder",role:"ceo"};
  const matches=(r:any,w:any={}):boolean=>Object.entries(w).every(([k,v]:any)=>{
    if(k==="OR")return v.some((x:any)=>matches(r,x));
    if(k==="accountId_externalId"||k==="source_sourceRef")return matches(r,v);
    if(v&&typeof v==="object"&&!(v instanceof Date))return (!('not' in v)||r[k]!==v.not)&&(!v.in||v.in.includes(r[k]))&&(!v.notIn||!v.notIn.includes(r[k]))&&(!('gte' in v)||r[k]>=v.gte)&&(!('gt' in v)||r[k]>v.gt)&&(!('lt' in v)||r[k]<v.lt);
    return v instanceof Date?r[k]?.getTime()===v.getTime():r[k]===v;
  });
  const db:any={};
  for(const name of Object.keys(state)){
    const rows=(args:any={})=>{let a=state[name].filter(r=>matches(r,args.where));if(args.orderBy){const [k,v]=Object.entries(args.orderBy)[0];a=a.sort((x,y)=>(x[k]<y[k]?-1:1)*(v==="desc"?-1:1));}return a.slice(0,args.take||a.length);};
    db[name]={findUnique:async({where}:any)=>state[name].find(r=>matches(r,where))||null,findMany:async(args:any)=>rows(args),count:async(args:any)=>rows(args).length,
      create:async({data}:any)=>{const r={id:"id"+(++seq),createdAt:new Date(),status:"pending",personal:false,conflict:false,candidateId:null,stripePayoutId:null,reviewedAt:null,...data};state[name].push(r);return r;},
      update:async({where,data}:any)=>{const r=state[name].find(r=>matches(r,where));if(!r)throw new Error("missing");Object.assign(r,data);return r;},
      updateMany:async({where,data}:any)=>{const a=state[name].filter(r=>matches(r,where));a.forEach(r=>Object.assign(r,data));return {count:a.length};},
      aggregate:async(args:any)=>({_count:rows(args).length,_sum:{amountCents:rows(args).reduce((s,r)=>s+r.amountCents,0)}})};
    db[name].upsert=async({where,create,update}:any)=>await db[name].findUnique({where})?db[name].update({where,data:update}):db[name].create({data:create});
  }
  let queue=Promise.resolve();db.$transaction=(fn:any)=>{const run=queue.then(async()=>{const before=structuredClone(state);try{return await fn(db);}catch(e){state=before;throw e;}});queue=run.catch(()=>{});return run;};
  const original=(Module as any)._load;
  (Module as any)._load=function(id:string,...args:any[]){
    if(id.endsWith("/lib/prisma"))return {prisma:db};
    if(id.endsWith("/lib/stripe"))return {stripe:null};
    if(id.endsWith("/lib/session"))return {getActiveProfessional:async()=>current};
    return original.call(this,id,...args);
  };
  process.env.GROK_CEO_FOUNDER_ID="founder";
  const service=await import("../lib/bank-finance");
  const review=await import("../app/api/ceo/expense-candidates/route");
  const bankRoute=await import("../app/api/ceo/bank/route");
  const cron=await import("../app/api/cron/ponto-sync/route");
  const tx=(id:string,amount:number,description:string,date="2026-10-01T12:00:00Z")=>({id,type:"transaction" as const,attributes:{amount,currency:"EUR",executionDate:date,description}});
  const fixtures=[tx("t1",-20,"OpenAI"),tx("t2",-203,"Cuota hipoteca"),tx("t3",1000,"Stripe"),tx("t4",-5,"Compra")];
  await db.$transaction((t:any)=>service.importBankRows(t,"a",fixtures,[]));
  await db.$transaction((t:any)=>service.importBankRows(t,"a",fixtures,[]));
  assert.equal(state.bankMovement.length,4);assert.equal(state.businessExpenseCandidate.length,2);assert.equal(state.transaction.length,0);
  const candidate=state.businessExpenseCandidate[0];
  const patch=(id:string,extra:any={})=>new NextRequest("https://app.fisiofitteam.com/api/ceo/expense-candidates",{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({id,action:"approve",category:"software",...extra})});
  current={id:"other",role:"ceo"};assert.equal((await review.PATCH(patch(candidate.id))).status,403);assert.equal((await bankRoute.GET()).status,403);
  current={id:"founder",role:"fisio"};assert.equal((await bankRoute.GET()).status,403);
  current={id:"founder",role:"ceo"};
  const approvals=await Promise.all([review.PATCH(patch(candidate.id)),review.PATCH(patch(candidate.id))]);assert(approvals.every(r=>r.status===200));assert.equal(state.transaction.length,1);
  await assert.rejects(service.classifyBankMovement({id:state.bankMovement[0].id,category:"otros",personal:true,remember:false,exactAmount:true},"founder"),/contabilizado/);
  const other=state.bankMovement.find(r=>r.externalId==="t4");
  await service.classifyBankMovement({id:other.id,category:"otros",personal:true,remember:true,exactAmount:true},"founder");assert.equal(state.businessExpenseCandidate[1].status,"rejected");assert.equal(state.bankClassificationRule.length,1);assert.equal(state.transaction.length,1);
  await service.classifyBankMovement({id:other.id,category:"otros",personal:false,remember:false,exactAmount:true},"founder");
  await db.$transaction((t:any)=>service.importBankRows(t,"a",[tx("t4",-7,"Compra")],[]));assert.equal(other.conflict,true);assert.equal((await review.PATCH(patch(other.candidateId))).status,409);
  const before=state.bankMovement.length;await assert.rejects(db.$transaction((t:any)=>service.importBankRows(t,"a",[tx("bad",-2,"Bad","invalid")],[])));assert.equal(state.bankMovement.length,before);
  assert.equal((await cron.GET(new NextRequest("https://app.fisiofitteam.com/api/cron/ponto-sync"))).status,401);
  process.env.PONTO_CLIENT_ID="test";process.env.PONTO_CLIENT_SECRET="test";process.env.PONTO_ACCOUNT_IDS="a";
  state.pontoBankAccount.push({id:"a",active:true,currency:"EUR",currentBalanceCents:100000,balanceAt:new Date(),authorizationExpiresAt:new Date(Date.now()+86400000)});
  const aggregate=await service.bankAggregate();
  const output=JSON.stringify(aggregate);for(const forbidden of ["merchant","externalId","maskedReference","accountId","Cuota hipoteca","OpenAI","PONTO_CLIENT_SECRET"])assert(!output.includes(forbidden));
  assert.equal(aggregate.currentBalanceCents,100000);
  assert.equal(aggregate.forecastStatus,"insufficient_data","Unresolved bank conflict blocks projections");
  const source=state.bankMovement.find(r=>r.externalId==="t4");
  source.conflict=false;
  await db.$transaction((t:any)=>service.importBankRows(t,"a",[tx("t5",-5,"Compra")],[]));
  const duplicate=state.bankMovement.find(r=>r.externalId==="t5");
  await service.reviewBankDuplicate(duplicate.id,source.id,"founder");
  assert.equal(state.bankMovement.find(r=>r.id===duplicate.id).duplicateOfId,source.id);
  assert.equal(state.businessExpenseCandidate.find(r=>r.id===duplicate.candidateId).status,"rejected");
  await service.reviewBankDuplicate(duplicate.id,null,"founder");
  assert.equal(state.bankMovement.find(r=>r.id===duplicate.id).duplicateOfId,null);
  assert.equal(state.businessExpenseCandidate.find(r=>r.id===duplicate.candidateId).status,"pending");
  await assert.rejects(service.reviewBankDuplicate(duplicate.id,state.bankMovement[0].id,"founder"));
  state.pontoBankAccount[0].balanceAt=new Date("2026-01-01");
  assert.equal((await service.bankAggregate()).currentBalanceCents,null,"Stale balance must not become zero");
  console.log("Ponto AIS, pagination, rules, recurrence, Stripe matching, idempotency, founder auth, review and aggregate isolation: OK");
}
main().catch(e=>{console.error(e);process.exitCode=1;});
