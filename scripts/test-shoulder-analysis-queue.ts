import assert from "node:assert/strict";
import { HOLD_PVC,HOLD_BUMPER,SHOULDER_VIDEO_TESTS,type ShoulderAIDraft } from "../lib/shoulder-analysis-types";
import { pendingSources,proposalConflicts,revisionKey,runShoulderQueue,type ShoulderVideoSource,type QueueEvent } from "../lib/shoulder-analysis-queue";
const sid="baseline",date="2026-11-11T00:00:00.000Z";
const source=(testId:string):ShoulderVideoSource=>({sessionId:sid,id:testId+"-video",testId,url:"/private",uploadedAt:date});
const [a,b,c]=[HOLD_PVC,HOLD_BUMPER,Object.keys(SHOULDER_VIDEO_TESTS)[2]].map(source);
const draft=(s:ShoulderVideoSource)=>({testId:s.testId,videoId:s.id,uploadedAt:s.uploadedAt} as ShoulderAIDraft);
async function main(){
  const candidates=[{...a,sessionId:"other"},{...a,url:""},source("unsupported"),a,a,b,c];
  assert.deepEqual(pendingSources(candidates,sid,[],{}, {},false),[a,b,c]);
  assert.deepEqual(pendingSources(candidates,sid,[b.testId],{[c.testId]:"sin vídeo"}, {},false),[a]);
  const entries={[revisionKey(a)]:{draft:draft(a)},[revisionKey(b)]:{error:"timeout"}};
  assert.deepEqual(pendingSources([a,b,{...c,aiReviewBlocked:true}],sid,[],{},entries,false),[b]);
  const fresh={...a,uploadedAt:"2026-11-12T01:00:00.000Z"};
  assert.deepEqual(pendingSources([fresh],sid,[],{},entries,false),[fresh]);
  assert.deepEqual(pendingSources([a,b],sid,[],{}, {},true),[]);
  assert.equal(proposalConflicts({holdSeconds:0},{holdSeconds:12}),true);
  assert.equal(proposalConflicts({holdSeconds:14},{holdSeconds:14,inRangeSeconds:12}),false);
  let inFlight=0,maxFlight=0;
  const events:QueueEvent[]=[];
  await runShoulderQueue([a,b,c],new AbortController().signal,async(s,tick)=>{
    inFlight++;maxFlight=Math.max(maxFlight,inFlight);await Promise.resolve();tick("50 %");inFlight--;
    if(s===b)throw new Error("falló el códec");
    return draft(s);
  },e=>events.push(e));
  assert.equal(maxFlight,1);assert.deepEqual(events.filter(e=>e.type==="start").map(e=>e.source),[a,b,c]);
  assert.deepEqual(events.filter(e=>e.type==="ready").map(e=>e.source),[a,c]);
  assert.deepEqual(events.filter(e=>e.type==="error").map(e=>e.message),["falló el códec"]);
  const cancel=new AbortController(),seen:QueueEvent[]=[];
  await runShoulderQueue([a,b,c],cancel.signal,async s=>{cancel.abort();return draft(s);},e=>seen.push(e));
  assert.deepEqual(seen.map(e=>e.type),["start"]);
  const crossed:QueueEvent[]=[];
  await runShoulderQueue([a],new AbortController().signal,async()=>draft(fresh),e=>crossed.push(e));
  assert.deepEqual(crossed.map(e=>e.type),["start","error"]);
  console.log("Shoulder AI queue: eligibility, privacy, safe merge, sequential progress, partial failure, cancel and revision isolation passed.");
}
main().catch(e=>{console.error(e);process.exitCode=1;});
