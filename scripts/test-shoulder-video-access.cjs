// Execute actual Next route flow against isolated access/storage/provider doubles.
const fs=require("fs"),path=require("path"),vm=require("vm"),ts=require("typescript"),assert=require("node:assert/strict");
class PilotHttpError extends Error {constructor(status,message){super(message);this.status=status}}
class VideoError extends PilotHttpError {}
const test="5594f37b-b392-4fab-bf49-8dace28ad43c",date=new Date("2026-11-01T08:00:00.000Z");
let body,video,row,actorAllowed,afterCheck,reads,sends,enabled;
const stubs={
 "next/server":{NextResponse:{json:(data,opt)=>({data,status:opt.status,headers:opt.headers})}},
 "@/lib/prisma":{prisma:{assessmentVideo:{findUnique:async()=>video}}},
 "@/lib/shoulder-pilot-server":{PilotHttpError,requirePilotAccess:async(id,proOnly)=>{
   assert(proOnly);reads++;if(!actorAllowed||id!=="session")throw new PilotHttpError(403,"test denied");
   if(afterCheck)afterCheck(reads);
   return {session:{id,assignment:{patientId:"p"}},row,refs:new Map([[test,"task"]]),config:{}};
 }},
 "@/lib/shoulder-analysis-types":{canAnalyzeShoulderTest:id=>id===test},
 "@/lib/shoulder-video-analysis":{configuredProvider:()=>enabled,VideoError,readLimitedBody:async()=>body,validateFrames:b=>b,analyzeFrames:async()=>{sends++;return{notes:"simulacion"}}}
};
function load(file){const m={exports:{}};const code=ts.transpileModule(fs.readFileSync(file,"utf8"),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText;vm.runInNewContext(code,{module:m,exports:m.exports,require:id=>{if(stubs[id])return stubs[id];if(id.startsWith("@/lib/"))return load(path.join(process.cwd(),id.slice(2)+".ts"));return require(id)},URL,Date,Set,process});return m.exports;}
const api=load("app/api/shoulder-pilot/[sessionId]/analyze/route.ts");
const newUrl="https://test.private.blob.vercel-storage.com/assessments/v/shoulder-v2/504587d4-c0f6-4f5b-a8e5-c54c7396fdca.mp4";
const oldUrl=newUrl.replace("/shoulder-v2/","/");
const withdrawn={aiConsent:false,aiConsentAt:date};
function reset(){body={videoId:"v",testId:test,uploadedAt:date.toISOString()};video={patientId:"p",sessionId:"session",taskId:"task",testId:test,uploadedAt:date,url:newUrl};row=null;actorAllowed=true;afterCheck=null;reads=sends=0;enabled=true;}
const req=()=>({url:"https://unit.example/api/shoulder-pilot/session/analyze",nextUrl:new URL("https://unit.example/api/shoulder-pilot/session/analyze?"+new URLSearchParams(body)),headers:new Headers({host:"unit.example",origin:"https://unit.example","content-type":"application/json"})});
const ctx={params:{sessionId:"session"}};
(async()=>{
  // New flow works without writing a consent row; a prior positive choice still covers old revisions.
  for(const mode of ["new","new-default","prior-optin"]){
    reset();if(mode==="new-default")row={aiConsent:false,aiConsentAt:null};
    if(mode==="prior-optin"){video.url=oldUrl;row={aiConsent:true,aiConsentAt:date};}
    assert.equal((await api.GET(req(),ctx)).data.available,true);
    const ok=await api.POST(req(),ctx);assert.equal(ok.status,200);assert.equal(sends,1);assert(ok.data.draft);assert(ok.headers["Cache-Control"].includes("no-store"));
  }
  for(const [mutate,expected] of [[()=>actorAllowed=false,403],[()=>row=withdrawn,409],[()=>video.patientId="other",404],[()=>video.sessionId="other",404],[()=>video.taskId="other",404],[()=>video.testId="other",404],[()=>video.url=null,404],[()=>body.uploadedAt="stale",409],[()=>enabled=false,503],[()=>video.url=oldUrl,409],[()=>video.url=newUrl.replace("/v/","/other/"),409],[()=>video.url=newUrl.replace("test.private.blob.vercel-storage.com","external.example"),409],[()=>video.url=oldUrl+"?path="+newUrl,409],[()=>afterCheck=n=>{if(n===2)row=withdrawn},409]]){
    reset();mutate();const out=await api.POST(req(),ctx);assert.equal(out.status,expected);assert.equal(sends,0);
  }
  reset();video.url=oldUrl;assert.equal((await api.GET(req(),ctx)).status,409,"legacy manual upload blocked before sampling");
  for(const mutate of [()=>row=withdrawn,()=>video.uploadedAt=new Date("2026-11-08")]){
    reset();afterCheck=n=>{if(n===3)mutate()};const stale=await api.POST(req(),ctx);assert.equal(stale.status,409);assert.equal(sends,1);assert(!stale.data.draft);
  }
  console.log("PASS: new/legacy review policies, withdrawal, role, patient/session/task/media revision binding before/after provider, no cached draft");
})().catch(e=>{console.error(e);process.exitCode=1});
