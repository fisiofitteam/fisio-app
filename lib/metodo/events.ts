export const SESSION_PATTERN = /^[a-f0-9-]{36}$/i;
export const REFERENCE_PATTERN = /^MF-[A-F0-9]{12}$/;
export function validEvent(input: unknown) {
  if(!input||typeof input!=="object")return null;
  const b=input as Record<string,unknown>;
  if(typeof b.sessionId!=="string"||!SESSION_PATTERN.test(b.sessionId)||typeof b.target!=="string"||!/^[a-zA-Z0-9_-]{1,64}$/.test(b.target))return null;
  const type=String(b.type),value=Number(b.value||0);
  if(!["scroll","video_start","video_progress","case_open","case_filter","tool_open"].includes(type))return null;
  if(type==="scroll"&&(![25,50,75,100].includes(value)||b.target!=="page"))return null;
  if(type==="video_progress"&&![25,50,75,100].includes(value))return null;
  if(!["scroll","video_progress"].includes(type)&&value!==0)return null;
  return{sessionId:b.sessionId,type,target:b.target,value};
}
/** Count watched intervals, not seeking forwards. Union prevents replay inflating completion. */
export function viewedProgress(intervals: Array<[number,number]>,previous:number,current:number,duration:number) {
  if(!Number.isFinite(duration)||duration<=0)return 0;
  if(previous>=0&&current>previous&&current-previous<=2.5){
    intervals.push([previous,Math.min(current,duration)]);intervals.sort((a,b)=>a[0]-b[0]);
    const merged:Array<[number,number]>=[];for(const span of intervals){const last=merged[merged.length-1];if(last&&span[0]<=last[1]+0.05)last[1]=Math.max(last[1],span[1]);else merged.push([...span]);}intervals.splice(0,intervals.length,...merged);
  }
  const watched=intervals.reduce((sum,[a,b])=>sum+b-a,0);return Math.min(100,Math.floor((watched/duration)*100));
}
