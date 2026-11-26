const fs=require('fs'),path=require('path'),vm=require('vm'),ts=require('typescript'),assert=require('node:assert/strict');
const {NextRequest}=require('next/server');
function loader(mocks={}){const cache={};function load(file){file=path.resolve(file);if(cache[file])return cache[file].exports;const m={exports:{}};cache[file]=m;vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{module:m,exports:m.exports,require:id=>{if(id in mocks)return mocks[id];if(id==='server-only')return{};if(id.startsWith('@/'))return load(id.slice(2)+'.ts');if(id.startsWith('.'))return load(path.resolve(path.dirname(file),id)+'.ts');return require(id)},Date,Intl,URL,Buffer,structuredClone,console,process,setTimeout,clearTimeout},{filename:file});return m.exports;}return load;}
const content=loader()('lib/metodo/content.ts'),events=loader()('lib/metodo/events.ts');
let config=structuredClone(content.DEFAULT_METODO),actor=null,writes=0;
let agenda={groupImageUrl:'https://fixture.public.blob.vercel-storage.com/team.jpg',authorityText:'PRIVATE unrelated agenda copy',stats:[{value:'PRIVATE unverified figure'}]},agendaReads=0;
const landingConfigMock={getAgendaGraciasCopy:async()=>({whatsappNumber:'+34 621495367'}),getAgendaLandingCopy:async()=>{agendaReads++;return agenda;}};
const version='2026-11-25T10:00:00.000Z';
const prisma={landingConfig:{findUnique:async()=>({content:JSON.stringify(config),updatedAt:new Date(version)})},patientEvidence:{findMany:async({where,select})=>{assert(where.source.in.includes('general'));assert(!select.notes&&!select.textContent&&!select.patientId);return[{id:'evidence-fixture',updatedAt:new Date(version),url:'https://fixture.public.blob.vercel-storage.com/photo.jpg',kind:'image'}];}},successCase:{findMany:async()=>[]},metodoEvent:{upsert:async()=>{writes++;}},lead:{findUnique:async()=>({id:'lead-fixture',closerId:'closer-a'})}};
const load=loader({'@/lib/prisma':{prisma},'@/lib/session':{getActiveProfessional:async()=>actor},'@/lib/landing-config':landingConfigMock});
const server=load('lib/metodo/server.ts'),eventRoute=load('app/api/metodo/event/route.ts'),visitRoute=load('app/api/metodo/visit/route.ts'),adminRoute=load('app/api/metodo/admin/config/route.ts'),attribution=load('app/api/metodo/admin/attribution/route.ts'),contact=load('app/api/metodo/contact/route.ts');
const req=(pathname,data,origin='https://app.test',cookie='')=>new NextRequest('https://app.test'+pathname,{method:'POST',headers:{origin,'content-type':'application/json',cookie},body:JSON.stringify(data)});
(async()=>{
 assert.equal(content.normalizeMetodo(null).stories.length,0);assert.equal(content.normalizeMetodo(null).media.hero.url,'');assert.equal(config.sections.tools.visible,false);
 // Existing JSON config gains the team field; only exact historical default copy migrates.
 const legacy={published:false,sections:{founder:{visible:false,eyebrow:'DE ATLETAS PARA ATLETAS',title:'Conocemos el box. Y lo que cuesta volver.',body:'Soy Ales, fisioterapeuta y fundador de FisioFitCross. Nuestra especialización nace de unir la experiencia clínica con la práctica del crosstraining. Entendemos lo que te exige una sesión y lo que significa para ti poder disfrutarla. Por eso trabajamos contigo: para construir un proceso que tenga sentido en tu vida y en tu deporte.'},fit:{eyebrow:'¿ES FISIOFITCROSS PARA TI?'}},media:{introduction:{alt:'Ales explica la metodología de FisioFitCross',url:'https://youtu.be/abcdefghijk'}},seo:{title:'Nuestro método | FisioFitCross'},whatsapp:{number:'34 621495367',message:'Hola, equipo de FisioFitCross. He estado viendo vuestra metodología y me gustaría contaros mi caso para saber si podéis ayudarme.'}};
 const legacySnapshot=JSON.stringify(legacy),migrated=content.normalizeMetodo(legacy);
 assert.equal(JSON.stringify(legacy),legacySnapshot,'normalization does not mutate stored input');
 assert.equal(migrated.published,false);assert.equal(migrated.sections.founder.visible,false);
 for(const key of ['eyebrow','title','body'])assert.equal(migrated.sections.founder[key],content.DEFAULT_METODO.sections.founder[key]);
 assert.equal(migrated.sections.fit.eyebrow,content.DEFAULT_METODO.sections.fit.eyebrow);assert.equal(migrated.seo.title,'Nuestro método | FisioFitTeam');assert.equal(migrated.whatsapp.message,content.DEFAULT_METODO.whatsapp.message);assert.equal(migrated.whatsapp.number,'34621495367');assert.equal(migrated.media.introduction.alt,content.DEFAULT_METODO.media.introduction.alt);assert.equal(migrated.media.introduction.url,'https://www.youtube.com/watch?v=abcdefghijk');assert.equal(migrated.media.team.url,'');
 const custom=structuredClone(legacy);custom.sections.founder={...custom.sections.founder,eyebrow:'Nuestro equipo',title:'Un equipo contigo',body:'Nuestro texto propio de FisioFitCross.'};custom.sections.fit.eyebrow='¿Hablamos?';custom.seo.title='Método propio | FisioFitCross';custom.whatsapp.message='Hola, FisioFitCross, este es mi mensaje.';custom.media.introduction.alt='Nuestro vídeo propio';
 const preserved=content.normalizeMetodo(custom);for(const key of ['eyebrow','title','body'])assert.equal(preserved.sections.founder[key],custom.sections.founder[key]);assert.equal(preserved.sections.fit.eyebrow,custom.sections.fit.eyebrow);assert.equal(preserved.seo.title,custom.seo.title);assert.equal(preserved.whatsapp.message,custom.whatsapp.message);assert.equal(preserved.media.introduction.alt,custom.media.introduction.alt);
 custom.sections.founder.title='';custom.whatsapp.message='';assert.equal(content.normalizeMetodo(custom).sections.founder.title,'');assert.equal(content.normalizeMetodo(custom).whatsapp.message,'','intentional empty copy is retained');
 // Existing published presentation copy migrates field by field without changing editorial state.
 const presentation={published:false,sections:{
  hero:{visible:false,title:'Vuelve a disfrutar del crosstraining sin que el dolor decida cómo entrenas.',body:'Ayudamos a atletas que llevan meses entrenando con dolor a recuperar sus movimientos mediante un proceso de fisioterapia y entrenamiento adaptado a sus necesidades.'},
  empathy:{title:'Quieres volver a entrenar con confianza.',body:'Y sentir que avanzas, en lugar de negociar con las mismas molestias cada semana.'},
  method:{visible:false,title:'Un proceso con dirección. Y alguien a tu lado.',body:'Acompañamiento profesional, seguimiento de tu evolución y ajustes individualizados durante el proceso.',items:[
   {title:'Entendemos tu caso',body:'Valoramos tu situación, historial, síntomas, objetivos y limitaciones deportivas.'},
   {title:'Adaptamos tu entrenamiento',body:'Buscamos que puedas seguir entrenando dentro de tus posibilidades mientras trabajamos en tu recuperación.'},
   {title:'Recuperamos capacidades',body:'Diseñamos un proceso individualizado de ejercicio terapéutico, fuerza y exposición progresiva a los movimientos que necesitas recuperar.'},
   {title:'Volvemos a tus objetivos deportivos',body:'Trabajamos para que recuperes capacidad, confianza y autonomía en tu entrenamiento.'},
  ]},
  fit:{title:'No buscas otro parche. Buscas un proceso.'},
  cta:{title:'¿Y si el siguiente paso no fuera dejar de entrenar, sino aprender a recuperarte mientras entrenas?'},
 }};
 const presentationSnapshot=JSON.stringify(presentation),updatedPresentation=content.normalizeMetodo(presentation);
 assert.equal(JSON.stringify(presentation),presentationSnapshot,'copy migration does not mutate the saved JSON');
 assert.equal(updatedPresentation.sections.hero.title,'Que el dolor no decida cómo entrenas.');
 assert.equal(updatedPresentation.sections.method.title,'Así te acompañamos de vuelta al box.');
 assert.equal(updatedPresentation.sections.cta.title,'Cuéntanos qué te está frenando.');
 assert.equal(updatedPresentation.sections.fit.title,'Un trabajo en equipo. También contigo.');
 for(const [id,old] of Object.entries(presentation.sections))for(const key of ['title','body'])if(key in old)assert.equal(updatedPresentation.sections[id][key],content.DEFAULT_METODO.sections[id][key],`${id}.${key} untouched copy migrates`);
 assert.equal(updatedPresentation.published,false);assert.equal(updatedPresentation.sections.hero.visible,false);assert.equal(updatedPresentation.sections.method.visible,false);
 assert.equal(JSON.stringify(updatedPresentation.sections.method.items),JSON.stringify(content.DEFAULT_METODO.sections.method.items));
 assert.equal(JSON.stringify(content.normalizeMetodo(updatedPresentation)),JSON.stringify(updatedPresentation),'copy migration is idempotent');
 const editedPresentation=structuredClone(presentation);
 editedPresentation.sections.hero.title='Mi titular propio';editedPresentation.sections.hero.body='';
 editedPresentation.sections.empathy.title='Un título elegido por el equipo';editedPresentation.sections.empathy.body='Nuestra explicación';editedPresentation.sections.method.title='';editedPresentation.sections.method.body='Mi explicación';
 editedPresentation.sections.fit.title='';editedPresentation.sections.cta.title='Mi invitación';
 const oldItems=presentation.sections.method.items;
 editedPresentation.sections.method.items=[oldItems[3],{...oldItems[0],body:''},{...oldItems[1],title:'Mi fase de adaptación'},oldItems[2]];
 const keptPresentation=content.normalizeMetodo(editedPresentation);
 for(const [id,old] of Object.entries(editedPresentation.sections))for(const key of ['title','body'])if(key in old)assert.equal(keptPresentation.sections[id][key],old[key],`${id}.${key} customized or empty copy is retained`);
 assert.equal(keptPresentation.sections.method.items[0].title,oldItems[3].title,'reordering is retained');
 assert.equal(keptPresentation.sections.method.items[0].body,content.DEFAULT_METODO.sections.method.items[3].body,'an unchanged item migrates after reordering');
 assert.equal(keptPresentation.sections.method.items[1].body,'','an intentionally empty item body is not repopulated');
 assert.equal(keptPresentation.sections.method.items[2].title,'Mi fase de adaptación');
 assert.equal(keptPresentation.sections.method.items[2].body,oldItems[1].body,'a custom item title keeps its original paired body');
 assert.equal(keptPresentation.sections.method.items[3].body,content.DEFAULT_METODO.sections.method.items[2].body);
 assert.equal(content.normalizeMetodo({sections:{method:{items:[]}}}).sections.method.items.length,0,'removed phases are not recreated');
 assert.equal(content.normalizeMetodo({sections:{hero:{title:presentation.sections.hero.title+' '}}}).sections.hero.title,presentation.sections.hero.title,'near matches do not receive new marketing copy');
 assert.equal(config.sections.empathy.items.length,5,'all five identification situations remain available');
 // Inherit only a validated public team URL, with an explicit method image taking precedence.
 let teamPublic=await server.getPublicMetodo();assert.equal(teamPublic.media.team.url,agenda.groupImageUrl);assert(!JSON.stringify(teamPublic).includes('PRIVATE'));assert.equal(config.media.team.url,'','public fallback never writes into the method config');
 const agendaUrl=agenda.groupImageUrl;
 for(const url of ['https://evil.test/team.jpg','/api/patients/private','https://private.blob.vercel-storage.com/team.jpg','https://fixture.public.blob.vercel-storage.com/team.svg','https://youtu.be/abcdefghijk']){agenda.groupImageUrl=url;assert.equal((await server.getPublicMetodo()).media.team.url,'','unsafe or non-image agenda URL is not inherited');}
 agenda.groupImageUrl=agendaUrl;config.media.team={url:'https://fixture.public.blob.vercel-storage.com/custom-team.jpg',alt:'Custom team caption',poster:''};const readsBeforeCustom=agendaReads;teamPublic=await server.getPublicMetodo();assert.equal(teamPublic.media.team.url,config.media.team.url);assert.equal(teamPublic.media.team.alt,'Custom team caption');assert.equal(agendaReads,readsBeforeCustom,'an explicit team photo does not query agenda');
 config.media.team.url='';
 for(const [hero,founder] of [[true,false],[false,true],[false,false],[true,true]]){config.sections.hero.visible=hero;config.sections.founder.visible=founder;const reads=agendaReads;teamPublic=await server.getPublicMetodo();assert.equal(teamPublic.media.team.url,hero||founder?agendaUrl:'');if(!hero&&!founder){assert.equal(teamPublic.media.team.alt,'');assert.equal(teamPublic.media.team.poster,'');assert.equal(agendaReads,reads,'hidden team media does not read agenda');}}
 config.sections.hero.visible=false;config.sections.founder.visible=false;config.media.team={url:'https://fixture.public.blob.vercel-storage.com/private-draft.jpg',alt:'PRIVATE team draft',poster:'https://fixture.public.blob.vercel-storage.com/private-poster.jpg'};teamPublic=await server.getPublicMetodo();assert.equal(teamPublic.media.team.url,'');assert.equal(teamPublic.media.team.alt,'');assert.equal(teamPublic.media.team.poster,'');assert(!JSON.stringify(teamPublic).includes('PRIVATE team draft'));
 config=structuredClone(content.DEFAULT_METODO);
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
 let visitors=[],storedEvents=new Map(),references=[],requests=[];
 const db={...prisma,$executeRaw:async()=>0,$executeRawUnsafe:async()=>0,metodoRateLimit:{upsert:async()=>({count:1})},
 metodoVisitor:{findUnique:async({where})=>visitors.find(v=>v.tokenHash===where.tokenHash)||null,create:async({data})=>{const v={...data,createdAt:new Date()};visitors.push(v);return v;},update:async()=>{},delete:async()=>{visitors=[];storedEvents.clear();}},
 metodoEvent:{upsert:async({where,create})=>{if(!storedEvents.has(where.id))storedEvents.set(where.id,create);}},
 metodoContact:{findFirst:async()=>references[0]||null,findMany:async({where})=>references.filter(r=>r.visitorId===where.visitorId).map(r=>({reference:r.reference})),create:async({data})=>{references.push(data);return data;},deleteMany:async()=>{references=[];}},
 metodoRequest:{updateMany:async({where,data})=>{for(const r of requests)if(where.reference.in.includes(r.reference))Object.assign(r,data);},create:async({data})=>{requests.push(data);return data;}},
 $transaction:async fn=>typeof fn==='function'?fn(db):Promise.all(fn)};
 const positive=loader({'@/lib/prisma':{prisma:db},'@/lib/session':{getActiveProfessional:async()=>null},'@/lib/landing-config':landingConfigMock});
 const vr=positive('app/api/metodo/visit/route.ts'),er=positive('app/api/metodo/event/route.ts'),cr=positive('app/api/metodo/contact/route.ts');
 const payload={consent:true,version:server.CONSENT_VERSION,sessionId:'12345678-1234-1234-1234-123456789abc',source:{utm_source:'instagram',utm_campaign:'fixture'}};
 const first=await vr.POST(req('/api/metodo/visit',payload));assert.equal(first.status,200);const cookie=first.headers.get('set-cookie').split(';')[0]+'; ff-metodo-consent=v1.accepted';assert.equal(visitors.length,1);assert.equal(storedEvents.size,1);
 assert.equal((await vr.POST(req('/api/metodo/visit',payload,'https://app.test',cookie))).status,200);assert.equal(storedEvents.size,1);assert.equal(visitors.length,1);
 const event={sessionId:payload.sessionId,type:'scroll',target:'page',value:25};await er.POST(req('/api/metodo/event',event,'https://app.test',cookie));await er.POST(req('/api/metodo/event',event,'https://app.test',cookie));assert.equal(storedEvents.size,2);
 const nav=()=>new NextRequest('https://app.test/api/metodo/contact?placement=hero',{headers:{cookie,'sec-fetch-site':'same-origin'}});const click=await cr.GET(nav());assert.equal(click.status,302);assert.equal(references.length,1);assert(!references[0].confirmedAt,'click never confirms conversation');assert(new URL(click.headers.get('location')).searchParams.get('text').includes(references[0].reference));await cr.GET(nav());assert.equal(references.length,1,'double navigation reuses reference');
 // Valoración form: validation, consent, message, storage and measurement link.
 const rq=loader()('lib/metodo/request.ts');
 const valid={zone:'Hombro',duration:'De 3 a 6 meses',impact:'Evito algunos movimientos',sport:'Hyrox',tried:['Reposo','Fisioterapia presencial'],detail:'Me molesta el\npress  ',name:' Laura ',prefix:'34',phone:'600 123 456',consent:true,origin:'Hombro'};
 let check=rq.validateRequest(valid);assert(check.ok);assert.equal(check.data.phone,'34600123456');assert.equal(check.data.name,'Laura');assert.equal(check.data.detail,'Me molesta el press');assert.equal(check.data.origin,'hombro');assert.equal(JSON.stringify(check.data.tried),JSON.stringify(['Fisioterapia presencial','Reposo']));
 for(const [patch,step] of [[{zone:'Pie'},1],[{duration:'Siempre'},2],[{impact:undefined},3],[{sport:'Golf'},3],[{tried:[]},3],[{tried:['Nada todavía','Reposo']},3],[{tried:['Reposo','<script>']},3],[{name:'L'},4],[{phone:'12345'},4],[{phone:'500123456'},4],[{prefix:'999'},4],[{consent:'yes'},4],[{phone:'+33 612345678'},4]]){const r=rq.validateRequest({...valid,...patch});assert.equal(r.ok,false,JSON.stringify(patch));assert.equal(r.step,step,JSON.stringify(patch));}
 assert.equal(rq.validateRequest({...valid,phone:'+34 600 123 456'}).data.phone,'34600123456','international number repeating the prefix');assert.equal(rq.validateRequest({...valid,phone:'0034600123456'}).data.phone,'34600123456');
 assert.equal(rq.validateRequest({...valid,prefix:'39',phone:'391 234 5678'}).data.phone,'393912345678','national numbers that start like the prefix are kept');
 assert(rq.validateRequest({zone:'Rodilla'},1).ok,'partial steps validate only what has been asked');
 assert.equal(rq.resolveOrigin('Espalda'),'lumbar');assert.equal(rq.resolveOrigin('__proto__'),null);assert.equal(rq.resolveOrigin('constructor'),null);assert.equal(rq.resolveOrigin(['hombro']),null);
 const message=rq.requestMessage('Hola equipo.',check.data);assert(message.startsWith('Hola equipo.'));assert(message.includes('• Zona: Hombro'));assert(message.includes('• He probado: Fisioterapia presencial, Reposo'));assert(message.endsWith('Soy Laura.'));
 assert.equal(events.validEvent({sessionId:'a'.repeat(36),target:'form',type:'form_step',value:5}),null);assert.equal(events.validEvent({sessionId:'a'.repeat(36),target:'page',type:'form_step',value:2}),null);assert(events.validEvent({sessionId:'a'.repeat(36),target:'form',type:'form_step',value:2}));
 const sr=positive('app/api/metodo/solicitud/route.ts');const post=(data,extra={})=>new NextRequest('https://app.test/api/metodo/solicitud',{method:'POST',headers:{origin:'https://app.test','content-type':'application/json','sec-fetch-site':'same-origin',...extra},body:JSON.stringify(data)});
 assert.equal((await sr.POST(post(valid,{origin:'https://evil.test'}))).status,403);
 let res=await sr.POST(post({...valid,consent:false}));assert.equal(res.status,400);assert.equal((await res.json()).step,4);assert.equal(requests.length,0,'no storage without consent');
 res=await sr.POST(post(valid));assert.equal(res.status,200);let out=await res.json();assert.equal(out.saved,true);let text=new URL(out.url).searchParams.get('text');assert(text.includes('• Zona: Hombro'));assert(!text.includes('Referencia'),'no reference without measurement consent');
 assert.equal(requests.length,1);assert.equal(requests[0].reference,null);assert.equal(requests[0].consentVersion,rq.REQUEST_CONSENT_VERSION);assert.equal(requests[0].phone,'34600123456');assert(requests[0].consentAt instanceof Date);
 references=[];res=await sr.POST(post(valid,{cookie}));out=await res.json();assert.equal(references.length,1);assert.equal(references[0].placement,'form');assert(new URL(out.url).searchParams.get('text').includes(references[0].reference));assert.equal(requests[1].reference,references[0].reference);
 const failing=loader({'@/lib/prisma':{prisma:{...db,metodoRequest:{create:async()=>{throw Error('db down');}}}},'@/lib/session':{getActiveProfessional:async()=>null},'@/lib/landing-config':landingConfigMock})('app/api/metodo/solicitud/route.ts');
 res=await failing.POST(post(valid));assert.equal(res.status,200,'storage failure never blocks WhatsApp');assert.equal((await res.json()).saved,false);
 config.sections.request.visible=false;assert.equal((await sr.POST(post(valid))).status,404);config.sections.request.visible=true;
 const legacyConfig=content.normalizeMetodo({sections:{hero:{title:'Mi portada'}}});for(const id of ['trust','request','compare'])assert.equal(legacyConfig.sections[id].visible,true,`${id} appears on existing configs`);
 const adminRequests=positive('app/api/metodo/admin/solicitudes/route.ts');assert.equal((await adminRequests.GET(new NextRequest('https://app.test/api/metodo/admin/solicitudes'))).status,401);
 const staffOnly=loader({'@/lib/prisma':{prisma:db},'@/lib/session':{getActiveProfessional:async()=>({id:'closer',role:'closer',extraRoles:[]})},'@/lib/landing-config':landingConfigMock})('app/api/metodo/admin/solicitudes/route.ts');assert.equal((await staffOnly.GET(new NextRequest('https://app.test/api/metodo/admin/solicitudes'))).status,403,'closers do not list health requests');
 const withdrawal=await vr.DELETE(new NextRequest('https://app.test/api/metodo/visit',{method:'DELETE',headers:{origin:'https://app.test',cookie}}));assert.equal(withdrawal.status,200);assert.equal(requests[1].reference,null,'withdrawal unlinks the request from measurement');assert.equal(requests.length,2,'the contact request itself stays');assert.equal(visitors.length,0);assert.equal(storedEvents.size,0);assert.equal(references.length,0);
 const financeDb={...db,$queryRaw:async()=>[],metodoEvent:{groupBy:async()=>[]},metodoContact:{count:async()=>0,groupBy:async()=>[],findMany:async()=>[]},metodoRequest:{count:async()=>3},lead:{count:async()=>0},sale:{findMany:async()=>[]},patientInvoice:{findMany:async()=>[{totalAmount:150,transactionId:'missing-document',saleId:'fixture'}]},transaction:{aggregate:async()=>({_sum:{amount:null},_count:{_all:0}})}};
 financeDb.$transaction=async fn=>typeof fn==='function'?fn(financeDb):Promise.all(fn);
 const finance=loader({'@/lib/prisma':{prisma:financeDb},'@/lib/session':{},'@/lib/landing-config':{}})('lib/metodo/metrics.ts');
 const financialReport=await finance.metodoMetrics('2026-11-25','2026-11-25');assert.equal(financialReport.totals.invoicedEur,150);assert.equal(financialReport.totals.documentedCashEur,null,'invoice or missing transaction is not proof of cash');assert.equal(financialReport.totals.formRequests,3);assert(!JSON.stringify(financialReport).includes('phone'),'metrics never carry request PII');
 console.log('PASS: valoración form validation/consent/storage/WhatsApp/measurement link/withdrawal/roles, ad-origin resolution, form-step events, exact legacy/presentation-copy migration, reordered phases and custom/empty copy preservation, validated team-photo inheritance/precedence/visibility, public DTO/privacy, source revocation, hidden sections, media/tool allowlists, WhatsApp encoding, consent/origin/auth/scope, no click-to-conversation inference, seeking/replay, Madrid DST, consented flow, deduplication, click references and withdrawal. Synthetic fixtures only.');
})().catch(e=>{console.error(e);process.exitCode=1;});
