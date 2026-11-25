const fs=require('fs'),path=require('path'),vm=require('vm'),ts=require('typescript'),assert=require('node:assert/strict');
const {NextRequest}=require('next/server');
function loader(mocks={}){const cache={};function load(file){file=path.resolve(file);if(cache[file])return cache[file].exports;const m={exports:{}};cache[file]=m;vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{module:m,exports:m.exports,require:id=>{if(id in mocks)return mocks[id];if(id==='server-only')return{};if(id.startsWith('@/'))return load(id.slice(2)+'.ts');if(id.startsWith('.'))return load(path.resolve(path.dirname(file),id)+'.ts');return require(id)},Date,Intl,URL,Buffer,structuredClone,console,process,setTimeout,clearTimeout},{filename:file});return m.exports;}return load;}
const content=loader()('lib/metodo/content.ts'),events=loader()('lib/metodo/events.ts');
let config=structuredClone(content.DEFAULT_METODO),actor=null,writes=0;
const version='2026-11-25T10:00:00.000Z';
const prisma={landingConfig:{findUnique:async()=>({content:JSON.stringify(config),updatedAt:new Date(version)})},patientEvidence:{findMany:async({where,select})=>{assert(where.source.in.includes('general'));assert(!select.notes&&!select.textContent&&!select.patientId);return[{id:'evidence-fixture',updatedAt:new Date(version),url:'https://fixture.public.blob.vercel-storage.com/photo.jpg',kind:'image'}];}},successCase:{findMany:async()=>[]},metodoEvent:{upsert:async()=>{writes++;}},lead:{findUnique:async()=>({id:'lead-fixture',closerId:'closer-a'})}};
const load=loader({'@/lib/prisma':{prisma},'@/lib/session':{getActiveProfessional:async()=>actor},'@/lib/landing-config':{getAgendaGraciasCopy:async()=>({whatsappNumber:'+34 621495367'})}});
const server=load('lib/metodo/server.ts'),eventRoute=load('app/api/metodo/event/route.ts'),visitRoute=load('app/api/metodo/visit/route.ts'),adminRoute=load('app/api/metodo/admin/config/route.ts'),attribution=load('app/api/metodo/admin/attribution/route.ts'),contact=load('app/api/metodo/contact/route.ts');
const req=(pathname,data,origin='https://app.test',cookie='')=>new NextRequest('https://app.test'+pathname,{method:'POST',headers:{origin,'content-type':'application/json',cookie},body:JSON.stringify(data)});
(async()=>{
 assert.equal(content.normalizeMetodo(null).stories.length,0);assert.equal(content.normalizeMetodo(null).media.hero.url,'');assert.equal(config.sections.tools.visible,false);
 for(const url of ['javascript:alert(1)','https://evil.test/patient.jpg','https://fixture.public.blob.vercel-storage.com/x.svg','/api/patients/private','http://youtube.com/watch?v=abcdefghijk'])assert.equal(content.mediaUrl(url),'');
 assert.equal(content.youtubeId('https://youtu.be/abcdefghijk'),'abcdefghijk');assert.equal(content.mediaUrl('https://www.youtube.com/watch?v=abcdefghijk'), 'https://www.youtube.com/watch?v=abcdefghijk');
 assert.equal(content.toolUrl('/fisio/paciente/secret'),'');assert.equal(content.toolUrl('https://evil.test'),'');assert.equal(content.whatsappUrl('javascript:123','x'),'');
 const wa=new URL(content.whatsappUrl('34621495367','Hola & equipo','MF-ABCDEF123456'));assert.equal(wa.hostname,'wa.me');assert.equal(wa.searchParams.get('text'),'Hola & equipo\nReferencia: MF-ABCDEF123456');
 assert.equal(events.validEvent({sessionId:'a'.repeat(36),target:'page',type:'scroll',value:99}),null);assert.equal(events.validEvent({sessionId:'a'.repeat(36),target:'clinical-note',type:'diagnosis'}),null);
 const ranges=[];assert.equal(events.viewedProgress(ranges,0,90,100),0,'seeking does not count');for(let i=0;i<25;i++)events.viewedProgress(ranges,i,i+1,100);assert.equal(events.viewedProgress(ranges,0,1,100),25,'replays do not inflate');
 const source=server.sourceData({utm_source:'instagram',utm_campaign:'metodo',utm_term:'600111222',utm_content:'person@example.com',fbclid:'secret',referrer:'https://private.test'});assert.equal(JSON.stringify(source),JSON.stringify({utm_source:'instagram',utm_campaign:'metodo'}));
 const story={id:'story-fixture',sourceType:'evidence',sourceId:'evidence-fixture',sourceVersion:version,name:'Fixture',title:'Synthetic fixture',quote:'Fixture only',before:'Before',after:'After',zone:'Hombro',visible:true,authorized:true,authorizationNote:'PRIVATE consent record',authorizedAt:version,authorizedBy:'PRIVATE staff'};
 config.stories=[story];let pub=await server.getPublicMetodo();assert.equal(pub.stories.length,1);assert(!JSON.stringify(pub).includes('PRIVATE'));assert(!JSON.stringify(pub).includes('evidence-fixture'));assert(!('sourceId' in pub.stories[0]));
 config.stories[0].sourceVersion='2026-11-24T10:00:00.000Z';assert.equal((await server.getPublicMetodo()).stories.length,0,'modified source revoked');
 config.stories[0]={...story,authorized:false};assert.equal((await server.getPublicMetodo()).stories.length,0,'unapproved hidden');
 config.sections.founder.visible=false;config.sections.founder.body='PRIVATE draft';config.media.athlete.url='https://fixture.public.blob.vercel-storage.com/hidden.jpg';pub=await server.getPublicMetodo();assert(!JSON.stringify(pub).includes('PRIVATE draft'));assert.equal(pub.media.athlete.url,'');
 assert.equal((await visitRoute.POST(req('/api/metodo/visit',{consent:false}))).status,400);
 assert.equal((await visitRoute.POST(req('/api/metodo/visit',{},'https://evil.test'))).status,403);
 assert.equal((await eventRoute.POST(req('/api/metodo/event',{sessionId:'a'.repeat(36),target:'page',type:'scroll',value:25}))).status,403);assert.equal(writes,0,'no pre-consent event writes');
 assert.equal((await adminRoute.GET(new NextRequest('https://app.test/api/metodo/admin/config'))).status,401);
 actor={id:'fisio',role:'fisio',extraRoles:[]};assert.equal((await adminRoute.GET(new NextRequest('https://app.test/api/metodo/admin/config'))).status,403);
 actor={id:'closer-b',role:'fisio',extraRoles:['closer']};assert.equal((await attribution.POST(req('/api/metodo/admin/attribution',{leadId:'lead-fixture',reference:'MF-ABCDEF123456',messageReceived:true,evidence:'Received fixture'}))).status,404);
 actor={id:'closer-a',role:'closer',extraRoles:[]};assert.equal((await attribution.POST(req('/api/metodo/admin/attribution',{leadId:'lead-fixture',reference:'MF-ABCDEF123456',messageReceived:false,evidence:'Click only'}))).status,400);
 const redirect=await contact.HEAD(new NextRequest('https://app.test/api/metodo/contact'));assert.equal(redirect.status,302);assert(!redirect.headers.get('location').includes('Referencia'));assert.match(redirect.headers.get('cache-control'),/no-store/);
 const metrics=load('lib/metodo/metrics.ts');assert.equal(metrics.metricRange('2026-10-25','2026-10-25').end-metrics.metricRange('2026-10-25','2026-10-25').start,25*3600000,'Madrid DST');assert.throws(()=>metrics.metricRange('2026-02-31','2026-03-01'));
 assert.equal(writes,0);
 // Exercise a consented visit, deduplication, measured click and withdrawal with an isolated DB.
 let visitors=[],storedEvents=new Map(),references=[];
 const db={...prisma,$executeRaw:async()=>0,$executeRawUnsafe:async()=>0,metodoRateLimit:{upsert:async()=>({count:1})},
 metodoVisitor:{findUnique:async({where})=>visitors.find(v=>v.tokenHash===where.tokenHash)||null,create:async({data})=>{const v={...data,createdAt:new Date()};visitors.push(v);return v;},update:async()=>{},delete:async()=>{visitors=[];storedEvents.clear();}},
 metodoEvent:{upsert:async({where,create})=>{if(!storedEvents.has(where.id))storedEvents.set(where.id,create);}},
 metodoContact:{findFirst:async()=>references[0]||null,create:async({data})=>{references.push(data);return data;},deleteMany:async()=>{references=[];}},
 $transaction:async fn=>typeof fn==='function'?fn(db):Promise.all(fn)};
 const positive=loader({'@/lib/prisma':{prisma:db},'@/lib/session':{getActiveProfessional:async()=>null},'@/lib/landing-config':{getAgendaGraciasCopy:async()=>({whatsappNumber:'+34 621495367'})}});
 const vr=positive('app/api/metodo/visit/route.ts'),er=positive('app/api/metodo/event/route.ts'),cr=positive('app/api/metodo/contact/route.ts');
 const payload={consent:true,version:server.CONSENT_VERSION,sessionId:'12345678-1234-1234-1234-123456789abc',source:{utm_source:'instagram',utm_campaign:'fixture'}};
 const first=await vr.POST(req('/api/metodo/visit',payload));assert.equal(first.status,200);const cookie=first.headers.get('set-cookie').split(';')[0]+'; ff-metodo-consent=v1.accepted';assert.equal(visitors.length,1);assert.equal(storedEvents.size,1);
 assert.equal((await vr.POST(req('/api/metodo/visit',payload,'https://app.test',cookie))).status,200);assert.equal(storedEvents.size,1);assert.equal(visitors.length,1);
 const event={sessionId:payload.sessionId,type:'scroll',target:'page',value:25};await er.POST(req('/api/metodo/event',event,'https://app.test',cookie));await er.POST(req('/api/metodo/event',event,'https://app.test',cookie));assert.equal(storedEvents.size,2);
 const nav=()=>new NextRequest('https://app.test/api/metodo/contact?placement=hero',{headers:{cookie,'sec-fetch-site':'same-origin'}});const click=await cr.GET(nav());assert.equal(click.status,302);assert.equal(references.length,1);assert(!references[0].confirmedAt,'click never confirms conversation');assert(new URL(click.headers.get('location')).searchParams.get('text').includes(references[0].reference));await cr.GET(nav());assert.equal(references.length,1,'double navigation reuses reference');
 const withdrawal=await vr.DELETE(new NextRequest('https://app.test/api/metodo/visit',{method:'DELETE',headers:{origin:'https://app.test',cookie}}));assert.equal(withdrawal.status,200);assert.equal(visitors.length,0);assert.equal(storedEvents.size,0);assert.equal(references.length,0);
 const financeDb={...db,$queryRaw:async()=>[],metodoEvent:{groupBy:async()=>[]},metodoContact:{count:async()=>0,groupBy:async()=>[],findMany:async()=>[]},lead:{count:async()=>0},sale:{findMany:async()=>[]},patientInvoice:{findMany:async()=>[{totalAmount:150,transactionId:'missing-document',saleId:'fixture'}]},transaction:{aggregate:async()=>({_sum:{amount:null},_count:{_all:0}})}};
 financeDb.$transaction=async fn=>typeof fn==='function'?fn(financeDb):Promise.all(fn);
 const finance=loader({'@/lib/prisma':{prisma:financeDb},'@/lib/session':{},'@/lib/landing-config':{}})('lib/metodo/metrics.ts');
 const financialReport=await finance.metodoMetrics('2026-11-25','2026-11-25');assert.equal(financialReport.totals.invoicedEur,150);assert.equal(financialReport.totals.documentedCashEur,null,'invoice or missing transaction is not proof of cash');
 console.log('PASS: public DTO/privacy, source revocation, hidden sections, media/tool allowlists, WhatsApp encoding, consent/origin/auth/scope, no click-to-conversation inference, seeking/replay, Madrid DST, consented flow, deduplication, click references and withdrawal. Synthetic fixtures only.');
})().catch(e=>{console.error(e);process.exitCode=1;});
