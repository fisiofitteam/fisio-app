import type { PilotObservations } from "./shoulder-pilot";

export const SHOULDER_AXES=["mobility","stability","endRange","coordination","endurance","tolerance"] as const;
export type ShoulderAxis=typeof SHOULDER_AXES[number];
export type ShoulderNarrativeKey="general"|ShoulderAxis;
export type ShoulderNarrative=Partial<Record<ShoulderNarrativeKey,string>>;
export const SHOULDER_NARRATIVE_LIMIT=1200;
const keys:readonly string[]=["general",...SHOULDER_AXES];

export function cleanShoulderNarrative(value:unknown):ShoulderNarrative {
  if(!value || typeof value!=="object" || Array.isArray(value))throw Error("Comentarios del informe no válidos.");
  const out:ShoulderNarrative={};
  for(const [key,text] of Object.entries(value)){
    if(!keys.includes(key)||typeof text!=="string")throw Error("Comentario del informe no válido.");
    if(text.length>SHOULDER_NARRATIVE_LIMIT)throw Error("Cada comentario admite como máximo 1200 caracteres.");
    const clean=text.trim();
    if(clean)out[key as ShoulderNarrativeKey]=clean;
  }
  return out;
}

// Older drafts are the bare observation map. The envelope keeps prose out of observations
// and therefore out of all numeric validation, scoring and patient-only inputs.
export function readReviewDraft(json:string|null|undefined):{observations:PilotObservations;narrative:ShoulderNarrative}{
  const record=JSON.parse(json||"{}");
  return record?.v===1?{observations:record.observations,narrative:cleanShoulderNarrative(record.narrative)}:{observations:record,narrative:{}};
}
export function writeReviewDraft(observations:PilotObservations,narrative:ShoulderNarrative):string {
  return JSON.stringify(Object.keys(narrative).length?{v:1,observations,narrative}:observations);
}
