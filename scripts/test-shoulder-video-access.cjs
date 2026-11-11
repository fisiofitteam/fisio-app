// Execute actual Next route flow against isolated access/storage/provider doubles.
const fs=require("fs"),path=require("path"),vm=require("vm"),ts=require("typescript"),assert=require("node:assert/strict");
class PilotHttpError extends Error {constructor(status,message){super(message);this.status=status}}
class VideoError extends PilotHttpError {}
const test="5594f37b-b392-4fab-bf49-8dace28ad43c",date=new Date("2026-11-01T08:00:00.000Z");
let body,video,consent,actorAllowed,afterCheck,reads,sends,enabled;
const stubs={
 "next/server":{NextResponse:{json:(data,opt)=>({data,status:opt.status,headers:opt.headers})}},
 "@/lib/prisma":{prisma:{assessmentVideo:{findUnique:async()=>video}}},
 "@/lib/shoulder-pilot-server":{PilotHttpError,requirePilotAccess:async(id,proOnly)=>{
   assert(proOnly);reads++;if(!actorAllowed||id!=="session")throw new PilotHttpError(403,"test denied");
   if(afterCheck)afterCheck(reads);
   return {session:{id,assignment:{patientId:"p"}},row:{aiConsent:consent,aiConsentAt:date},refs:new Map([[test,"task"]]),config:{}};
 }},
 "@/lib/shoulder-analysis-types":{canAnalyzeShoulderTest:id=>id===test},
 "@/lib/shoulder-video-analysis":{configuredProvider:()=>enabled,VideoError,readLimitedBody:async()=>body,validateFrames:b=>b,analyzeFrames:async()=>{sends++;return{notes:"simulacion"}}}
};
function load(file){const m={exports:{}};const code=ts.transpileModule(fs.readFileSync(file,"utf8"),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText;vm.runInNewContext(code,{module:m,exports:m.exports,require:id=>{if(stubs[id])return stubs[id];if(id.startsWith("@/lib/"))return load(path.join(process.cwd(),id.slice(2)+".ts"));return require(id)},URL,Date,Set,process});return m.exports;}
const api=load("app/api/shoulder-pilot/[sessionId]/analyze/route.ts");
function reset(){body={videoId:"v",testId:test,uploadedAt:date.toISOString(),consentVersion:date.toISOString()};video={patientId:"p",sessionId:"session",taskId:"task",testId:test,uploadedAt:date,url:"https://fixture.invalid/private"};consent=true;actorAllowed=true;afterCheck=null;reads=sends=0;enabled=true;}
const req=()=>({url:"https://unit.example/api/shoulder-pilot/session/analyze",nextUrl:new URL("https://unit.example/api/shoulder-pilot/session/analyze?"+new URLSearchParams(body)),headers:new Headers({host:"unit.example",origin:"https://unit.example","content-type":"application/json"})});
const ctx={params:{sessionId:"session"}};
(async()=>{reset();assert.equal((await api.GET(req(),ctx)).data.consentVersion,date.toISOString());
for(const [mutate,expected] of [[()=>actorAllowed=false,403],[()=>consent=false,409],[()=>video.patientId="other",404],[()=>video.sessionId="other",404],[()=>video.taskId="other",404],[()=>video.testId="other",404],[()=>video.url=null,404],[()=>body.consentVersion="stale",409],[()=>body.uploadedAt="stale",409],[()=>enabled=false,503],[()=>afterCheck=n=>{if(n===2)consent=false},409]]){
 reset();mutate();const out=await api.POST(req(),ctx);assert.equal(out.status,expected);assert.equal(sends,0);
}
reset();afterCheck=n=>{if(n===3)consent=false};const revoked=await api.POST(req(),ctx);assert.equal(revoked.status,409);assert.equal(sends,1);assert(!revoked.data.draft);
reset();const ok=await api.POST(req(),ctx);assert.equal(ok.status,200);assert.equal(sends,1);assert(ok.data.draft);assert(ok.headers["Cache-Control"].includes("no-store"));
console.log("PASS: consent/preflight, role, patient/session/task/media revision binding, revocation before/after provider and no cached draft");
})().catch(e=>{console.error(e.message);process.exitCode=1});
