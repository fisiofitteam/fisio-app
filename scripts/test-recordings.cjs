const fs=require("fs"),path=require("path"),vm=require("vm"),ts=require("typescript"),assert=require("node:assert/strict");
const {NextRequest}=require("next/server");
let actor=null, counter=0, rows=new Map(), meta={}, deleted=[], headCalls=[], failDelete=false, streamed=0, uploadHooks;
const patient={id:"patient-fixture",assignedProfessionalId:"pro-a",derivations:["pro-b"]};
const clinical=(pro)=>!!pro && [pro.role,...pro.extraRoles].some(r=>["ceo","head_success","fisio"].includes(r));
const match=(r,w)=>Object.entries(w).every(([k,v])=> v && typeof v==="object" && "gt" in v ? r[k]>v.gt : r[k]===v);
const folders=new Map(), entries=new Map(); let folderCounter=0;
const prisma={
 recordingFolder:{
  findMany:async({where})=>[...folders.values()].filter(r=>match(r,where)),
  findFirst:async({where})=>[...folders.values()].find(r=>match(r,where))||null,
  create:async({data})=>{if([...folders.values()].some(r=>r.professionalId===data.professionalId&&r.name===data.name))throw Object.assign(new Error("duplicate"),{code:"P2002"});const row={id:"folder"+(++folderCounter),...data};folders.set(row.id,row);return row},
  update:async({where,data})=>{const row=folders.get(where.id);assert(row&&row.professionalId===where.professionalId);Object.assign(row,data);return row},
  delete:async({where})=>{const row=folders.get(where.id);assert(row&&row.professionalId===where.professionalId);folders.delete(row.id);for(const [key,e] of entries)if(e.folderId===row.id)entries.delete(key);return row},
 },
 recordingFolderEntry:{
  upsert:async({create})=>{entries.set(create.recordingId+":"+create.professionalId,create);return create},
  deleteMany:async({where})=>{for(const [key,e] of entries)if(match(e,where))entries.delete(key);return{}},
 },
 patient:{findUnique:async({where})=>{
   if(where.id!==patient.id)return null;
   if(where.OR && !where.OR.some(f=>f.assignedProfessionalId===patient.assignedProfessionalId || f.derivations && patient.derivations.includes(f.derivations.some.toProfessionalId)))return null;
   return patient;
 }},
 patientRecording:{
   create:async({data})=>{const row={id:"rec"+ ++counter,createdAt:new Date(),shareTokenHash:null,shareExpiresAt:null,url:null,...data};rows.set(row.id,row);if(data.folderEntries){const e=data.folderEntries.create;entries.set(row.id+":"+e.professionalId,{recordingId:row.id,...e})}return {...row}},
   findUnique:async({where})=>rows.has(where.id)?{...rows.get(where.id)}:null,
   findFirst:async({where,select})=>{const row=[...rows.values()].find(r=>match(r,where));return !row?null:select?Object.fromEntries(Object.keys(select).map(k=>[k,row[k]])):{...row}},
   update:async({where,data})=>{const row=rows.get(where.id);if(!row)throw Error("not found");Object.assign(row,data);return {...row}},
   updateMany:async({where,data})=>{let count=0;for(const r of rows.values())if(match(r,where)){Object.assign(r,data);count++}return{count}},
   deleteMany:async({where})=>{let count=0;for(const [id,r] of rows)if(match(r,where)){rows.delete(id);count++}return{count}},
 },
};
const stubs={
 "@/lib/prisma":{prisma},
 "@/lib/session":{getActiveProfessional:async()=>actor},
 "@vercel/blob":{head:async p=>{headCalls.push(p);return meta[p]},del:async p=>{if(failDelete)throw Error("offline");deleted.push(p)}},
 "@vercel/blob/client":{handleUpload:async opts=>{uploadHooks=opts;return opts.onBeforeGenerateToken(opts.body.pathname,opts.body.payload)}},
 "@/lib/assessment-media":{mediaFailure:s=>new Response(null,{status:s}),serveAssessmentMedia:async()=>{streamed++;return new Response("video")}},
};
const loaded={};
function load(file){
 if(loaded[file])return loaded[file];
 const m={exports:{}};const code=ts.transpileModule(fs.readFileSync(file,"utf8"),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText;
 vm.runInNewContext(code,{module:m,exports:m.exports,require:id=>stubs[id]||(id.startsWith("@/")?load(path.join(process.cwd(),id.slice(2)+".ts")):require(id)),URL,Date,Set,process,Response,Headers,Request,console});
 return loaded[file]=m.exports;
}
const pro=(id="pro-a",role="fisio")=>({id,role,extraRoles:[],isManager:role==="ceo"});
const req=(url,body,method="POST",origin="https://app.test")=>new NextRequest("https://app.test"+url,{method,headers:{origin,"Content-Type":"application/json"},...(body===undefined?{}:{body:JSON.stringify(body)})});
const ctx={params:{id:patient.id}};
const create=load("app/api/patients/[id]/recordings/route.ts");
const upload=load("app/api/recordings/upload/route.ts");
const recording=load("app/api/recordings/[recordingId]/route.ts");
const share=load("app/api/recordings/[recordingId]/share/route.ts");
const internal=load("app/api/recordings/[recordingId]/video/route.ts");
const publicPage=load("app/grabacion/[token]/route.ts"),publicVideo=load("app/grabacion/[token]/video/route.ts");
const lib=load("lib/recordings.ts"), rules=load("lib/recording-rules.ts");
const middleware=load("middleware.ts").middleware;
const input={title:"Screen review",mime:"video/webm",size:300,durationSeconds:8,notes:"PRIVATE_NOTE"};
process.env.ASSESSMENT_BLOB_READ_WRITE_TOKEN="test-private-store";
(async()=>{
 for(const value of [{...input,size:0},{...input,size:Infinity},{...input,mime:"text/html"},{...input,durationSeconds:NaN},{...input,title:" "},{...input,notes:"x".repeat(5001)}])assert.throws(()=>rules.recordingInput(value));
 for(const url of ["https://evil.test/a","https://foo.private.blob.vercel-storage.com.evil.test/professional-recordings/a","http://foo.private.blob.vercel-storage.com/professional-recordings/a","https://foo.private.blob.vercel-storage.com/professional-recordings/b"])assert.equal(rules.recordingBlobUrl(url,"professional-recordings/a"),null);
 for(const a of [null,pro("other"),pro("pro-a","setter")]){
  actor=a;assert.equal((await create.POST(req("/api/patients/p/recordings",input),ctx)).status,403);assert.equal(rows.size,0);
 }
 actor=pro();assert.equal((await create.POST(req("/api/patients/p/recordings",input,"POST","https://evil.test"),ctx)).status,403);
 let out=await create.POST(req("/api/patients/p/recordings",input),ctx);assert.equal(out.status,201);
 const created=await out.json(),id=created.id,p=created.pathname,c={params:{recordingId:id}};
 assert(!p.includes(patient.id));assert(p.endsWith(".webm"));
 const ubody={pathname:p,payload:JSON.stringify({id})};
 actor=pro("other");assert.equal((await upload.POST(req("/api/recordings/upload",ubody))).status,403);
 actor=pro("manager","ceo");assert.equal((await upload.POST(req("/api/recordings/upload",ubody))).status,409);
 actor=pro();assert.equal((await upload.POST(req("/api/recordings/upload",{...ubody,pathname:p+"x"}))).status,409);
 out=await upload.POST(req("/api/recordings/upload",ubody));assert.equal(out.status,200);
 const options=await out.json();assert.equal(options.maximumSizeInBytes,300);assert.equal(options.allowOverwrite,false);
 meta[p]={pathname:p,size:299,contentType:"video/webm",url:"https://fixture.private.blob.vercel-storage.com/"+p};
 assert.equal((await recording.POST(req("/api/recordings/"+id),c)).status,409);assert.equal(rows.get(id).status,"uploading");
 meta[p].size=300;
 assert.equal((await recording.POST(req("/api/recordings/"+id,{url:"https://evil.test/ssrf"}),c)).status,200);
 assert(headCalls.every(value=>value===p));assert.equal(rows.get(id).status,"ready");
 // Replay is idempotent.
 assert.equal((await recording.POST(req("/api/recordings/"+id),c)).status,200);
 actor=null;assert.equal((await internal.GET(req("/api/recordings/"+id+"/video",undefined,"GET"),c)).status,403);
 actor=pro("other");assert.equal((await share.POST(req("/api/recordings/"+id+"/share"),c)).status,403);
 assert.equal((await recording.DELETE(req("/api/recordings/"+id,undefined,"DELETE"),c)).status,403);
 actor=pro("pro-b");assert.equal((await internal.GET(req("/api/recordings/"+id+"/video",undefined,"GET"),c)).status,200);
 out=await share.POST(req("/api/recordings/"+id+"/share"),c);assert.equal(out.status,200);
 const token=(await out.json()).path.split("/").pop(),sc={params:{token}};
 assert.equal(token.length,43);assert(!JSON.stringify([...rows.values()]).includes(token));
 actor=null;
 let html=await (await publicPage.GET(new Request("https://app.test"),sc)).text();
 for(const secret of ["PRIVATE_NOTE",patient.id,p,"pro-a"])assert(!html.includes(secret));
 assert(html.includes("Screen review"));assert.equal((await publicVideo.GET(new Request("https://app.test"),sc)).status,200);
 rows.get(id).shareExpiresAt=new Date(0);assert.equal((await publicVideo.GET(new Request("https://app.test"),sc)).status,404);
 actor=pro();out=await share.POST(req("/api/recordings/"+id+"/share"),c);
 const token2=(await out.json()).path.split("/").pop();assert.notEqual(token,token2);
 await share.DELETE(req("/api/recordings/"+id+"/share",undefined,"DELETE"),c);
 assert.equal(await lib.sharedRecording(token2),null);
 for(const suffix of [token,token+"/video"]){
  const response=middleware(new NextRequest("https://app.test/grabacion/"+suffix));
  assert.equal(response.status,200);assert.equal(response.headers.get("referrer-policy"),"no-referrer");assert.match(response.headers.get("cache-control"),/no-store/);
 }
 for(const suffix of ["short",token+"/other",token+"/video/extra"]){
  assert.equal(middleware(new NextRequest("https://app.test/grabacion/"+suffix)).status,404);
 }
 assert.equal(middleware(new NextRequest("https://app.test/grabacion/"+token,{method:"POST"})).status,404);
 failDelete=true;assert.equal((await recording.DELETE(req("/api/recordings/"+id,undefined,"DELETE"),c)).status,500);
 assert.equal(rows.get(id).status,"deleting");
 assert.equal((await internal.GET(req("/api/recordings/"+id+"/video",undefined,"GET"),c)).status,404);
 failDelete=false;assert.equal((await recording.DELETE(req("/api/recordings/"+id,undefined,"DELETE"),c)).status,200);
 assert(!rows.has(id));assert.deepEqual(deleted,[p]);
 const collection=load("app/api/recordings/route.ts"), folderApi=load("app/api/recordings/folders/route.ts"), folderItem=load("app/api/recordings/folders/[folderId]/route.ts"), move=load("app/api/recordings/[recordingId]/folder/route.ts");
 actor=null;assert.equal((await folderApi.GET()).status,403);assert.equal((await collection.POST(req("/api/recordings",input))).status,403);
 actor=pro("pro-a","setter");assert.equal((await folderApi.POST(req("/api/recordings/folders",{name:" "}))).status,400);
 assert.equal((await folderApi.POST(req("/api/recordings/folders",{name:"Equipo"},"POST","https://evil.test"))).status,403);
 out=await folderApi.POST(req("/api/recordings/folders",{name:"Equipo"}));assert.equal(out.status,201);const fa=await out.json();
 assert.equal((await folderApi.POST(req("/api/recordings/folders",{name:"Equipo"}))).status,409);
 actor=pro("pro-b");out=await folderApi.POST(req("/api/recordings/folders",{name:"Presentaciones"}));const fb=await out.json();
 assert.equal((await folderItem.PATCH(req("/api/recordings/folders/"+fa.id,{name:"Changed"},"PATCH"),{params:{folderId:fa.id}})).status,404);
 assert.equal((await collection.POST(req("/api/recordings",{...input,folderId:fa.id}))).status,404);
 const ownFolders=await (await folderApi.GET()).json();assert.equal(ownFolders.length,1);assert.equal(ownFolders[0].id,fb.id);
 actor=pro("pro-a","setter");assert.equal((await collection.POST(req("/api/recordings",{...input,patientId:patient.id}))).status,403);
 out=await collection.POST(req("/api/recordings",{...input,patientId:null,folderId:fa.id}));assert.equal(out.status,201);const general=await out.json(),gc={params:{recordingId:general.id}};
 assert.equal(rows.get(general.id).patientId,null);assert.equal(entries.get(general.id+":pro-a").folderId,fa.id);
 Object.assign(rows.get(general.id),{status:"ready",url:"https://fixture.private.blob.vercel-storage.com/"+general.pathname});
 assert.equal((await internal.GET(req("/api/recordings/"+general.id+"/video",undefined,"GET"),gc)).status,200);
 actor=pro("pro-b");assert.equal((await internal.GET(req("/api/recordings/"+general.id+"/video",undefined,"GET"),gc)).status,403);
 assert.equal((await move.PATCH(req("/api/recordings/"+general.id+"/folder",{folderId:fb.id},"PATCH"),gc)).status,403);
 actor=pro("manager","ceo");assert.equal((await internal.GET(req("/api/recordings/"+general.id+"/video",undefined,"GET"),gc)).status,200);
 assert.equal((await move.PATCH(req("/api/recordings/"+general.id+"/folder",{folderId:fa.id},"PATCH"),gc)).status,404);
 out=await folderApi.POST(req("/api/recordings/folders",{name:"Dirección"}));const fm=await out.json();
 assert.equal((await move.PATCH(req("/api/recordings/"+general.id+"/folder",{folderId:fm.id},"PATCH"),gc)).status,200);
 assert.equal(entries.get(general.id+":pro-a").folderId,fa.id);assert.equal(entries.get(general.id+":manager").folderId,fm.id);
 actor=pro("pro-a","setter");assert.equal((await folderItem.PATCH(req("/api/recordings/folders/"+fa.id,{name:"Guías"},"PATCH"),{params:{folderId:fa.id}})).status,200);
 assert.equal((await folderItem.DELETE(req("/api/recordings/folders/"+fa.id,undefined,"DELETE"),{params:{folderId:fa.id}})).status,200);
 assert(rows.has(general.id));assert(!entries.has(general.id+":pro-a"));assert(entries.has(general.id+":manager"));
 console.log("PASS: general recording creation/ownership, nonclinical patient denial, personal folder ownership/rename/move, independent manager organization and folder deletion preserving videos.");
 console.log("PASS: upload reservations, role/assignment/derivation checks, path and metadata binding, share privacy/expiry/revocation, delete failure and retry, exact public middleware scope.");
})().catch(e=>{console.error(e);process.exitCode=1});
