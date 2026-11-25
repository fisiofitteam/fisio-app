const fs=require("fs"),vm=require("vm"),ts=require("typescript"),assert=require("node:assert/strict");
let intervals=new Map(), nextTimer=0,contexts=[],recorders=[],displayOptions,deviceCalls=0,denyMic=false,failResume=false;
class Track {constructor(kind){this.kind=kind;this.readyState="live";this.enabled=true;this.muted=false;this.stops=0} stop(){this.readyState="ended";this.stops++} getSettings(){return {width:1280,height:720}}}
class Stream {constructor(tracks=[]){this.tracks=tracks} getTracks(){return this.tracks} getAudioTracks(){return this.tracks.filter(t=>t.kind==="audio")} getVideoTracks(){return this.tracks.filter(t=>t.kind==="video")}}
class Node {constructor(){this.connections=[];this.disconnected=false} connect(node){this.connections.push(node);return node} disconnect(){this.disconnected=true}}
class Context {constructor(){this.sources=[];this.analysers=[];this.closed=0;this.state="running";contexts.push(this)}async resume(){if(failResume)throw Error("audio blocked")}createMediaStreamDestination(){this.destination=new Node();this.destination.stream=new Stream([new Track("audio")]);return this.destination} createMediaStreamSource(stream){const node=new Node();node.stream=stream;this.sources.push(node);return node}createAnalyser(){const node=new Node();node.signal=128;node.getByteTimeDomainData=bytes=>bytes.fill(node.signal);this.analysers.push(node);return node}async close(){this.closed++;this.state="closed"}}
class Recorder {static isTypeSupported(){return true}constructor(stream,options){this.stream=stream;this.mimeType=options.mimeType;this.state="inactive";recorders.push(this)}start(){this.state="recording"}pause(){this.state="paused"}resume(){this.state="recording"}stop(){this.state="inactive";queueMicrotask(()=>{this.ondataavailable({data:new Blob(["synthetic"])});this.onstop()})}}
let screen,devices;
const loaded={};function load(file){if(loaded[file])return loaded[file];const m={exports:{}};vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,"utf8"),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText,{
module:m,exports:m.exports,require:id=>id==="./recording-rules"?{MAX_RECORDING_BYTES:500*1024*1024,MAX_RECORDING_SECONDS:1800}:load("lib/recording-audio.ts"),
AudioContext:Context,MediaStream:Stream,MediaRecorder:Recorder,Blob,URL,Uint8Array,performance:{now:()=>1000},
navigator:{mediaDevices:{getDisplayMedia:async options=>{displayOptions=options;return screen},getUserMedia:async()=>{deviceCalls++;if(denyMic)throw Error("denied");return devices}}},
setInterval:fn=>{const id=++nextTimer;intervals.set(id,fn);return id},clearInterval:id=>intervals.delete(id),setTimeout:()=>++nextTimer,clearTimeout:()=>{},
});return loaded[file]=m.exports}
const {startBrowserRecording}=load("lib/browser-recorder.ts"),{mixRecordingAudio}=load("lib/recording-audio.ts");
const options={camera:false,microphone:true,systemAudio:true,onTick(){},onFinish(){},onError(message){throw Error(message)}};
(async()=>{
 const mic=new Track("audio"),remote=new Track("audio"),mixer=await mixRecordingAudio([mic],[remote]),ctx=contexts.at(-1);
 assert.equal(ctx.sources.length,2);assert.equal(mixer.stream.getAudioTracks().length,1);
 for(let i=0;i<2;i++){assert.equal(ctx.sources[i].connections[0],ctx.analysers[i]);assert.equal(ctx.analysers[i].connections[0],ctx.destination)}
 assert.equal(mixer.snapshot().shared.level,0,"connected but silent is not sound");ctx.analysers[1].signal=160;assert(mixer.snapshot().shared.level>.5);assert.equal(mixer.snapshot().microphone.level,0);
 remote.muted=true;assert.equal(mixer.snapshot().shared.state,"muted");remote.muted=false;remote.stop();assert.equal(mixer.snapshot().shared.state,"ended");mic.enabled=false;assert.equal(mixer.snapshot().microphone.state,"muted");
 mixer.close();mixer.close();assert.equal(ctx.closed,1);assert(ctx.sources.every(n=>n.disconnected));assert.equal(mixer.stream.getTracks()[0].readyState,"ended");assert.equal(mic.stops,0,"mixer must not stop caller-owned inputs");
 screen=new Stream([new Track("video")]);const before=deviceCalls;await assert.rejects(()=>startBrowserRecording(options),/Compartir audio/);assert.equal(deviceCalls,before);assert.equal(screen.getTracks()[0].readyState,"ended");
 const screenVideo=new Track("video"),shared=new Track("audio"),voice=new Track("audio");screen=new Stream([screenVideo,shared]);devices=new Stream([voice]);let state,finished;
 const recording=await startBrowserRecording({...options,onAudioState:s=>state=s,onFinish:r=>finished=r});const recorder=recorders.at(-1);
 assert.equal(displayOptions.systemAudio,"include");assert.equal(displayOptions.windowAudio,"system");assert.equal(displayOptions.audio.suppressLocalAudioPlayback,false);
 assert.equal(recorder.stream.getAudioTracks().length,1);assert.equal(recording.audioTrack,recorder.stream.getAudioTracks()[0]);assert.equal(state.shared.state,"live");
 recording.pause();assert.equal(recorder.state,"paused");recording.resume();assert.equal(recorder.state,"recording");shared.stop();for(const tick of intervals.values())tick();assert.equal(state.shared.state,"ended");
 recording.stop();await Promise.resolve();assert(finished.blob.size>0);assert.match(finished.reason,/perdió una fuente/);assert.equal(voice.readyState,"ended");assert.equal(screenVideo.readyState,"ended");assert.equal(intervals.size,0);assert.equal(contexts.at(-1).closed,1);
 screen=new Stream([new Track("video"),new Track("audio")]);devices=new Stream([new Track("audio")]);const solo=await startBrowserRecording({...options,systemAudio:false});assert.equal(contexts.at(-1).sources.length,1);assert.equal(displayOptions.audio,false);assert.equal(displayOptions.systemAudio,"exclude");solo.stop();await Promise.resolve();
 screen=new Stream([new Track("video"),new Track("audio")]);devices=new Stream();const clientOnly=await startBrowserRecording({...options,microphone:false});assert.equal(contexts.at(-1).sources.length,1);clientOnly.stop();await Promise.resolve();
 screen=new Stream([new Track("video"),new Track("audio")]);denyMic=true;await assert.rejects(()=>startBrowserRecording(options),/denied/);assert(screen.getTracks().every(t=>t.readyState==="ended"));denyMic=false;
 screen=new Stream([new Track("video"),new Track("audio")]);devices=new Stream([new Track("audio")]);failResume=true;await assert.rejects(()=>startBrowserRecording(options),/audio blocked/);assert.equal(contexts.at(-1).closed,1);assert([...screen.getTracks(),...devices.getTracks()].every(t=>t.readyState==="ended"));
 console.log("PASS: two-source mix into one track, independent meters, silence/mute/disconnection, shared audio required, mic-only/client-only, pause/resume, interrupted recording warning, denied permissions and cleanup.");
})().catch(e=>{console.error(e);process.exitCode=1});
