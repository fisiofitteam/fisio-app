"use client";
import { SHOULDER_COMMENT_LIMIT, type ShoulderTestFeedback } from "@/lib/shoulder-test-feedback";

export type FeedbackDraft = { pain:string; comment:string; reps:string; loadKg:string };
export function feedbackDraft(row?:ShoulderTestFeedback):FeedbackDraft {
  return {pain:String(row?.pain??""),comment:row?.comment??"",reps:String(row?.reps??""),loadKg:String(row?.loadKg??"")};
}
export function sameFeedback(a:FeedbackDraft,b:FeedbackDraft){
  return a.pain===b.pain && a.comment===b.comment && a.reps===b.reps && a.loadKg===b.loadKg;
}
const kg=(raw:string)=>Number(raw.trim().replace(",","."));
export function feedbackProblem(v:FeedbackDraft):string {
  if(v.reps!=="" && (!/^\d+$/.test(v.reps.trim()) || Number(v.reps)>100))return "Indica entre 0 y 100 repeticiones, sin decimales.";
  if(v.loadKg!=="" && (!/^\d+(?:[.,]\d+)?$/.test(v.loadKg.trim()) || kg(v.loadKg)>500))return "Indica una carga entre 0 y 500 kg.";
  if(v.comment.length>SHOULDER_COMMENT_LIMIT)return "El comentario admite hasta 500 caracteres.";
  return "";
}
export function feedbackValues(v:FeedbackDraft, strength:boolean){
  return {pain:v.pain===""?null:Number(v.pain),comment:v.comment.trim()||null,
    ...(strength?{reps:v.reps===""?null:Number(v.reps),loadKg:v.loadKg===""?null:kg(v.loadKg)}:{})};
}
const style={background:"var(--p-surface-2)",color:"var(--p-text)",border:"1px solid var(--p-border)"};
const field="block rounded-lg py-2 px-3 w-full mt-1";
export function ShoulderPatientTestFeedback({value,change,save,strength,published,locked,dirty,hasAnswer,saving,error}:{
  value:FeedbackDraft; change:(value:FeedbackDraft)=>void; save:()=>void; strength:boolean;published:boolean;locked:boolean;dirty:boolean;hasAnswer:boolean;saving:boolean;error?:string
}){
  if(published && !hasAnswer)return null;
  const problem=feedbackProblem(value);
  return <fieldset disabled={locked} className="rounded-xl p-3 space-y-3" style={{border:"1px solid var(--p-border)"}}>
    <legend className="px-1 text-sm font-semibold">Tus sensaciones en este test</legend>
    <label className="block text-sm">¿Cuánto te ha dolido durante este test?
      <select className={field} style={style} value={value.pain} onChange={e=>change({...value,pain:e.target.value})}>
        <option value="">Sin registrar</option>{Array.from({length:11},(_,i)=><option key={i} value={i}>{i}{i===0?" · Sin dolor":i===10?" · Máximo dolor":""}</option>)}
      </select>
    </label>
    {strength&&<div className="space-y-2">
      <p className="text-sm font-medium">Serie que has hecho con el brazo afectado</p>
      <p className="text-xs" style={{color:"var(--p-text-dim)"}}>Anótala aunque no hayas llegado a ocho repeticiones.</p>
      <div className="grid grid-cols-2 gap-2">
        <label className="text-xs">Repeticiones realizadas<input className={field} style={style} inputMode="numeric" maxLength={3} placeholder="Sin registrar" value={value.reps} onChange={e=>change({...value,reps:e.target.value})}/></label>
        <label className="text-xs">Peso utilizado (kg)<input className={field} style={style} inputMode="decimal" maxLength={10} placeholder="Sin registrar" value={value.loadKg} onChange={e=>change({...value,loadKg:e.target.value})}/></label>
      </div>
    </div>}
    <label className="block text-sm">Comentario (opcional)
      <textarea className={field} style={style} rows={2} maxLength={SHOULDER_COMMENT_LIMIT} placeholder="Por ejemplo: me molestó al final de la serie." value={value.comment} onChange={e=>change({...value,comment:e.target.value})}/>
    </label>
    {!published&&<div className="space-y-1">
      <button type="button" className="rounded-lg px-3 py-2 text-sm font-semibold disabled:opacity-60" style={{background:"var(--p-surface-2)",color:"var(--p-text)",border:"1px solid var(--p-border)"}} disabled={!dirty||!!problem} onClick={save}>{saving?"Guardando…":"Guardar sensaciones"}</button>
      <p aria-live="polite" className="text-xs" style={{color:"var(--p-text-dim)"}}>{error||problem||(dirty?"Cambios sin guardar.":hasAnswer?"Sensaciones guardadas.":"Opcional. Puedes guardarlo aunque no subas vídeo.")}</p>
    </div>}
  </fieldset>;
}
