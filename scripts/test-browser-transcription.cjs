const fs=require("fs"),vm=require("vm"),ts=require("typescript"),assert=require("node:assert/strict");
let now=0, counter=0, timers=new Map();
const setTimer=(fn,ms)=>{const id=++counter;timers.set(id,{fn,at:now+ms});return id};
function advance(ms){now+=ms;for(const [id,t] of [...timers])if(t.at<=now){timers.delete(id);t.fn()}}
const m={exports:{}};
vm.runInNewContext(ts.transpileModule(fs.readFileSync("lib/browser-transcription.ts","utf8"),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText,
 {module:m,exports:m.exports,setTimeout:setTimer,clearTimeout:id=>timers.delete(id),Map,Promise});
const {startBrowserTranscription}=m.exports;
const instances=[];
class Recognition {constructor(){instances.push(this);this.stops=0;this.aborts=0}start(){this.onstart?.()}stop(){this.stops++}abort(){this.aborts++}}
const result=(text,isFinal=true)=>({0:{transcript:text},isFinal});
(async()=>{
 let state;
 const service=startBrowserTranscription(s=>state=s,Recognition),a=instances.at(-1);
 assert.equal(a.lang,"es-ES");assert.equal(a.continuous,true);
 a.onresult({results:[result("Hola equipo"),result("vamos a",false)]});assert.equal(state.text,"Hola equipo");assert.equal(state.interim,"vamos a");
 a.onresult({results:[result("Hola equipo"),result("vamos a grabar")]});assert.equal(state.text,"Hola equipo vamos a grabar");
 a.onresult({results:[result("Hola equipo"),result("vamos a grabar")]});assert.equal(state.text,"Hola equipo vamos a grabar","final results must not be duplicated");
 service.pause();assert.equal(a.stops,1);a.onend();advance(500);assert.equal(instances.length,1,"pause must not auto-restart");
 service.resume();const b=instances.at(-1);assert.notEqual(a,b);b.onresult({results:[result("Seguimos en otra sección")]});
 const done=service.finish();b.onresult({results:[result("Seguimos en otra sección"),result("hasta luego")]});b.onend();
 const final=await done;assert.equal(final.text,"Hola equipo vamos a grabar Seguimos en otra sección hasta luego");assert.equal(final.status,"complete");advance(2000);assert.equal(instances.length,2);
 let failure;const denied=startBrowserTranscription(s=>failure=s,Recognition),c=instances.at(-1);c.onerror({error:"not-allowed"});c.onend();advance(5000);assert.equal(failure.status,"unavailable");assert.equal(instances.length,3);await denied.finish();
 let broken;const net=startBrowserTranscription(s=>broken=s,Recognition);let r=instances.at(-1);r.onresult({results:[result("Texto antes del fallo")]});r.onerror({error:"network"});r.onend();advance(1600);r=instances.at(-1);r.onresult({results:[result("Texto recuperado")]});const n=net.finish();r.onend();assert.equal((await n).status,"partial");assert.equal(broken.text,"Texto antes del fallo Texto recuperado");
 let timeout;const slow=startBrowserTranscription(s=>timeout=s,Recognition);r=instances.at(-1);r.onresult({results:[result("Última frase provisional",false)]});const f=slow.finish();advance(1900);assert.equal((await f).text,"Última frase provisional");assert.equal(timeout.status,"partial");
 let unavailable;assert.doesNotThrow(()=>startBrowserTranscription(s=>unavailable=s,class{constructor(){throw Error("not supported")}}));assert.equal(unavailable.status,"unavailable");
 const destroy=startBrowserTranscription(()=>{},Recognition);r=instances.at(-1);destroy.dispose();const count=instances.length;r.onend?.();advance(9000);assert.equal(instances.length,count);assert.equal(r.aborts,1);
 console.log("PASS: live/final transcript ordering, no duplicate results, pause/resume, final words, network gaps, denied permission, unsupported engine and cleanup.");
})().catch(e=>{console.error(e);process.exitCode=1});
