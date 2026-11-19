import assert from "node:assert/strict";
import { HOLD_PVC,HOLD_BUMPER,SHOULDER_VIDEO_TESTS,type ShoulderAIDraft } from "../lib/shoulder-analysis-types";
import { PILOT_TESTS } from "../lib/shoulder-pilot";
import { pendingSources,proposalConflicts,revisionKey,runShoulderQueue,type ShoulderVideoSource,type QueueEvent,type ProposalEntry } from "../lib/shoulder-analysis-queue";
const sid="baseline",date="2026-11-11T00:00:00.000Z";
const source=(testId:string):ShoulderVideoSource=>({sessionId:sid,id:testId+"-video",testId,url:"/private",uploadedAt:date});
const [a,b,c]=[HOLD_PVC,HOLD_BUMPER,Object.keys(SHOULDER_VIDEO_TESTS)[2]].map(source);
const draft=(s:ShoulderVideoSource)=>({testId:s.testId,videoId:s.id,uploadedAt:s.uploadedAt} as ShoulderAIDraft);
async function main(){
  const all=PILOT_TESTS.map(t=>source(t.id));
  assert.equal(all.length,15);
  assert.deepEqual(Object.keys(SHOULDER_VIDEO_TESTS).sort(),PILOT_TESTS.map(t=>t.id).sort(),"Every protocol test has an analysis mode");
  assert.deepEqual(pendingSources(all,sid,[],{}, {},false),all,"All 15 received tests enter the queue");
  const kinds=Object.values(SHOULDER_VIDEO_TESTS).map(t=>t.kind);
  for(const [kind,count] of [["hold",2],["movement",4],["measurement",7],["load",2]] as const)assert.equal(kinds.filter(k=>k===kind).length,count);
  const reviewed=all.slice(0,4).map(s=>s.testId);
  assert.equal(pendingSources(all,sid,reviewed,{}, {},false).length,11);
  assert.equal(pendingSources(all,sid,[],{}, {},false).length,15,"Including reviewed tests restores all eligible videos");
  const allEvents:QueueEvent[]=[];
  await runShoulderQueue(all,new AbortController().signal,async s=>{
    if(s===all[5])throw Error("interrupted sample");
    return draft(s);
  },e=>allEvents.push(e));
  assert.deepEqual(allEvents.filter(e=>e.type==="start").map(e=>e.source),all,"The batch attempts all 15 even after one fails");
  assert.equal(allEvents.filter(e=>e.type==="ready").length,14);
  const afterRun:Record<string,ProposalEntry>={};
  for(const event of allEvents){
    if(event.type==="ready")afterRun[revisionKey(event.source)]={draft:event.draft};
    if(event.type==="error")afterRun[revisionKey(event.source)]={error:event.message};
  }
  assert.deepEqual(pendingSources(all,sid,[],{},afterRun,false),[all[5]],"Retry only the failed test, preserving other proposals");

  const candidates=[{...a,sessionId:"other"},{...a,url:""},source("unsupported"),a,a,b,c];
  assert.deepEqual(pendingSources(candidates,sid,[],{}, {},false),[a,b,c]);
  assert.deepEqual(pendingSources(candidates,sid,[b.testId],{[c.testId]:"sin vídeo"}, {},false),[a]);
  const entries={[revisionKey(a)]:{draft:draft(a)},[revisionKey(b)]:{error:"timeout"}};
  assert.deepEqual(pendingSources([a,b,{...c,aiReviewBlocked:true}],sid,[],{},entries,false),[b]);
  const fresh={...a,uploadedAt:"2026-11-12T01:00:00.000Z"};
  assert.deepEqual(pendingSources([fresh],sid,[],{},entries,false),[fresh]);
  assert.deepEqual(pendingSources([a,b],sid,[],{}, {},true),[]);
  assert.equal(proposalConflicts({holdSeconds:0},{holdSeconds:12}),true);
  assert.equal(proposalConflicts({holdSeconds:14},{holdSeconds:14,positionLossSeconds:0}),false);
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
  console.log("Shoulder AI queue: all 15 tests, reviewed selection, failed-only retry, privacy, safe merge, sequential progress, cancel and revision isolation passed.");
}
main().catch(e=>{console.error(e);process.exitCode=1;});
