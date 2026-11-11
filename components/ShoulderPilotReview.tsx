"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { PILOT_TESTS, scorePilot, type PilotConfig, type PilotObservations, type PilotPain } from "@/lib/shoulder-pilot";
import { ShoulderPilotReport, pilotNumber, type PilotReportSnapshot } from "@/components/ShoulderPilotReport";
import type { ShoulderTestFeedbackMap } from "@/lib/shoulder-test-feedback";
import { ShoulderTestFeedbackReadout, ShoulderTestPainOverview } from "@/components/ShoulderTestFeedbackDisplay";
import { ShoulderVideoProposal } from "@/components/ShoulderVideoProposal";

import { canAnalyzeShoulderTest } from "@/lib/shoulder-analysis-types";
import { pendingSources, proposalConflicts, revisionKey, type ShoulderVideoSource } from "@/lib/shoulder-analysis-queue";
import { useShoulderVideoQueue } from "@/components/useShoulderVideoQueue";

type Video=ShoulderVideoSource & {taskId:string};
type Data={sessionId:string;weekNumber:number;scheduledDate:string;assignmentId:string;patientId:string;patientName:string;
  observations:PilotObservations;loads:PilotObservations;reviewedTestIds:string[];notAssessable?:Record<string,string>;pain:PilotPain;
  testFeedback?:ShoulderTestFeedbackMap;videos:Video[];baselineVideos?:Video[];initialFormContext:{label:string,value:string}[];aiReviewBlocked?:boolean;version:number;
  published:PilotReportSnapshot|null;baseline:PilotReportSnapshot|null;config:PilotConfig};
const groups=[...new Set(PILOT_TESTS.map(t=>t.group))];
function mergeInputs(d:Data):PilotObservations {
  const merged:PilotObservations={...d.observations};for(const [id,fields] of Object.entries(d.loads??{}))merged[id]={...fields,...merged[id]};return merged;
}

export function ShoulderPilotReview({sessionId}:{sessionId:string}) {
  return <ReviewSession key={sessionId} sessionId={sessionId}/>;
}
function ReviewSession({sessionId}:{sessionId:string}) {
  const ai=useShoulderVideoQueue();
  const [includeReviewed,setIncludeReviewed]=useState(false);
  const [data,setData]=useState<Data|null>(null),[facts,setFacts]=useState<PilotObservations>({}),[checked,setChecked]=useState<string[]>([]),[skip,setSkip]=useState<Record<string,string>>({});
  const [dirty,setDirty]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState(""),[notice,setNotice]=useState(""),[conflict,setConflict]=useState(false);
  const apply=useCallback((value:Data)=>{setData(value);setFacts(mergeInputs(value));setChecked(value.reviewedTestIds??[]);setSkip(value.notAssessable??{});setDirty(false);setConflict(false);},[]);
  const load=useCallback(async(signal?:AbortSignal)=>{
    setError("");
    try{const r=await fetch("/api/shoulder-pilot/"+encodeURIComponent(sessionId),{cache:"no-store",signal});const d=await r.json();if(!r.ok)throw Error(d.error||"No se pudo cargar la valoración.");if(!signal?.aborted)apply(d);}
    catch(e){if(!signal?.aborted)setError(e instanceof Error?e.message:"No se pudo cargar la valoración.");}
  },[sessionId,apply]);
  useEffect(()=>{const c=new AbortController();load(c.signal);return()=>c.abort();},[load]);
  useEffect(()=>{if(!dirty)return;const warn=(e:BeforeUnloadEvent)=>{e.preventDefault();e.returnValue="";};window.addEventListener("beforeunload",warn);return()=>window.removeEventListener("beforeunload",warn);},[dirty]);
  function edited(id:string){setChecked(prev=>prev.filter(t=>t!==id));setDirty(true);setNotice("");}
  function patchFields(id:string, values:Record<string,string|number|null>){setFacts(prev=>({...prev,[id]:{...prev[id],...values}}));edited(id);}
  async function persist(action:"save"|"publish"){
    if(!data||busy||ai.active)return;setBusy(true);setError("");setNotice("");
    try{const versions=Object.fromEntries(data.videos.filter(v=>v.uploadedAt&&v.url).map(v=>[v.testId,v.id+"@"+v.uploadedAt]));
      const obs=Object.fromEntries(Object.entries(facts).filter(([id])=>!(id in skip)).map(([id,values])=>[id,Object.fromEntries(Object.entries(values).filter(([,v])=>v!==""&&v!=null))]));
      const r=await fetch("/api/shoulder-pilot/"+encodeURIComponent(data.sessionId),{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify(action==="publish"?{action,version:data.version}:{action,version:data.version,observations:obs,reviewedTestIds:checked,notAssessable:skip,videoVersions:versions})});
      const d=await r.json();if(!r.ok){if(r.status===409)setConflict(true);throw Error(d.error||"No se han podido guardar los cambios.");}
      apply(d);setNotice(action==="publish"?"Informe publicado. El atleta ya puede verlo en su valoración.":"Borrador guardado.");
    }catch(e){setError(e instanceof Error?e.message:"No se ha podido guardar.");}finally{setBusy(false);}
  }
  if(!data)return <div className="card p-4">{error?<><p role="alert">{error}</p><button type="button" className="mt-3 btn btn-ghost" onClick={()=>load()}>Volver a intentar</button></>:<p role="status">Cargando valoración…</p>}</div>;
  const measured=Object.fromEntries(Object.entries(facts).filter(([id])=>!(id in skip)));
  const scores=scorePilot(measured,data.pain,data.config);
  const done=PILOT_TESTS.filter(t=>checked.includes(t.id)).length;
  const date=new Date(data.scheduledDate).toLocaleDateString("es-ES",{timeZone:"Europe/Madrid",day:"numeric",month:"long",year:"numeric"});
  const ready=done===PILOT_TESTS.length && !dirty && !busy&&!conflict&&!ai.active;
  const received=new Set(data.videos.filter(v=>v.url&&v.uploadedAt).map(v=>v.testId)).size;
  const eligible=pendingSources(data.videos,sessionId,[],skip,ai.entries,!!data.aiReviewBlocked);
  const hasReviewedVideos=eligible.some(s=>checked.includes(s.testId));
  const pending=includeReviewed?eligible:eligible.filter(s=>!checked.includes(s.testId));
  const successful=Object.values(ai.outcomes).filter(state=>state==="ready").length;
  const failed=Object.values(ai.outcomes).filter(state=>state==="error").length;
  function openTest(id:string){
    const card=document.getElementById("test-"+id) as HTMLDetailsElement|null;
    if(card){card.open=true;card.querySelector("summary")?.focus();card.scrollIntoView({block:"start"});}
  }
  return <main className="space-y-4 max-w-4xl">
    <Link href={"/fisio/paciente/"+data.patientId+"/info/evolucion"} className="text-sm text-neutral-600 hover:underline" onClick={e=>{if(dirty&&!window.confirm("¿Salir sin guardar los cambios del borrador?"))e.preventDefault();}}>← Evolución de {data.patientName}</Link>
    <header className="card space-y-2"><p className="text-xs font-semibold uppercase tracking-wider text-neutral-500">Perfil de hombro · {date}</p><h1 className="font-bold text-2xl">{data.weekNumber===14?"Revaloración · semana 14":"Valoración inicial · semana 1"}</h1>
      <p className="text-sm">{data.patientName} · {received}/{PILOT_TESTS.length} vídeos recibidos · {done}/{PILOT_TESTS.length} tests revisados</p>
      <p className="text-sm text-neutral-600">{data.published?"El paciente ve la última versión publicada. Para compartir correcciones, guarda y vuelve a publicar.":"Este borrador es privado. El atleta verá el perfil cuando lo publiques."}</p>
      <div className="mt-3 border-t border-neutral-200 pt-3 space-y-2">
        <div className="flex flex-wrap gap-2 items-center">
          <button type="button" className="btn btn-accent" disabled={!!ai.active||busy||conflict||!pending.length} onClick={()=>ai.run(pending)}>Revisar todo con IA</button>
          {ai.active&&<button type="button" className="btn btn-ghost" onClick={ai.stop}>Detener</button>}
          <span className="text-sm text-neutral-600" role="status">{ai.active?"Analizando vídeo "+ai.active.index+" de "+ai.active.total+" · "+ai.active.message:ai.lastRun.length?(ai.stopped?"Análisis detenido. ":"")+successful+" de "+ai.lastRun.length+" con propuesta"+(failed?" · "+failed+" con error":""):pending.length?pending.length+(pending.length===1?" vídeo pendiente":" vídeos pendientes"):"Sin vídeos compatibles pendientes"}</span>
        </div>
        {hasReviewedVideos&&<label className="flex gap-2 items-center text-sm"><input type="checkbox" checked={includeReviewed} disabled={!!ai.active} onChange={e=>setIncludeReviewed(e.target.checked)}/>Incluir tests ya revisados</label>}
        <p className="text-xs text-neutral-600">Las propuestas aparecen en cada test para que puedas contrastarlas e incorporarlas a tu borrador. El análisis conserva tus anotaciones.</p>
        {ai.lastRun.length>0&&<ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs">{ai.lastRun.map(v=>{
          const k=revisionKey(v),entry=ai.entries[k],current=ai.active?.key===k;
          return <li key={k}><button type="button" className="underline text-left" onClick={()=>openTest(v.testId)}>{PILOT_TESTS.find(t=>t.id===v.testId)?.name}: {current?"analizando":ai.outcomes[k]==="error"?"ver error":ai.outcomes[k]==="ready"?(entry?.applied?"incorporada":"ver propuesta"):ai.active?"en cola":"pendiente"}</button></li>;
        })}</ul>}
      </div>
    </header>
    <section className="card space-y-2"><h2 className="font-semibold">Dolor y respuesta a la carga</h2>
      <div className="grid sm:grid-cols-3 gap-2 text-sm"><p>Antes: <b>{pilotNumber(data.pain.before)}</b></p><p>Después: <b>{pilotNumber(data.pain.after)}</b></p><p>Tests dolorosos: <b>{data.pain.painfulTestIds==null?"Pendiente":data.pain.painfulTestIds.length}</b></p></div>
      <ShoulderTestPainOverview current={data} openTest={openTest}/>
      {!!data.initialFormContext?.length&&<details className="text-sm"><summary className="cursor-pointer font-medium">Contexto del formulario inicial</summary><dl className="mt-2">{data.initialFormContext.map((c,i)=><div key={i} className="mt-1"><dt className="font-medium">{c.label}</dt><dd className="whitespace-pre-wrap text-neutral-600">{c.value}</dd></div>)}</dl></details>}
    </section>
    <fieldset disabled={busy} className="min-w-0 space-y-4">
    {groups.map(group=><section key={group} className="card"><h2 className="font-semibold mb-2">{group}</h2><div className="divide-y divide-neutral-200">{PILOT_TESTS.filter(t=>t.group===group).map(t=>{
      const source=data.videos.find(v=>v.sessionId===sessionId&&v.testId===t.id&&v.url&&v.uploadedAt)??null, initial=data.baselineVideos?.find(v=>v.testId===t.id&&v.url&&v.uploadedAt);
      const s=scores.tests[t.id], disabledTest=t.id in skip,reviewed=checked.includes(t.id);
      const canCheck=disabledTest?!!skip[t.id]?.trim():!!s&&!s.missing;
      const videoKey=source?revisionKey(source):"",aiEntry=ai.entries[videoKey],manualOnly=!!(source?.aiReviewBlocked||data.aiReviewBlocked);
      return <details className="py-3 scroll-mt-4" key={t.id} id={"test-"+t.id}><summary className="cursor-pointer font-medium text-sm">{t.name} <span className="ml-2 text-xs font-normal text-neutral-500">{reviewed?"Revisado":disabledTest?"Sin valorar":s?.missing?"Pendiente":"Por verificar"}{t.kind==="numeric"&&s?.score!=null?" · "+pilotNumber(s.score)+"/10":""}{aiEntry?.draft&&!aiEntry.applied&&!manualOnly&&!disabledTest?" · Propuesta IA":""}</span></summary>
        <div className="mt-3 space-y-3">
          <div className="rounded-lg border-l-2 border-teal-600 bg-neutral-50 p-3">
            <h3 className="text-xs font-semibold">Lo que registró el atleta</h3>
            {(t.key==="press8rm"||t.key==="facePull8rm") && <p className="text-xs text-neutral-600">Intento con el brazo afectado. La carga válida para el 8RM se revisa aparte.</p>}
            <ShoulderTestFeedbackReadout id={t.id} current={data} previous={data.weekNumber===14?data.baseline:null} retest={data.weekNumber===14}/>
          </div>
          <ShoulderVideoProposal key={videoKey||t.id} source={source} initial={initial} disabled={disabledTest||manualOnly}
            entry={aiEntry} conflict={conflict} batchBusy={!!ai.active||conflict} progress={ai.active?.key===videoKey?ai.active.message:undefined} onCancel={ai.stop}
            onAnalyze={()=>{if(source&&!manualOnly&&!disabledTest&&!conflict)ai.run([source]);}}
            onProposal={fs=>{
              if(!source||manualOnly||disabledTest||conflict)return;
              if((reviewed||proposalConflicts(facts[t.id],fs))&&!window.confirm("¿Incorporar esta propuesta y sustituir los valores de esos campos? Tendrás que volver a verificar el test."))return;
              patchFields(t.id,fs);ai.applied(source);
            }}/>
          {source&&manualOnly&&canAnalyzeShoulderTest(t.id)&&<p className="text-xs text-neutral-600">Este vídeo está disponible para revisión manual.</p>}
          {data.baseline&&<details className="text-xs text-neutral-600"><summary className="cursor-pointer font-medium">Resultado de la valoración inicial</summary><p className="mt-1 whitespace-pre-wrap">{t.kind==="qualitative"?String(data.baseline.observations[t.id]?.comment??data.baseline.notAssessable?.[t.id]??"Sin valorar"):pilotNumber(data.baseline.scores.tests[t.id]?.score)}</p></details>}
          <label className="flex items-center gap-2 text-xs"><input type="checkbox" disabled={!!ai.active} checked={disabledTest} onChange={e=>{const val=e.target.checked;setSkip(prev=>{const n={...prev};if(val)n[t.id]="";else delete n[t.id];return n;});edited(t.id);}}/>No se puede valorar este test</label>
          {disabledTest?<label className="block text-sm">Motivo que verá el atleta<input className="input mt-1" value={skip[t.id]} maxLength={500} onChange={e=>{const v=e.target.value;setSkip(p=>({...p,[t.id]:v}));edited(t.id);}} /></label>:<>
            {(t.key==="press8rm"||t.key==="facePull8rm")&&<p className="text-xs text-neutral-600">Contrasta los kg declarados por el atleta con su entrega. La carga del brazo no grabado se registra como declarada.</p>}
            <div className="grid gap-3 sm:grid-cols-2">{t.fields.map(f=>{
              const value=facts[t.id]?.[f.key]??"";
              const binary=/^r[123](Smooth|Symmetric|NoShrug)$/.test(f.key);
              return <label key={f.key} className={"text-sm "+(f.type==="text"?"sm:col-span-2":"")}>
                <span className="font-medium">{f.label}</span>
                {binary?<select className="input block mt-1" value={value} onChange={e=>patchFields(t.id,{[f.key]:e.target.value===""?null:Number(e.target.value)})}><option value="">Sin valorar</option><option value="1">Sí</option><option value="0">No</option></select>:f.type==="text"?<textarea className="input mt-1" rows={4} value={value} onChange={e=>patchFields(t.id,{[f.key]:e.target.value})}/>:<input className="input mt-1" type="number" inputMode="decimal" min={f.min} max={f.max} step={f.step??"any"} value={value} onChange={e=>patchFields(t.id,{[f.key]:e.target.value===""?null:e.target.valueAsNumber})}/>}
                {f.help&&<span className="block text-xs text-neutral-500 mt-1">{f.help}</span>}
              </label>;
            })}</div>
          </>}
          <label className={"flex items-center gap-2 rounded-lg bg-neutral-50 p-3 text-sm font-medium "+(!canCheck?"opacity-60":"")}><input type="checkbox" checked={reviewed} disabled={!!ai.active||(!canCheck&&!reviewed)} onChange={e=>{const val=e.target.checked;setChecked(p=>[...p.filter(x=>x!==t.id),...(val?[t.id]:[])]);setDirty(true);setNotice("");}}/>He revisado este test</label>
        </div></details>;})}</div></section>)}
    </fieldset>
    <details className="card"><summary className="cursor-pointer font-semibold">Vista previa del perfil que verá el atleta</summary><div className="mt-3"><ShoulderPilotReport report={{weekNumber:data.weekNumber,publishedAt:"",rubricVersion:data.published?.rubricVersion??"",observations:measured,pain:data.pain,testFeedback:data.testFeedback,notAssessable:skip,scores}} previous={data.baseline}/></div></details>
    <section className="card space-y-3 sticky bottom-2 shadow-lg z-10">
      {error&&<p role="alert" className="text-red-700 text-sm">{error}</p>}{notice&&<p role="status" className="text-sm">{notice}</p>}
      <div className="flex flex-wrap items-center gap-2"><span className="mr-auto text-xs text-neutral-600">{done}/{PILOT_TESTS.length} revisados{dirty?" · Cambios sin guardar":""}</span>
        {conflict&&<button type="button" className="btn btn-ghost" onClick={()=>{if(!dirty||window.confirm("¿Recargar y descartar los cambios locales?"))load();}}>Recargar cambios</button>}
        <button type="button" className="btn btn-ghost" disabled={busy||!!ai.active||!dirty||conflict} onClick={()=>persist("save")}>Guardar borrador</button>
        <button type="button" className="btn btn-accent" disabled={!ready} onClick={()=>{if(window.confirm("¿Publicar este informe revisado para "+data.patientName+"?"))persist("publish");}}>{data.published?"Actualizar informe publicado":"Publicar para el atleta"}</button></div>
    </section>
  </main>;
}
