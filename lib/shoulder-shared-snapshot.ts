import type { PilotReportSnapshot } from "@/components/ShoulderPilotReport";
import { PILOT_TESTS, scorePilot, type PilotObservations, type PilotPain } from "./shoulder-pilot";
import { isShoulderAttemptTest, type ShoulderTestFeedbackMap } from "./shoulder-test-feedback";

export type SharedShoulderReports = {report:PilotReportSnapshot;previous:PilotReportSnapshot|null};
const emptyScore=scorePilot();
const allowedIds=new Set(PILOT_TESTS.map(t=>t.id));
const object=(v:unknown):Record<string,unknown>=>v&&typeof v==="object"&&!Array.isArray(v)?v as Record<string,unknown>:{};
const text=(v:unknown,size:number)=>typeof v==="string"?v.slice(0,size):"";
const numeric=(v:unknown,min=0,max=Number.MAX_SAFE_INTEGER)=>typeof v==="number"&&Number.isFinite(v)&&v>=min&&v<=max?v:null;

// Persist and hand the browser a new, allowlisted projection; never spread a raw clinical record.
// IDs below are the same static protocol test IDs for every participant, never patient/media IDs.
export function publicShoulderSnapshot(value:unknown):PilotReportSnapshot {
 const v=object(value),sc=object(v.scores);
 if((v.weekNumber!==1&&v.weekNumber!==14)||!Array.isArray(sc.axes)||typeof v.publishedAt!=="string"||!Number.isFinite(Date.parse(v.publishedAt)))throw Error("Informe no disponible.");
 const observations:PilotObservations={},feedback:ShoulderTestFeedbackMap={},notAssessable:Record<string,string>={};
 const tests:typeof emptyScore.tests={};
 for(const t of PILOT_TESTS){
   const o=object(object(v.observations)[t.id]),fields:PilotObservations[string]={};
   for(const f of t.fields){
     if(f.type==="number"){const x=numeric(o[f.key],f.min??0,f.max);if(x!==null)fields[f.key]=x;}
     else {const s=text(o[f.key],4000);if(s)fields[f.key]=s;}
   }
   // Keep the historical marker: old published stability must not be compared as a new measurement.
   if((t.key==="bumperHold"||t.key==="pvcHold")&&numeric(o.unstableSeconds,0,60)!==null)fields.unstableSeconds=o.unstableSeconds as number;
   if(Object.keys(fields).length)observations[t.id]=fields;
   const reason=text(object(v.notAssessable)[t.id],1200);if(reason)notAssessable[t.id]=reason;
   const data=object(object(v.testFeedback)[t.id]),row:ShoulderTestFeedbackMap[string]={};
   const intensity=numeric(data.pain,0,10);if(intensity!==null)row.pain=intensity;
   const ownNote=text(data.comment,500);if(ownNote)row.comment=ownNote;
   if(isShoulderAttemptTest(t.id)){const reps=numeric(data.reps,0,100),load=numeric(data.loadKg,0,500);if(reps!==null)row.reps=reps;if(load!==null)row.loadKg=load;}
   if(Object.keys(row).length)feedback[t.id]=row;
   const original=object(object(sc.tests)[t.id]);
   tests[t.id]={score:numeric(original.score,0,10),missing:original.missing!==false,detail:{}};
 }
 const p=object(v.pain);
 const pain:PilotPain={before:numeric(p.before,0,10),after:numeric(p.after,0,10),painfulTestIds:
    Array.isArray(p.painfulTestIds)?Array.from(new Set(p.painfulTestIds.filter((id):id is string=>typeof id==="string"&&allowedIds.has(id)))):null};
 const axes=emptyScore.axes.map(a=>({key:a.key,label:a.label,score:numeric(object((sc.axes as unknown[]).find(x=>object(x).key===a.key)).score,0,10)}));
 const symmetry=emptyScore.symmetry.map(a=>{
   const value=Array.isArray(sc.symmetry)?object(sc.symmetry.find(x=>object(x).key===a.key)):{};
   return {key:a.key,label:a.label,score:numeric(value.score,0,10),affectedKg:numeric(value.affectedKg,0,500),referenceKg:numeric(value.referenceKg,0,500)};
 });
 const keys=["general","mobility","stability","endRange","coordination","endurance","tolerance"] as const;
 const narrative:Partial<Record<typeof keys[number],string>>={};
 for(const key of keys){const line=text(object(v.narrative)[key],1200);if(line)narrative[key]=line;}
 return {weekNumber:v.weekNumber,publishedAt:new Date(v.publishedAt).toISOString(),rubricVersion:/^[A-Za-z0-9._-]{1,80}$/.test(String(v.rubricVersion))?String(v.rubricVersion):"",
   pain,observations,notAssessable,testFeedback:feedback,...(Object.keys(narrative).length?{narrative}:{}),
   scores:{axes,symmetry,tests,missing:[],complete:sc.complete===true,hasResults:sc.hasResults===true}};
}
