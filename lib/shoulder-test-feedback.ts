import { PILOT_TESTS, validatePilotPain, type PilotPain } from "./shoulder-pilot";

/** An athlete's report of an attempt, separate from a clinician's measurements and 8RM. */
export type ShoulderTestFeedback = { pain?: number; comment?: string; reps?: number; loadKg?: number };
export type ShoulderTestFeedbackMap = Record<string, ShoulderTestFeedback>;
export type ShoulderTestFeedbackPatch = Record<string, { [K in keyof ShoulderTestFeedback]?: ShoulderTestFeedback[K] | null } | null>;
export const SHOULDER_COMMENT_LIMIT = 500;
const attemptIds = new Set(PILOT_TESTS.filter(t=>t.key==="facePull8rm" || t.key==="press8rm").map(t=>t.id));
export const isShoulderAttemptTest = (id:string) => attemptIds.has(id);
const allIds = new Set(PILOT_TESTS.map(t=>t.id));
const record = (v: unknown): v is Record<string, unknown> =>
  v!==null && typeof v==="object" && !Array.isArray(v) && (Object.getPrototypeOf(v)===Object.prototype || Object.getPrototypeOf(v)===null);

export function mergeTestFeedback(current:ShoulderTestFeedbackMap, patch:unknown, assigned:ReadonlySet<string> = allIds):ShoulderTestFeedbackMap {
  if(!record(patch)) throw Error("El registro por test no es válido.");
  const next = {...current};
  for(const [id, change] of Object.entries(patch)){
    if(!allIds.has(id) || !assigned.has(id)) throw Error("Ese test no pertenece a esta valoración.");
    if(change===null){ delete next[id]; continue; }
    if(!record(change)) throw Error("El registro del test no es válido.");
    const row={...current[id]};
    for(const [key, value] of Object.entries(change)){
      if(key!=="pain" && key!=="comment" && key!=="reps" && key!=="loadKg") throw Error("Campo de test no permitido.");
      if((key==="reps"||key==="loadKg") && !attemptIds.has(id)) throw Error("Solo puedes registrar el intento en los tests de 8RM.");
      if(value===null){ delete row[key]; continue; }
      if(key==="comment"){
        if(typeof value!=="string" || value.length>SHOULDER_COMMENT_LIMIT)throw Error("El comentario debe tener como máximo 500 caracteres.");
        if(value.trim()) row.comment=value.trim(); else delete row.comment;
      }else{
        if(typeof value!=="number" || !Number.isFinite(value) || value<0) throw Error("El valor debe ser un número positivo o cero.");
        if(key==="pain" && (!Number.isInteger(value)||value>10))throw Error("Indica un dolor entero entre 0 y 10.");
        if(key==="reps" && (!Number.isInteger(value)||value>100))throw Error("Indica entre 0 y 100 repeticiones enteras.");
        if(key==="loadKg" && value>500)throw Error("La carga del intento debe estar entre 0 y 500 kg.");
        row[key]=value;
      }
    }
    if(Object.keys(row).length) next[id]=row; else delete next[id];
  }
  return next;
}

export function effectivePilotPain(globalPain:PilotPain, feedback:ShoulderTestFeedbackMap, ids:ReadonlySet<string> = allIds):PilotPain {
  const selection=globalPain.painfulTestIds;
  // A partial rating is *not* a declaration that all unreported tests were painless.
  if(!Array.isArray(selection) && !Array.from(ids).every(id=>typeof feedback[id]?.pain==="number")) return {...globalPain};
  const fallback=new Set(selection||[]);
  const painfulTestIds=Array.from(ids).filter(id=>{
    const intensity=feedback[id]?.pain;
    return intensity==null ? fallback.has(id) : intensity>0;
  });
  return {...globalPain,painfulTestIds};
}

// Older rows consist of the global pain object alone. The new version keeps the original binary
// selection apart from the effective list, so later changes do not turn derived pain into history.
export function readPatientInput(json:string|null|undefined): {globalPain:PilotPain; testFeedback:ShoulderTestFeedbackMap}{
  const input:unknown=JSON.parse(json||"{}");
  if(record(input) && input.v===1) return {globalPain:validatePilotPain(input.globalPain),testFeedback:mergeTestFeedback({},input.testFeedback)};
  return {globalPain:validatePilotPain(input),testFeedback:{}};
}
export function writePatientInput(globalPain:PilotPain,testFeedback:ShoulderTestFeedbackMap){
  return JSON.stringify({v:1,globalPain,testFeedback});
}
