import { canAnalyzeShoulderTest, type ShoulderAIDraft } from "./shoulder-analysis-types";

export type ShoulderVideoSource = {id:string;testId:string;url:string;uploadedAt:string;sessionId:string;aiReviewBlocked?:boolean};
export type ProposalEntry = {draft?:ShoulderAIDraft;applied?:boolean;error?:string};
export const revisionKey = (s:ShoulderVideoSource) => JSON.stringify([s.sessionId,s.testId,s.id,s.uploadedAt]);

export function pendingSources(sources: ShoulderVideoSource[], sessionId:string, checked:readonly string[],
  skip:Record<string,string>, proposals:Record<string,ProposalEntry>, blocked:boolean): ShoulderVideoSource[] {
  if(blocked)return [];
  const seen=new Set<string>();
  return sources.filter(s=>{
    if(!s.url||!s.id||!s.uploadedAt||s.sessionId!==sessionId||!canAnalyzeShoulderTest(s.testId)||seen.has(s.testId))return false;
    seen.add(s.testId);
    return !s.aiReviewBlocked&&!checked.includes(s.testId)&&!(s.testId in skip)&&!proposals[revisionKey(s)]?.draft;
  });
}

export type QueueEvent =
  | {type:"start";source:ShoulderVideoSource;index:number}
  | {type:"progress";source:ShoulderVideoSource;message:string}
  | {type:"ready";source:ShoulderVideoSource;draft:ShoulderAIDraft}
  | {type:"error";source:ShoulderVideoSource;message:string};

export async function runShoulderQueue(sources:readonly ShoulderVideoSource[], signal:AbortSignal,
  analyze:(source:ShoulderVideoSource,progress:(message:string)=>void,signal:AbortSignal)=>Promise<ShoulderAIDraft>,
  onEvent:(event:QueueEvent)=>void) {
  for(let index=0;index<sources.length&&!signal.aborted;index++){
    const source=sources[index];onEvent({type:"start",source,index});
    try{
      const draft=await analyze(source,message=>{if(!signal.aborted)onEvent({type:"progress",source,message});},signal);
      if(draft.testId!==source.testId||draft.videoId!==source.id||draft.uploadedAt!==source.uploadedAt)
        throw new Error("La propuesta no coincide con esta entrega. Recarga la valoración.");
      if(!signal.aborted)onEvent({type:"ready",source,draft});
    }catch(e){if(!signal.aborted)onEvent({type:"error",source,message:e instanceof Error?e.message:"No se pudo analizar el vídeo."});}
  }
}

// Proposed values and manual edits stay separate until the clinician explicitly incorporates them.
export function proposalConflicts(existing:Record<string,unknown>|undefined, proposed:Record<string,string|number>) {
  return Object.keys(proposed).some(k=>existing?.[k]!=null && existing[k]!=="" && existing[k]!==proposed[k]);
}
