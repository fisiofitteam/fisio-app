const fs=require('fs'),path=require('path'),vm=require('vm'),ts=require('typescript'),assert=require('node:assert/strict');
const {NextRequest}=require('next/server');
let actor=null,calls=[];
const patients=[{id:'own',fullName:'Ana Uno',assignedProfessionalId:'a',derivations:[]},{id:'derived',fullName:'Bruno Dos',assignedProfessionalId:'b',derivations:[{toProfessionalId:'a'}]},{id:'hidden',fullName:'Private Other',assignedProfessionalId:'b',derivations:[]}];
const base={createdById:'a',folderEntries:[],notes:'Internal',createdAt:new Date(),size:50,durationSeconds:3,shareTokenHash:'HASH_MUST_NOT_LEAK',shareExpiresAt:new Date(Date.now()+86400000),createdBy:{fullName:'Professional'},url:'PRIVATE_URL_MUST_NOT_LEAK',blobPath:'PRIVATE_PATH_MUST_NOT_LEAK'};
const rows=[{...base,id:'general-a',title:'General A',patientId:null,patient:null,status:'ready',folderEntries:[{professionalId:'a',folderId:'folder-a',folder:{id:'folder-a',name:'Equipo'}}]},{...base,id:'general-b',title:'General B',patientId:null,patient:null,createdById:'b',status:'ready'},...Array.from({length:26},(_,i)=>({...base,id:'own-'+i,title:'Review '+i,status:'ready',patientId:'own',patient:patients[0]})),{...base,id:'derived',title:'Derived review',status:'ready',patientId:'derived',patient:patients[1]},{...base,id:'hidden',title:'Secret review',status:'ready',patientId:'hidden',patient:patients[2]},{...base,id:'pending',title:'Uploading',status:'uploading',patientId:'own',patient:patients[0]}];
function matches(row,where){return Object.entries(where).every(([k,v])=>{
 if(k==='AND')return v.every(x=>matches(row,x));
 if(k==='OR')return v.some(x=>matches(row,x));
 if(v && typeof v==='object'){
  if('is' in v)return !!row[k] && matches(row[k],v.is);
  if('none' in v)return !row[k].some(x=>matches(x,v.none));
  if('some' in v)return row[k].some(x=>matches(x,v.some));
  if('contains' in v)return row[k].toLowerCase().includes(v.contains.toLowerCase());
  if('in' in v)return v.in.includes(row[k]);
 }
 return row[k]===v;
})}
const prisma={patientRecording:{count:async({where})=>{calls.push(where);return rows.filter(r=>matches(r,where)).length},findMany:async({where,take,skip})=>{calls.push(where);return rows.filter(r=>matches(r,where)).slice(skip,skip+take)}}};
const stubs={'@/lib/prisma':{prisma},'@/lib/session':{getActiveProfessional:async()=>actor},'@vercel/blob':{}};
const cache={};function load(file){const full=path.resolve(file);if(cache[full])return cache[full];const m={exports:{}};const code=ts.transpileModule(fs.readFileSync(full,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText;vm.runInNewContext(code,{module:m,exports:m.exports,require:id=>stubs[id]||(id.startsWith('@/')?load(id.slice(2)+'.ts'):require(id)),Date,URL,URLSearchParams,Response,Headers,Request,process,console});return cache[full]=m.exports}
const lib=load('lib/recording-library.ts'),api=load('app/api/recordings/route.ts');
const pro=(id='a',role='fisio',extraRoles=[])=>({id,role,extraRoles,isManager:[role,...extraRoles].some(r=>['ceo','head_success'].includes(r))});
(async()=>{
 for(const denied of [null]){calls=[];await assert.rejects(()=>lib.getRecordingLibrary(denied),e=>e.status===403);assert.equal(calls.length,0)}
 let result=await lib.getRecordingLibrary(pro());assert.equal(result.total,28);assert.equal(result.recordings.length,24);assert.ok(result.recordings.every(r=>r.patientId!=='hidden'));assert.equal(result.page,1);
 result=await lib.getRecordingLibrary(pro(),{page:'99999'});assert.equal(result.page,2);assert.equal(result.recordings.length,4);assert.ok(result.recordings.some(r=>r.id==='derived'));
 result=await lib.getRecordingLibrary(pro(),{patientId:'hidden',q:'Secret'});assert.equal(result.total,0);
 result=await lib.getRecordingLibrary(pro(),{q:'Private Other'});assert.equal(result.total,0);
 result=await lib.getRecordingLibrary(pro(),{q:'bRuNo'});assert.equal(result.total,1);assert.equal(result.recordings[0].id,'derived');
 result=await lib.getRecordingLibrary(pro('a','closer',['fisio']),{q:'Review'});assert.equal(result.total,27);
 result=await lib.getRecordingLibrary(pro('manager','ceo'));assert.equal(result.total,30);
 result=await lib.getRecordingLibrary(pro(),{patientId:'own',page:'NaN'});assert.equal(result.total,26);assert.equal(result.page,1);
 for(const secret of ['PRIVATE_URL_MUST_NOT_LEAK','PRIVATE_PATH_MUST_NOT_LEAK','HASH_MUST_NOT_LEAK'])assert.ok(!JSON.stringify(result).includes(secret));
 result=await lib.getRecordingLibrary(pro('a','setter'));assert.equal(result.total,1);assert.equal(result.recordings[0].id,'general-a');
 result=await lib.getRecordingLibrary(pro(),{patientId:'none'});assert.equal(result.total,1);assert.equal(result.recordings[0].patientId,null);
 result=await lib.getRecordingLibrary(pro(),{folderId:'folder-a'});assert.equal(result.total,1);
 result=await lib.getRecordingLibrary(pro(),{folderId:'none'});assert.equal(result.total,27);
 result=await lib.getRecordingLibrary(pro('b'),{folderId:'folder-a'});assert.equal(result.total,0);
 actor=null;let response=await api.GET(new NextRequest('https://app.test/api/recordings'));assert.equal(response.status,403);
 actor=pro();response=await api.GET(new NextRequest('https://app.test/api/recordings?q=Bruno'));assert.equal(response.status,200);assert.match(response.headers.get('cache-control'),/no-store/);assert.equal((await response.json()).recordings[0].id,'derived');
 console.log('PASS: clinical role guards, assignments/derivations, filtered isolation, pagination bounds, metadata sanitization and no-store API.');
})().catch(e=>{console.error(e);process.exitCode=1});
