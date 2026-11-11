"use client";
import { useEffect, useRef, useState } from "react";
import type { Task } from "./SessionRunner";
import { AssessmentUploader } from "./AssessmentUploader";
import { isShoulderAttemptTest, type ShoulderTestFeedbackMap, type ShoulderTestFeedbackPatch } from "@/lib/shoulder-test-feedback";
import { ShoulderPatientTestFeedback, feedbackDraft, feedbackProblem, feedbackValues, sameFeedback, type FeedbackDraft } from "./ShoulderPatientTestFeedback";
import { ShoulderPilotReport, type PilotReportSnapshot } from "./ShoulderPilotReport";
import { PILOT_TESTS } from "@/lib/shoulder-pilot";
import { SHOULDER_UPLOAD_FLOW } from "@/lib/shoulder-video-policy";
import { parseAssessment } from "@/lib/assessments";
import { patientShoulderTitle } from "@/lib/patient-shoulder-session";

type Load = { affectedKg?: number | null; referenceKg?: number | null };
type Pain = { before?: number | null; after?: number | null; painfulTestIds?: string[] | null };
type State = { version: number; pain: Pain; testFeedback?: ShoulderTestFeedbackMap; legacyPainfulTestIds?: string[] | null; loads: Record<string,Load>; published: PilotReportSnapshot | null; baseline: PilotReportSnapshot | null };
type Change = { pain?: Partial<Pain>; testFeedback?: ShoulderTestFeedbackPatch; loads?: Record<string,Load> };
const legacyPainful = (d:State) => d.legacyPainfulTestIds === undefined ? d.pain.painfulTestIds??null : d.legacyPainfulTestIds;
const surface = { background: "var(--p-surface)", color: "var(--p-text)", border: "1px solid var(--p-border)" };
const actionStyle = { background: "var(--p-accent)", color: "var(--p-accent-ink)" };
const btnClass = "rounded-lg px-3 py-2 text-sm font-semibold disabled:opacity-50";
const dim = { color: "var(--p-text-dim)" };
const inputStyle = { background: "var(--p-surface-2)", color: "var(--p-text)", border: "1px solid var(--p-border)" };
function PainSelect({ text, value, set, disabled }: { text: string; value: string; set: (value:string)=>void; disabled:boolean }) {
  return <label className="block text-sm">{text}
    <select className="block rounded-lg p-2 mt-2 w-full" style={inputStyle} value={value} onChange={e=>set(e.target.value)} disabled={disabled}>
      <option value="">Elige tu nivel de dolor</option>
      {Array.from({length:11},(_,i)=><option key={i} value={i}>{i}{i===0?" · Sin dolor":i===10?" · Máximo dolor":""}</option>)}
    </select>
  </label>;
}

export function ShoulderPatientBattery({sessionId,week,tasks,onBusyChange}: {sessionId:string;week:1|14;tasks:Task[];onBusyChange:(id:string,busy:boolean)=>void}) {
  const url = "/api/shoulder-pilot/"+encodeURIComponent(sessionId);
  const [data,setData] = useState<State|null>(null);
  const [rows,setRows] = useState<{taskId:string;testId:string;url?:string}[]>([]);
  const [loadingRows,setLoadingRows] = useState(true);
  const [rowError,setRowError] = useState(false);
  const [status,setStatus] = useState("");
  const [error,setError] = useState("");
  const [saving,setSaving] = useState(false);
  const savingRef=useRef(false);
  const [drafts,setDrafts] = useState<Record<string,FeedbackDraft>>({});
  const [savingTest,setSavingTest] = useState("");
  const [failedTest,setFailedTest] = useState("");
  const [retry,setRetry] = useState(0);
  const [before,setBefore] = useState("");
  const [after,setAfter] = useState("");
  const [painful,setPainful] = useState<string[]|null>(null);
  const [weights,setWeights] = useState<Record<string,{affectedKg:string;referenceKg:string}>>({});
  const [missedBaseline,setMissedBaseline] = useState(false);
  const [needsRefresh,setNeedsRefresh] = useState(false);
  const tests=tasks.flatMap(task=>parseAssessment(task.assessment).tests.filter(t=>PILOT_TESTS.some(def=>def.id===t.id)).map(t=>({...t,taskId:task.id})));
  const busyCallback = useRef(onBusyChange);
  busyCallback.current = onBusyChange;
  const finalMissing = !data?.published && (data?.pain?.after == null || !Array.isArray(data?.pain?.painfulTestIds));
  const changedWeights = Object.entries(weights).some(([id,w]) => (w.affectedKg===""?null:Number(w.affectedKg))!==(data?.loads?.[id]?.affectedKg??null) || (w.referenceKg===""?null:Number(w.referenceKg))!==(data?.loads?.[id]?.referenceKg??null));
  const changedFeedback=Object.entries(drafts).filter(([id,v])=>!sameFeedback(v,feedbackDraft(data?.testFeedback?.[id])));
  const ungraded=tests.filter(t=>(drafts[t.id]??feedbackDraft(data?.testFeedback?.[t.id])).pain==="");
  const ungradedIds=new Set(ungraded.map(t=>t.id));
  const remainingSelected=painful?.filter(id=>ungradedIds.has(id))??null;
  const previouslyListed=(painful??(data?legacyPainful(data):null)??[]).filter(id=>!ungradedIds.has(id));
  const unsaved = !!data && !data.published && (changedFeedback.length>0 || changedWeights || before !== String(data?.pain?.before??"") || after !== String(data?.pain?.after??"") || JSON.stringify(painful) !== JSON.stringify(legacyPainful(data)));
  const blockCompletion = !data || finalMissing || unsaved || saving || needsRefresh;
  useEffect(() => {
    busyCallback.current("pilot-inputs", blockCompletion);
    return () => busyCallback.current("pilot-inputs", false);
  },[blockCompletion]);
  useEffect(()=>{
    if(!unsaved&&!saving)return;
    const warn=(e:BeforeUnloadEvent)=>{e.preventDefault();e.returnValue="";};
    window.addEventListener("beforeunload",warn);
    return ()=>window.removeEventListener("beforeunload",warn);
  },[unsaved,saving]);
  const count = tests.filter(t=>rows.some(r=>r.taskId===t.taskId&&r.testId===t.id&&r.url)).length;

  async function reloadRows() {
    try {
      const r=await fetch("/api/assessments?sessionId="+encodeURIComponent(sessionId),{cache:"no-store"});
      if(!r.ok)throw Error("No se pudieron cargar tus entregas.");
      setRows(await r.json());setRowError(false);
    } catch(e) {setRowError(true);throw e;}
    finally {setLoadingRows(false);}
  }
  useEffect(()=>{void reloadRows().catch(()=>{});},[sessionId]);
  useEffect(()=>{
    const ctrl=new AbortController();
    setData(null);setError("");setStatus("");setNeedsRefresh(false);
    (async()=>{
      const r=await fetch(url,{cache:"no-store",signal:ctrl.signal});
      if(!r.ok)throw Error("No se pudo abrir la valoración. Vuelve a intentarlo.");
      const state:State=await r.json();
      if(ctrl.signal.aborted)return;
      setData(state);setDrafts({});setFailedTest("");
      setBefore(state.pain?.before==null?"":String(state.pain.before));setAfter(state.pain?.after==null?"":String(state.pain.after));
      setPainful(legacyPainful(state));
      setWeights(Object.fromEntries(Object.entries(state.loads||{}).map(([id,w])=>[id,{affectedKg:w.affectedKg==null?"":String(w.affectedKg),referenceKg:w.referenceKg==null?"":String(w.referenceKg)}])));
    })().catch(e=>{if(!ctrl.signal.aborted)setError(e.message);});
    return ()=>ctrl.abort();
  },[url,retry]);
  async function save(patch:Change,message:string,testId="") {
    if(!data||savingRef.current||needsRefresh)return;
    savingRef.current=true;
    setSavingTest(testId);setFailedTest("");setSaving(true);onBusyChange("pilot-save",true);setError("");setStatus("");
    try{
      const r=await fetch(url,{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({action:"patient",version:data.version,...patch})});
      const state=await r.json();
      if(!r.ok){if(r.status===409)setNeedsRefresh(true);throw Error(state.error||"No se pudo guardar. Inténtalo otra vez.");}
      setData(state);setStatus(message);
      if(patch.pain?.painfulTestIds!==undefined)setPainful(legacyPainful(state));
      if(patch.testFeedback)setDrafts(prev=>Object.fromEntries(Object.entries(prev).filter(([id])=>!Object.hasOwn(patch.testFeedback!,id))));
    }catch(e){setFailedTest(testId);setError(e instanceof Error?e.message:"Error al guardar");}
    finally{savingRef.current=false;setSavingTest("");setSaving(false);onBusyChange("pilot-save",false);}
  }
  const locked=!!data?.published||saving||needsRefresh;
  const started=!!data && (data.pain?.before!=null||missedBaseline||!!data.published||count>0||Object.keys(data.testFeedback??{}).length>0||data.pain?.after!=null);
  const group={rows,loading:loadingRows||rowError,reload:reloadRows};
  const kgEditor=(testId:string)=>{
    if(!isShoulderAttemptTest(testId))return null;
    const w=weights[testId]||{affectedKg:"",referenceKg:""};
    const saved=data?.loads?.[testId];
    const valid=Object.values(w).every(v=>v.trim()===""||Number.isFinite(Number(v))&&Number(v)>=0&&Number(v)<=500);
    const vals={affectedKg:w.affectedKg.trim()===""?null:Number(w.affectedKg),referenceKg:w.referenceKg.trim()===""?null:Number(w.referenceKg)};
    const changed=vals.affectedKg!==(saved?.affectedKg??null)||vals.referenceKg!==(saved?.referenceKg??null);
    return <details className="text-sm"><summary className="cursor-pointer font-medium">Cargas si completaste ocho repeticiones válidas</summary><fieldset disabled={locked} className="mt-2 space-y-2"><legend className="text-xs">Carga del 8RM para comparar ambos brazos (kg)</legend>
      <div className="grid grid-cols-2 gap-2">{(["affectedKg","referenceKg"] as const).map(key=><label key={key} className="text-xs">{key==="affectedKg"?"Brazo afectado":"Brazo de referencia"}
        <input className="block rounded-lg p-2 mt-1 w-full" style={inputStyle} type="number" inputMode="decimal" step="any" min="0" max="500" placeholder="Sin registrar" value={w[key]} onChange={e=>setWeights(p=>({...p,[testId]:{...w,[key]:e.target.value}}))}/>
      </label>)}</div>
      {!data?.published&&<button type="button" disabled={!changed||!valid} className={btnClass} style={actionStyle} onClick={()=>save({loads:{[testId]:vals}},"Cargas guardadas.")}>Guardar cargas</button>}
    </fieldset></details>;
  };
  const testInputs=(id:string)=>{
    if(!PILOT_TESTS.some(t=>t.id===id))return null;
    const saved=data?.testFeedback?.[id],current=feedbackDraft(saved),value=drafts[id]??current;
    const strength=isShoulderAttemptTest(id);
    return <>
      <ShoulderPatientTestFeedback value={value} change={v=>setDrafts(prev=>({...prev,[id]:v}))} strength={strength} published={!!data?.published} locked={locked}
        hasAnswer={!!saved&&Object.keys(saved).length>0} dirty={!sameFeedback(value,current)} saving={savingTest===id} error={failedTest===id?error:undefined}
        save={()=>save({testFeedback:{[id]:feedbackValues(value,strength)}},"Sensaciones del test guardadas.",id)}/>
      {kgEditor(id)}
    </>;
  };
  const invalidFeedback=changedFeedback.some(([,v])=>!!feedbackProblem(v));
  function finish(){
    if(after===""||(ungraded.length>0&&remainingSelected===null)||invalidFeedback)return;
    const fields=Object.fromEntries(changedFeedback.map(([id,v])=>[id,feedbackValues(v,isShoulderAttemptTest(id))]));
    // Keep the historical selections, including hidden ones: individually graded tests
    // take precedence on the server. Never write a derived pain intensity to the fallback.
    void save({pain:{after:Number(after),...(ungraded.length?{painfulTestIds:painful!}:{})},
      ...(changedFeedback.length?{testFeedback:fields}:{})},"Respuesta final y sensaciones guardadas.");
  }
  return <section id="valoracion-hombro" className="rounded-2xl p-4 space-y-4" style={surface}>
    <div><div className="text-xs font-semibold" style={dim}>Semana {week} · Hombro</div><h2 className="font-bold text-xl">{patientShoulderTitle(week)}</h2>
      <p className="text-sm mt-1" style={dim}>{tasks.length} bloques · {tests.length} pruebas{loadingRows||rowError?"":" · "+count+" vídeos entregados"}</p></div>
    {!data&&!error&&<p role="status" className="text-sm">Cargando tu valoración…</p>}
    {error&&<p role="alert" className="text-sm">{error}</p>}
    {(!data&&error||needsRefresh)&&<button type="button" className={btnClass} style={actionStyle} onClick={()=>{if(!unsaved||window.confirm("¿Recargar y descartar los cambios sin guardar?"))setRetry(n=>n+1);}}>Volver a cargar los datos guardados</button>}
    {rowError&&<button type="button" className={btnClass} style={actionStyle} onClick={()=>void reloadRows().catch(()=>{})}>Reintentar carga de entregas</button>}
    {data?.published&&<ShoulderPilotReport report={data.published} previous={week===14?data.baseline:null}/>}
    {data&&<>
      {!data.published&&<section className="space-y-2">
        <h3 className="font-semibold">Antes de empezar</h3>
        <PainSelect text="¿Cuánto te duele el hombro antes del primer test, del 0 al 10?" value={before} set={setBefore} disabled={locked||data.pain?.after!=null}/>
        {data.pain?.before==null&&data.pain?.after!=null?<p className="text-xs" style={dim}>Dolor inicial no registrado.</p>:<button type="button" disabled={locked||before===""||Number(before)===data.pain?.before||data.pain?.after!=null} className={btnClass} style={actionStyle} onClick={()=>save({pain:{before:Number(before)}},"Dolor inicial guardado.")}>{before!==""&&Number(before)===data.pain?.before?"Dolor inicial guardado":"Guardar dolor inicial"}</button>}
        {!started&&<button type="button" className="text-xs underline block" onClick={()=>setMissedBaseline(true)}>Ya empecé y no anoté mi dolor inicial</button>}
      </section>}
      {started&&<>
        <p className="text-xs" style={dim}>Abre cada bloque para anotar cuánto te ha dolido cada prueba y dejar un comentario. Puedes subir el vídeo más tarde. Recorta cada uno a un minuto como máximo (hasta 1 GB) y mantén abierta la pantalla hasta que termine la subida.</p>
        {tasks.map((t,i)=>{
          const ts=parseAssessment(t.assessment).tests;
          const received=ts.filter(x=>rows.some(r=>r.taskId===t.id&&r.testId===x.id&&r.url)).length;
          return <details key={t.id} className="border rounded-xl p-3" style={{borderColor:"var(--p-border)"}}>
            <summary className="cursor-pointer font-semibold text-sm">{i+1}. {t.title}<span className="text-xs font-normal ml-1" style={dim}>{loadingRows||rowError?"":received+" / "+ts.length}</span></summary>
            <div className="mt-3"><AssessmentUploader sessionId={sessionId} task={t} group={group} uploadFlow={SHOULDER_UPLOAD_FLOW} readOnly={!!data.published} renderExtra={testInputs} onBusyChange={b=>onBusyChange(t.id,b)}/></div>
          </details>;
        })}
        {!data.published&&<section className="space-y-3">
          <h3 className="font-semibold">Al terminar las pruebas</h3>
          <p className="text-xs" style={dim}>Registra cómo te encuentras aunque te quede algún vídeo por subir.</p>
          <PainSelect text="¿Cuánto te duele el hombro ahora, del 0 al 10?" value={after} set={setAfter} disabled={locked}/>
          <p className="text-xs" style={dim}>Dolor indicado en {tests.length-ungraded.length} de {tests.length} pruebas. Las que puntúes no hace falta marcarlas otra vez.</p>
          {ungraded.length>0&&<details className="rounded-xl p-3" style={{border:"1px solid var(--p-border)"}} open={legacyPainful(data)===null}>
            <summary className="text-sm font-medium cursor-pointer">Pruebas sin intensidad de dolor ({ungraded.length})</summary>
            <fieldset disabled={locked} className="mt-2 space-y-2"><legend className="text-sm">De las demás pruebas que has hecho, ¿te ha dolido alguna?</legend>
              <label className="flex gap-2 items-center text-sm"><input type="checkbox" checked={remainingSelected!==null&&remainingSelected.length===0} onChange={e=>setPainful(e.target.checked?previouslyListed:null)}/>Ninguna de las restantes</label>
              {ungraded.map(t=><label key={t.id} className="flex gap-2 items-start text-sm"><input type="checkbox" className="mt-1" checked={remainingSelected?.includes(t.id)??false} onChange={e=>{const arr=e.target.checked?[...(remainingSelected??[]),t.id]:(remainingSelected??[]).filter(id=>id!==t.id);setPainful(arr.length?[...previouslyListed,...arr]:null);}}/>{t.name}</label>)}
            </fieldset>
          </details>}
          {invalidFeedback&&<p role="alert" className="text-sm">Revisa las repeticiones o el peso indicados antes de guardar.</p>}
          <button type="button" className={btnClass} style={actionStyle} disabled={locked||after===""||(ungraded.length>0&&remainingSelected===null)||invalidFeedback} onClick={finish}>Guardar respuesta final</button>
        </section>}
      </>}
      <p role="status" className="text-xs" aria-live="polite">{saving?"Guardando…":unsaved?"Hay cambios sin guardar.":status}</p>
      {!data.published&&started&&<p className="text-xs" style={dim}>Tu perfil aparecerá aquí cuando tu fisio publique la valoración.</p>}
    </>}
  </section>;
}
