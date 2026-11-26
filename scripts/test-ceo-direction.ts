import assert from "node:assert/strict";
import Module from "node:module";
import { NextRequest } from "next/server";
import { directionObservations, directionSettings, evaluateTargets, priorityCreate, priorityUpdate, viewerReportMetrics } from "../lib/ceo-direction-contract";
import { madridDay } from "../lib/grok-ceo-contract";

async function main() {
  const now=new Date(), reportDay=madridDay(now), reportId="grok-ceo-"+reportDay;
  const month={start:"2026-10-26T23:00:00Z",end:"2026-11-25T22:59:59Z",finance:{income:9000},leadsCreated:12,sales:{won:3,lost:3,closeRate:50},renewals:{renewed:2,lost:0,renewalRate:100}};
  const bank={status:"available",asOf:now.toISOString(),currency:"EUR",currentBalanceCents:600000,pendingExpenseCount:4,pendingExpenseCents:8000,forecastStatus:"provisional",forecast:[{days:30,balanceCents:500000}]};
  const report={id:reportId,periodType:"grok_daily",generatedAt:now,metrics:JSON.stringify({last30:month,banking:bank}),narrative:JSON.stringify({accionesRecomendadas:["Revisar conversión", "Analizar caja"]})};
  const values=directionObservations(bank,report,now);
  assert.equal(values.find(x=>x.key==="cash")?.value,6000);
  assert.equal(values.find(x=>x.key==="forecast30")?.quality,"provisional");
  assert.equal(evaluateTargets(values,[{key:"cash",minimum:7000}])[0].state,"below");
  assert.equal(evaluateTargets(values,[{key:"cash",minimum:6000}])[0].state,"met");
  assert.equal(evaluateTargets(directionObservations({...bank,status:"stale"},report,now),[{key:"cash",minimum:1}])[0].state,"unavailable");
  assert.equal(directionObservations(bank,{...report,generatedAt:new Date(now.getTime()-3*86400000)},now).find(x=>x.key==="closeRate30")?.quality,"stale");
  assert.equal(directionObservations(bank,{...report,metrics:JSON.stringify({last30:{...month,sales:{won:0,lost:0,closeRate:0}}})},now).find(x=>x.key==="closeRate30")?.value,null,"No resolved cohort is not a 0% rate");
  assert.equal(directionObservations({status:"unavailable"},null,now).find(x=>x.key==="cash")?.value,null);
  assert.equal(directionObservations({...bank,currentBalanceCents:0},report,now).find(x=>x.key==="cash")?.value,0);
  assert.equal(directionObservations(bank,{...report,metrics:JSON.stringify(month)},now).find(x=>x.key==="income30")?.value,null,"Never relabel legacy 7-day metrics as 30-day metrics");
  assert(!directionSettings.safeParse({version:0,targets:[{key:"closeRate30",minimum:101}]}).success);
  assert(!directionSettings.safeParse({version:0,targets:[{key:"cash",minimum:5},{key:"cash",minimum:5}]}).success);
  assert(!directionSettings.safeParse({version:0,targets:[{key:"leads30",minimum:1.5}]}).success);
  assert(!priorityCreate.safeParse({id:"12345678-1234-4234-9234-123456789001",reportId,actionIndex:0,dueDay:"2026-02-30"}).success);
  assert(!priorityUpdate.safeParse({requestId:"12345678-1234-4234-9234-123456789002",id:"12345678-1234-4234-9234-123456789001",version:0,status:"done",dueDay:null,resultNote:""}).success);
  assert.deepEqual(viewerReportMetrics({finance:{income:7},banking:bank},false),{finance:{income:7}});

  let state:Record<string,any[]>={ceoPriority:[],ceoPriorityEvent:[],ceoDirectionSettings:[],ceoReport:[report],teamNotification:[]};
  let current:any={id:"founder",role:"ceo"},seq=0;
  const matches=(r:any,w:any={}):boolean=>Object.entries(w).every(([k,v]:any)=>{
    if(v&&typeof v==="object"&&!(v instanceof Date))return (!v.in||v.in.includes(r[k]))&&(!v.notIn||!v.notIn.includes(r[k]));
    return v instanceof Date?r[k]?.getTime()===v.getTime():r[k]===v;
  });
  const db:any={professional:{findFirst:async()=>({id:"founder"})}};
  for(const name of Object.keys(state)) {
    const rows=(args:any={})=>{let a=state[name].filter(x=>matches(x,args.where));if(args.orderBy){const [k,v]=Object.entries(args.orderBy)[0];a=a.slice().sort((x,y)=>(x[k]<y[k]?-1:1)*(v==="desc"?-1:1));}a=a.slice(0,args.take||a.length);if(args.include?.events)return a.map(x=>({...x,events:state.ceoPriorityEvent.filter(e=>e.priorityId===x.id).slice().reverse()}));return a;};
    const assign=(r:any,data:any)=>{for(const [k,v] of Object.entries(data)){r[k]=v&&typeof v==="object"&&"increment" in v?r[k]+(v as any).increment:v;}r.updatedAt=new Date();};
    db[name]={findUnique:async({where}:any)=>state[name].find(r=>matches(r,where))||null,findFirst:async(args:any)=>rows(args)[0]||null,findMany:async(args:any)=>rows(args),
      create:async({data}:any)=>{const r={id:"id"+(++seq),createdAt:new Date(),updatedAt:new Date(),version:0,status:"planned",resultNote:"",outcomeJson:null,closedAt:null,targetsJson:"[]",...data};state[name].push(r);return r;},
      updateMany:async({where,data}:any)=>{const a=state[name].filter(r=>matches(r,where));a.forEach(r=>assign(r,data));return {count:a.length};},
      groupBy:async({where}:any)=>{const a=rows({where});return [...new Set(a.map(x=>x.status))].map(status=>({status,_count:a.filter(x=>x.status===status).length}));},
    };
    db[name].upsert=async({where,create,update}:any)=>{const existing=state[name].find(r=>matches(r,where));if(existing){assign(existing,update);return existing;}return db[name].create({data:create});};
  }
  let queue=Promise.resolve();db.$transaction=(fn:any)=>{const run=queue.then(async()=>{const before=structuredClone(state);try{return await fn(db);}catch(e){state=before;throw e;}});queue=run.catch(()=>{});return run;};
  const original=(Module as any)._load;
  (Module as any)._load=function(id:string,...args:any[]){
    if(id.endsWith("/lib/prisma"))return {prisma:db};
    if(id.endsWith("/lib/session"))return {getActiveProfessional:async()=>current};
    if(id.endsWith("/lib/bank-finance"))return {bankAggregate:async()=>bank};
    if(id.endsWith("/lib/grok-ceo"))return {collectGrokPeriod:async()=>month};
    return original.call(this,id,...args);
  };
  process.env.GROK_CEO_FOUNDER_ID="founder";
  const route=await import("../app/api/ceo/direction/route");
  const service=await import("../lib/ceo-direction");
  const request=(method:string,data?:unknown,origin="https://app.fisiofitteam.com")=>new NextRequest("https://app.fisiofitteam.com/api/ceo/direction",{method,headers:{"Content-Type":"application/json",origin},...(data===undefined?{}:{body:JSON.stringify(data)})});
  const id="12345678-1234-4234-9234-123456789001";
  const create={id,reportId,actionIndex:0,dueDay:null};
  for(const user of [null,{id:"other",role:"ceo"},{id:"founder",role:"fisio"}]){current=user;assert.equal((await route.GET(request("GET"))).status,403);assert.equal((await route.POST(request("POST",create))).status,403);}
  current={id:"founder",role:"ceo"};
  assert.equal((await route.POST(request("POST",create,"https://other.example"))).status,403);
  assert.equal((await route.POST(request("POST",{...create,title:"Forged"}))).status,400);
  assert.equal((await route.POST(request("POST",create))).status,200);
  assert.equal((await (await route.POST(request("POST",create))).json()).duplicate,true);
  assert.equal((await route.POST(request("POST",{...create,dueDay:"2026-12-01"}))).status,409);
  assert.equal((await route.POST(request("POST",{...create,id:"12345678-1234-4234-9234-123456789099"}))).status,200);
  assert.equal(state.ceoPriority.length,1);assert.equal(state.ceoPriorityEvent.length,1);assert.equal(state.ceoPriority[0].title,"Revisar conversión");
  const baseline=state.ceoPriority[0].baselineJson;
  const change={id,requestId:"12345678-1234-4234-9234-123456789002",version:0,status:"in_progress",dueDay:"2026-12-01",resultNote:"private-note"};
  assert.equal((await route.PATCH(request("PATCH",change))).status,200);
  assert.equal((await (await route.PATCH(request("PATCH",change))).json()).duplicate,true);
  assert.equal((await route.PATCH(request("PATCH",{...change,resultNote:"different"}))).status,409);
  const done={...change,requestId:"12345678-1234-4234-9234-123456789003",version:1,status:"done",resultNote:"private-result"};
  const race=await Promise.all([route.PATCH(request("PATCH",done)),route.PATCH(request("PATCH",{...done,requestId:"12345678-1234-4234-9234-123456789004",status:"discarded"}))]);
  assert.deepEqual(race.map(r=>r.status).sort(),[200,409]);
  assert.equal(state.ceoPriority.length,1);assert.equal(state.ceoPriorityEvent.length,3);
  assert.equal(state.ceoPriority[0].baselineJson,baseline);assert(state.ceoPriority[0].outcomeJson);assert.equal(state.ceoPriority[0].version,2);
  assert.equal((await route.PATCH(request("PATCH",{...done,version:2,requestId:"12345678-1234-4234-9234-123456789005",status:"blocked",resultNote:"private-note-reopened"}))).status,200);
  assert.equal(state.ceoPriority[0].outcomeJson,null);assert.equal(state.ceoPriorityEvent.length,4);assert(state.ceoPriorityEvent[2].detailJson.includes("private-result"));
  const settings={version:0,targets:[{key:"cash",minimum:7000}]};
  assert.equal((await route.PUT(request("PUT",settings))).status,200);
  assert.equal((await route.PUT(request("PUT",{...settings,targets:[]}))).status,409);
  assert.equal((await route.GET(request("GET"))).status,200);
  const overview=await service.directionOverview("founder");assert.equal(overview.priorities.length,1);assert.equal(overview.targetStates[0].state,"below");
  const aggregate=JSON.stringify(await service.directionAggregate());for(const forbidden of ["private-note","private-result","Revisar conversión","baselineJson","founderId"])assert(!aggregate.includes(forbidden));
  assert.equal(state.teamNotification.length,0,"Tracking does not send messages or delegate actions");

  // New report snapshots are server-owned and never trusted from Grok's request.
  const reportRoute=await import("../app/api/integrations/grok-ceo/report/route");
  state.ceoReport=[];process.env.GROK_CEO_WRITE_TOKEN="synthetic-test-token-".repeat(3);
  const payload={reportDay,resumenEjecutivo:"Resumen sintético",luces:[],sombras:[],accionesRecomendadas:["Revisar conversión"],alertas:[],tendencias:[],seguimiento:[],decisionesFounder:[]};
  const publish=(body:unknown)=>new NextRequest("https://app.fisiofitteam.com/api/integrations/grok-ceo/report",{method:"POST",headers:{"Content-Type":"application/json",authorization:"Bearer "+process.env.GROK_CEO_WRITE_TOKEN},body:JSON.stringify(body)});
  assert.equal((await reportRoute.POST(publish({...payload,banking:{currentBalanceCents:999999}}))).status,400);
  assert.equal((await reportRoute.POST(publish(payload))).status,201);
  assert.equal(JSON.parse(state.ceoReport[0].metrics).banking.currentBalanceCents,600000);
  assert.equal((await reportRoute.POST(publish(payload))).status,200);assert.equal(state.teamNotification.length,1);
  const latest=await import("../app/api/ceo/grok-latest/route");
  current={id:"other",role:"ceo"};assert.equal((await (await latest.GET()).json()).report.metrics.banking,undefined);
  current={id:"founder",role:"ceo"};assert.equal((await (await latest.GET()).json()).report.metrics.banking.currentBalanceCents,600000);
  console.log("CEO direction: founder isolation, objective quality, source-bound priorities, retries, concurrent review, immutable memory, private aggregates and bank report snapshots OK");
}
main().catch(e=>{console.error(e);process.exitCode=1;});
