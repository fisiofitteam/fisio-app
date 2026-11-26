"use client";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { CeoBankSnapshot } from "./CeoBankSnapshot";
import { metricDefinitions, metricKeys, priorityStatuses, statusLabels, type MetricKey, type Observation } from "@/lib/ceo-direction-contract";
import type { directionOverview } from "@/lib/ceo-direction";
type Json<T> = T extends Date ? string : T extends Array<infer U> ? Json<U>[] : T extends object ? {[K in keyof T]:Json<T[K]>} : T;
type Data = Json<Awaited<ReturnType<typeof directionOverview>>>;
type Priority = Data["priorities"][number];
const button = "rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm disabled:opacity-50";
const primary = "rounded-lg bg-neutral-900 text-white px-3 py-2 text-sm disabled:opacity-50";
const date = (s: string | null) => s && Number.isFinite(Date.parse(s)) ? new Date(s).toLocaleString("es-ES",{timeZone:"Europe/Madrid",dateStyle:"short",timeStyle:"short"}) : "Sin dato";
const day = (s: string | null) => s?.slice(0,10) || "";
function format(key: MetricKey, value: number | null) {
  if (value === null) return "Sin dato";
  const unit = metricDefinitions[key].unit;
  return value.toLocaleString("es-ES", unit === "EUR" ? {style:"currency",currency:"EUR"} : {maximumFractionDigits:2}) + (unit === "percent" ? "%" : "");
}
function ObservationCell({o}:{o:Observation|undefined}) {
  if(!o)return <td className="p-2">Sin cierre</td>;
  return <td className="p-2 whitespace-nowrap">{format(o.key,o.value)}<span className="block text-neutral-500">{date(o.asOf)} · {o.quality === "available" ? "disponible" : o.quality === "provisional" ? "provisional" : "sin dato vigente"}</span>{o.periodStart&&<span className="block text-neutral-500">{day(o.periodStart)} – {day(o.periodEnd)}</span>}</td>;
}
function Comparison({baseline,outcome}:{baseline:Observation[];outcome:Observation[]}) {
  return <div className="overflow-x-auto"><table className="w-full text-xs text-left"><thead><tr className="border-b"><th className="p-2">Indicador</th><th className="p-2">Al comenzar</th><th className="p-2">Al cerrar</th><th className="p-2">Cambio observado</th></tr></thead><tbody>{baseline.map(a => {
    const b = outcome.find(x => x.key === a.key);
    const reliable = b && a.value !== null && b.value !== null && ![a.quality,b.quality].some(q => q === "stale" || q === "unavailable");
    const same = b && a.asOf === b.asOf;
    const delta = reliable && !same ? b.value! - a.value! : null;
    return <tr key={a.key} className="border-b"><td className="p-2 font-medium">{metricDefinitions[a.key].label}</td><ObservationCell o={a}/><ObservationCell o={b}/><td className="p-2">{same ? "Sin observación nueva" : delta === null ? "No comparable" : metricDefinitions[a.key].unit === "percent" ? `${delta.toLocaleString("es-ES",{maximumFractionDigits:2})} pp` : format(a.key,delta)}</td></tr>;
  })}</tbody></table><p className="mt-2 text-xs text-neutral-500">Compara fotografías y periodos distintos. Los cambios observados no demuestran que esta acción los haya causado. Una previsión sigue siendo provisional.</p></div>;
}
function PriorityCard({item,busy,save}:{item:Priority;busy:boolean;save:(payload:Record<string,unknown>)=>Promise<boolean>}) {
  const [status,setStatus]=useState(item.status),[due,setDue]=useState(day(item.dueDate)),[note,setNote]=useState(item.resultNote);
  useEffect(()=>{setStatus(item.status);setDue(day(item.dueDate));setNote(item.resultNote);},[item.version,item.status,item.dueDate,item.resultNote]);
  const closed = ["done","discarded"].includes(item.status);
  const today = new Intl.DateTimeFormat("en-CA",{timeZone:"Europe/Madrid",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date());
  const overdue = !closed && item.dueDate && day(item.dueDate) < today;
  return <article className="rounded-xl border border-neutral-200 bg-white p-4 space-y-3">
    <div className="flex flex-wrap justify-between gap-2"><h3 className="font-medium text-sm max-w-3xl">{item.title}</h3><span className={"text-xs font-medium "+(overdue?"text-red-700":"text-neutral-600")}>{statusLabels[item.status as keyof typeof statusLabels]}{overdue?" · Plazo vencido":""}</span></div>
    <p className="text-xs text-neutral-500">Añadida {date(item.createdAt)} · <Link className="underline" href={"/fisio/ceo-ia/informes?report="+item.reportId}>Ver informe de origen</Link></p>
    <form className="space-y-3" onSubmit={e=>{e.preventDefault();void save({id:item.id,version:item.version,status,dueDay:due||null,resultNote:note});}}>
      <div className="flex flex-wrap gap-3"><label className="text-xs">Estado<select aria-label={"Estado de "+item.title} className={button+" block mt-1"} value={status} onChange={e=>setStatus(e.target.value)}>{priorityStatuses.map(s=><option key={s} value={s}>{statusLabels[s]}</option>)}</select></label><label className="text-xs">Fecha objetivo (opcional)<input aria-label={"Fecha objetivo de "+item.title} type="date" value={due} onChange={e=>setDue(e.target.value)} className={button+" block mt-1"}/></label></div>
      <label className="block text-xs">Resultado, aprendizaje o bloqueo<textarea className="mt-1 w-full rounded-lg border border-neutral-300 p-3 text-sm" rows={2} maxLength={1800} value={note} required={["done","discarded"].includes(status)} onChange={e=>setNote(e.target.value)} placeholder="Qué has hecho, qué ha ocurrido y qué cambiarías. Sin datos de pacientes ni credenciales."/></label>
      <button className={button} disabled={busy}>Guardar seguimiento</button>
    </form>
    <details><summary className="cursor-pointer text-xs font-medium">Indicadores al iniciar{closed?" y al cerrar":""}</summary><div className="mt-3"><Comparison baseline={item.baseline} outcome={item.outcome}/></div></details>
    <details><summary className="cursor-pointer text-xs font-medium">Historial de cambios ({item.events.length}{item.version>=20?" últimos":""})</summary><ol className="mt-2 space-y-2 text-xs">{item.events.map(event=>{
      let detail:{resultNote?:string;dueDay?:string|null}={};try{detail=JSON.parse(event.detailJson);}catch{}
      return <li className="border-l-2 border-neutral-200 pl-3" key={event.id}><p>{date(event.createdAt)} · {statusLabels[event.status as keyof typeof statusLabels] || event.status} · Revisión {event.version}</p>{detail.dueDay&&<p className="text-neutral-500">Fecha objetivo: {detail.dueDay}</p>}{detail.resultNote&&<p className="mt-1 whitespace-pre-wrap">{detail.resultNote}</p>}</li>;
    })}</ol></details>
  </article>;
}
export function CeoDirectionPanel() {
  const [data,setData]=useState<Data|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState(""),[notice,setNotice]=useState("");
  const [targets,setTargets]=useState<Partial<Record<MetricKey,string>>>({}),[view,setView]=useState("open");
  const retry=useRef<{key:string;id:string}|null>(null);
  const load=useCallback(async()=>{try{const r=await fetch("/api/ceo/direction",{cache:"no-store"});const j=await r.json();if(!r.ok)throw new Error(j.error);setData(j);setTargets(Object.fromEntries(j.targets.map((t:{key:MetricKey;minimum:number})=>[t.key,String(t.minimum)])));setError("");}catch(e){setError(e instanceof Error?e.message:"No disponible.");}},[]);
  useEffect(()=>{void load();},[load]);
  async function submit(method:"POST"|"PATCH"|"PUT",payload:Record<string,unknown>){
    if(busy)return false;setBusy(true);setError("");setNotice("");
    const key=method+JSON.stringify(payload),id=retry.current?.key===key?retry.current.id:crypto.randomUUID();retry.current={key,id};
    try{const body={...payload,...(method==="POST"?{id}:method==="PATCH"?{requestId:id}:{})};const r=await fetch("/api/ceo/direction",{method,headers:{"Content-Type":"application/json"},body:JSON.stringify(body)});const j=await r.json();if(!r.ok)throw new Error(j.error);retry.current=null;await load();setNotice(method==="POST"?"Prioridad incorporada al seguimiento.":method==="PUT"?"Objetivos guardados.":"Seguimiento guardado.");return true;}catch(e){setError(e instanceof Error?e.message:"No se pudo guardar.");return false;}finally{setBusy(false);}
  }
  const shown=data?.priorities.filter(p=>view==="all"||(view==="closed")===["done","discarded"].includes(p.status))||[];
  return <div className="space-y-5 pb-12">
    <header><div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="text-xl font-semibold">Objetivos y seguimiento</h2><p className="text-sm text-neutral-600 mt-1">Objetivos, prioridades y memoria de resultados de FisioFitCross.</p></div><button className={button} disabled={busy} onClick={()=>void load()}>Actualizar</button></div></header>
    <p className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">Tú eliges qué recomendaciones llevar al seguimiento. Registrar una prioridad no ejecuta acciones ni envía instrucciones al equipo.</p>
    {error&&<p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-800">{error}</p>}{notice&&<p role="status" className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">{notice}</p>}
    {!data?<p>{error?"No disponible.":"Cargando dirección…"}</p>:<>
      <CeoBankSnapshot banking={data.banking}/>
      <section className="rounded-xl border bg-white p-4 space-y-4"><h2 className="font-semibold">Objetivos numéricos</h2><p className="text-xs text-neutral-600">Indica el mínimo que quieres alcanzar o conservar. Deja un campo vacío para no vigilar ese indicador. Una cifra ausente o desactualizada nunca se considera cero ni objetivo cumplido.</p>
        <form onSubmit={e=>{e.preventDefault();void submit("PUT",{version:data.settingsVersion,targets:metricKeys.filter(k=>targets[k]?.trim()).map(key=>({key,minimum:Number(targets[key])}))});}}>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">{data.observations.map(o=>{const def=metricDefinitions[o.key],state=data.targetStates.find(t=>t.key===o.key);return <div key={o.key} className="rounded-xl border border-neutral-200 p-3 space-y-2"><label className="text-sm font-medium" htmlFor={"target-"+o.key}>{def.label}</label><p className="text-lg font-semibold tabular-nums">{format(o.key,o.value)}</p><p className="text-xs text-neutral-500">{def.period} · {o.quality==="stale"?"Dato desactualizado":o.quality==="unavailable"?"No disponible":o.quality==="provisional"?"Estimación provisional":"Dato disponible"}</p><p className="text-xs text-neutral-500">{date(o.asOf)}</p><div className="flex items-center gap-2"><span className="text-xs text-neutral-500">Mínimo</span><input id={"target-"+o.key} type="number" min="0" max={def.unit==="percent"?100:100000000} step={def.unit==="count"?1:0.01} value={targets[o.key]||""} onChange={e=>setTargets(p=>({...p,[o.key]:e.target.value}))} className="min-w-0 w-full rounded-lg border p-2 text-sm" placeholder="Sin objetivo"/><span className="text-xs">{def.unit==="EUR"?"€":def.unit==="percent"?"%":""}</span></div>{state&&<p className={"text-xs font-medium "+(state.state==="below"?"text-amber-800":state.state==="met"?"text-emerald-700":"text-neutral-500")}>{state.state==="below"?"Por debajo del objetivo":state.state==="met"?"Dentro del objetivo":"Sin dato vigente para comparar"}</p>}</div>;})}</div>
          <button className={primary+" mt-3"} disabled={busy}>Guardar objetivos</button>
        </form><p className="text-xs text-neutral-500">Los indicadores comerciales proceden del último informe guardado. Los cobros no equivalen al beneficio. Los objetivos y recuentos de seguimiento están disponibles en las métricas agregadas del CEO IA; las notas privadas permanecen aquí.</p>
      </section>
      <section className="rounded-xl border bg-white p-4 space-y-3"><div className="flex flex-wrap justify-between gap-2"><h2 className="font-semibold">Recomendaciones del último informe</h2>{data.report&&<span className="text-xs text-neutral-500">{date(data.report.generatedAt)}</span>}</div>
        {!data.report?.actions.length?<p className="text-sm text-neutral-500">Todavía no hay recomendaciones disponibles.</p>:data.report.actions.map(a=>{const existing=data.priorities.find(p=>p.reportId===data.report!.id&&p.actionIndex===a.index);return <div key={a.index} className="rounded-lg border p-3 flex flex-wrap justify-between items-center gap-3"><p className="text-sm flex-1 min-w-48">{a.title}</p>{existing?<span className="text-xs font-medium text-neutral-600">En seguimiento · {statusLabels[existing.status as keyof typeof statusLabels]}</span>:<button className={button} disabled={busy} onClick={()=>void submit("POST",{reportId:data.report!.id,actionIndex:a.index,dueDay:null})}>Dar seguimiento</button>}</div>;})}
      </section>
      <section className="space-y-3"><div className="flex flex-wrap justify-between items-center gap-3"><div><h2 className="font-semibold">Prioridades y resultados</h2><p className="text-xs text-neutral-500 mt-1">{data.counts.planned+data.counts.in_progress+data.counts.blocked} abiertas · {data.counts.done} completadas · {data.counts.discarded} descartadas</p></div><select aria-label="Filtrar prioridades" className={button} value={view} onChange={e=>setView(e.target.value)}><option value="open">Abiertas</option><option value="closed">Resultados y descartadas</option><option value="all">Todas</option></select></div>
        <p className="text-xs text-neutral-500">Se muestran las últimas 100 abiertas y 50 cerradas. Cada prioridad conserva el informe de origen y el historial de revisiones.</p>
        {shown.map(p=><PriorityCard key={p.id} item={p} busy={busy} save={body=>submit("PATCH",body)}/>)}
        {!shown.length&&<p className="rounded-xl border border-dashed p-5 text-sm text-neutral-500">Sin prioridades en esta vista. Puedes incorporar una recomendación con «Dar seguimiento».</p>}
      </section>
    </>}
  </div>;
}
