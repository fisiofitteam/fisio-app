const fs=require('fs'),path=require('path'),vm=require('vm'),ts=require('typescript'),assert=require('node:assert/strict');
const {NextRequest}=require('next/server');
function loader(mocks={},globals={}) { const cache={}; function load(file){file=path.resolve(file);if(cache[file])return cache[file].exports;const m={exports:{}};cache[file]=m;vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{module:m,exports:m.exports,require:id=>{if(id in mocks)return mocks[id];if(id.startsWith('@/'))return load(id.slice(2)+'.ts');if(id.startsWith('.'))return load(path.resolve(path.dirname(file),id)+'.ts');return require(id)},Date,URL,AbortSignal,setTimeout,clearTimeout,console,process,...globals},{filename:file});return m.exports}return load; }
const rules=loader()('lib/skalex/insights.ts');
const lead={id:'lead-fixture',phone:'+34 600 111 222',instagram:'@fixture',contactType:'phone',contactValue:'+34 600 111 222',status:'scheduled',closerId:'closer-a'};
let actor={id:'closer-a',role:'fisio',extraRoles:['closer']}, row=null, calls=[], waitForProvider=null, release;
const ready={available:true,generatedAt:'2026-11-25T09:00:00Z',data:{situacion_actual:'Dolor al entrenar',tratamientos_previos:['Reposo','Fisioterapia'],objetivos:'Volver a entrenar',campo_nuevo:{detalle:'Se conserva'},interes:0,acepta:false}};
let provider=[{conversationId:'fixture-conversation',customerContactPhone:'34600111222',igUsername:'fixture',lastMessageAt:'2026-11-25T09:00:00Z',aiInsights:ready}];
const prisma={
 lead:{findUnique:async()=>lead,findMany:async()=>[lead]},
 skalexCallInsight:{
  findUnique:async()=>row&&{...row},findMany:async()=>row?[{...row}]:[],
  create:async({data})=>{if(row)throw Object.assign(Error('unique'),{code:'P2002'});row={...data,payload:null,leaseToken:null,leaseUntil:null};return {...row}},
  updateMany:async({where,data})=>{if(!row||row.leadId!==where.leadId)return{count:0};if(where.leaseToken&&row.leaseToken!==where.leaseToken)return{count:0};if(where.identityKey&&where.identityKey!==row.identityKey)return{count:0};if(where.OR&&row.leaseUntil&&row.leaseUntil>new Date())return{count:0};Object.assign(row,data);return{count:1}},
 }
};
const client={skalexCredentials:()=>({apiKey:'fixture'}),SkalexError:class extends Error{},findByPhone:async phone=>{calls.push(['phone',phone]);if(waitForProvider)await waitForProvider;return provider},findByIgUsername:async ig=>{calls.push(['instagram',ig]);return provider}};
const load=loader({'@/lib/prisma':{prisma},'./client':client,'@/lib/session':{getActiveProfessional:async()=>actor}}), service=load('lib/skalex/call-context.ts'),route=load('app/api/leads/[id]/skalex-insights/route.ts');
const request=(origin='https://app.test')=>new NextRequest('https://app.test/api/leads/lead-fixture/skalex-insights',{method:'POST',headers:{origin}});
(async()=>{
 assert.equal(rules.normalizeInstagram('https://www.instagram.com/Fixture/?x=1'),'fixture');assert.equal(rules.normalizePhone('0034 (600) 111-222'),'34600111222');assert.equal(rules.normalizePhone('123'),null);
 const parsed=rules.parseProviderInsights(ready);assert.equal(parsed.status,'ready');assert.equal(parsed.fields.length,6);assert(parsed.fields.some(f=>f.label==='Qué ha probado'&&f.value.includes('Fisioterapia')));assert(parsed.fields.some(f=>f.value==='0'));assert(parsed.fields.some(f=>f.value==='No'));assert(parsed.fields.some(f=>f.label==='Campo nuevo'&&f.value.includes('Se conserva')));
 assert.equal(rules.parseProviderInsights({available:true,data:{empty:null}}).status,'unavailable');assert.equal(rules.parseProviderInsights(null).reason,'invalid_response');
 const missing=rules.parseProviderInsights({available:false,reason:'not_enough_messages',customerMessages:3,requiredMessages:6});assert.match(missing.message,/3 de 6/);assert.equal(missing.fields.length,0);
 for(const reason of ['generating','daily_limit_reached','generation_failed','not_requested','disabled'])assert.equal(rules.parseProviderInsights({available:false,reason}).reason,reason);
 assert.equal(service.canReadCallContext(actor,lead),true);assert.equal(service.canReadCallContext({...actor,id:'closer-b'},lead),false);assert.equal(service.canReadCallContext({id:'setter',role:'setter'},lead),true);assert.equal(service.canReadCallContext({id:'fisio',role:'fisio'},lead),false);
 // Reject foreign origins and other closers before any upstream query or cache mutation.
 assert.equal((await route.POST(request('https://evil.test'),{params:{id:lead.id}})).status,403);
 actor=null;assert.equal((await route.POST(request(),{params:{id:lead.id}})).status,401);
 actor={id:'closer-b',role:'closer'};assert.equal((await route.POST(request(),{params:{id:lead.id}})).status,404);assert.equal(calls.length,0);assert.equal(row,null);
 actor={id:'closer-a',role:'fisio',extraRoles:['closer']};
 waitForProvider=new Promise(resolve=>{release=resolve});
 const first=service.ensureCallContext(lead);while(!calls.length)await new Promise(r=>setTimeout(r,1));
 const concurrent=await service.ensureCallContext(lead);assert.equal(concurrent.reason,'generating');assert.equal(calls.length,1);
 release();await first;waitForProvider=null;
 const response=await route.POST(request(),{params:{id:lead.id}});assert.equal(response.status,200);assert.equal(response.headers.get('cache-control'),'private, no-store');assert.equal((await response.json()).context.status,'ready');assert.equal(calls.length,1,'ready summaries should not regenerate');
 assert.equal((await service.cachedCallContexts([{...lead,phone:'34999999999'}]))[lead.id],undefined,'identity changes must not display the previous person');
 // Unavailable responses are explicit and cached with backoff.
 row=null;calls=[];provider=[{...provider[0],aiInsights:{available:false,reason:'not_enough_messages',customerMessages:2,requiredMessages:6}}];
 assert.equal((await service.ensureCallContext(lead)).reason,'not_enough_messages');await service.ensureCallContext(lead);assert.equal(calls.length,1);
 // A returned conversation must match the exact identifier, never a similar name.
 row=null;calls=[];provider=[{...provider[0],customerContactPhone:'34999999999',igUsername:'other',aiInsights:ready}];
 assert.equal((await service.ensureCallContext(lead)).reason,'not_found');assert.equal(calls.length,2);
 // Booked lead with no phone result falls back to exact Instagram.
 row=null;calls=[];provider=[{...provider[0],customerContactPhone:null,igUsername:'fixture',aiInsights:ready}];assert.equal((await service.ensureCallContext(lead)).status,'ready');assert.equal(calls[1][0],'instagram');
 row=null;calls=[];await service.ensureCallContext({...lead,status:'won'});assert.equal(calls.length,0);assert.equal(row,null);
 // HTTP timeout, no-cache and opaque multi-page bulk cursors; no detail request in bulk.
 const httpCalls=[],signals=[];let pages=0;
 const http=loader({}, {AbortSignal:{timeout:ms=>{signals.push(ms);return undefined}},fetch:async(url,init)=>{httpCalls.push({url,init});return {ok:true,status:200,text:async()=>JSON.stringify({conversations:[{conversationId:String(++pages)}],nextCursor:pages===1?'opaque+cursor':null})}}})('lib/skalex/client.ts');
 const old=process.env.SKALEX_API_KEY;process.env.SKALEX_API_KEY='fixture-secret';
 try {const result=await http.findStartedOnDate('2026-11-25','+01:00');assert.equal(result.length,2);assert.equal(new URL(httpCalls[1].url).searchParams.get('cursor'),'opaque+cursor');assert(signals.every(v=>v===35000));assert(httpCalls.every(c=>c.init.cache==='no-store'&&new URL(c.url).pathname.endsWith('/started')));}finally{if(old)process.env.SKALEX_API_KEY=old;else delete process.env.SKALEX_API_KEY;}
 // Bulk updates keep previously linked CRM identities, and use captured contact phones.
 let storedUpdate;
 const syncDb={skalexConversation:{findUnique:async()=>({id:'local'}),update:async({data})=>{storedUpdate=data;return{id:'local'}}},skalexLabel:{deleteMany:async()=>{}},skalexSyncState:{findUnique:async()=>null,upsert:async()=>{},update:async()=>{}}};
 const sync=loader({'@/lib/prisma':{prisma:syncDb},'./client':{findActiveBetween:async()=>[{conversationId:'remote',platform:'instagram',customerPhone:null,customerContactPhone:'+34 600 111 222',igUsername:'fixture',createdAt:'2026-11-20T00:00:00Z',lastMessageAt:'2026-11-25T00:00:00Z'}]}})('lib/skalex/sync.ts');
 await sync.runActivitySync();assert(!('leadId' in storedUpdate));assert(!('patientId' in storedUpdate));assert.equal(storedUpdate.customerPhone,'34600111222');
 console.log('PASS: dynamic fields, missing answers, provider reasons, exact identities/fallback, booked-only generation, lease concurrency, cached results/backoff, changed identity invalidation, secondary-closer scope, no-store/CSRF/auth, 35s timeout, bulk pagination and preserved CRM links.');
})().catch(error=>{console.error(error);process.exitCode=1});
