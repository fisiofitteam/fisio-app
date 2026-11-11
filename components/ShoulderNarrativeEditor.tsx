"use client";
import { useEffect, useRef, useState } from "react";
import { SHOULDER_NARRATIVE_LIMIT, type ShoulderNarrative } from "@/lib/shoulder-narrative";

type Block = keyof ShoulderNarrative;
const labels:Record<Block,string>={
  general:"Perfil general",mobility:"Movilidad",stability:"Estabilidad",endRange:"Fuerza al final del rango",
  coordination:"Coordinación",endurance:"Resistencia",tolerance:"Tolerancia a la carga",
};
const blocks=Object.keys(labels) as Block[];
type Props={
  sessionId:string; version:number; values:ShoulderNarrative; dirty:boolean; disabled:boolean;
  axes:{key:string;label:string;score:number|null}[];
  onChange:(value:ShoulderNarrative)=>void; onConflict:()=>void;
};
export function ShoulderNarrativeEditor({sessionId,version,values,dirty,disabled,axes,onChange,onConflict}:Props) {
  const [proposal,setProposal]=useState<ShoulderNarrative>({});
  const [working,setWorking]=useState(false),[error,setError]=useState(""),[status,setStatus]=useState("");
  const request=useRef<AbortController|null>(null);
  useEffect(()=>()=>request.current?.abort(),[]);
  const pending=blocks.filter(key=>!!proposal[key]);
  const empty=pending.filter(key=>!values[key]?.trim());
  const hasScores=axes.some(a=>a.score!==null);
  async function generate(){
    if(dirty||disabled||request.current||!hasScores)return;
    if(pending.length && !window.confirm("¿Generar nuevas propuestas y descartar las que quedan por revisar? Tus comentarios se conservan."))return;
    const c=new AbortController();request.current=c;setWorking(true);setError("");setStatus("");
    try {
      const res=await fetch("/api/shoulder-pilot/"+encodeURIComponent(sessionId)+"/narrative",{method:"POST",cache:"no-store",headers:{"Content-Type":"application/json"},signal:c.signal,body:JSON.stringify({version})});
      const result=await res.json();
      if(c.signal.aborted)return;
      if(res.status===409){onConflict();throw Error("Ha cambiado la valoración. Recarga los datos antes de generar otra propuesta.");}
      if(!res.ok)throw Error(result.error||"No se han podido generar los comentarios. Puedes redactarlos a mano.");
      if(result.version!==version)throw Error("La propuesta corresponde a otra revisión.");
      const next:ShoulderNarrative={};
      for(const key of blocks){const v=result.proposal?.[key];if(typeof v==="string" && v.trim() && v.length<=SHOULDER_NARRATIVE_LIMIT)next[key]=v.trim();}
      if(!Object.keys(next).length)throw Error("No hay propuestas disponibles. Puedes redactar los comentarios a mano.");
      setProposal(next);setStatus("Propuestas listas. Elige las que quieras incorporar.");
    }catch(e){if(!c.signal.aborted)setError(e instanceof Error?e.message:"No se pudo generar la propuesta.");}
    finally{if(!c.signal.aborted)setWorking(false);if(request.current===c)request.current=null;}
  }
  function discard(keys:Block[]){setProposal(p=>{const next={...p};for(const key of keys)delete next[key];return next;});setStatus("");}
  function accept(keys:Block[]){
    if(disabled||working)return;
    const replace=keys.some(k=>!!values[k]?.trim()&&values[k]!==proposal[k]);
    if(replace&&!window.confirm("¿Sustituir tu comentario por esta propuesta en el borrador?"))return;
    const next={...values};
    keys.forEach(k=>{if(proposal[k])next[k]=proposal[k];});
    onChange(next);discard(keys);setStatus("Comentario incorporado al borrador. Puedes editarlo antes de publicar.");
  }
  function editor(key:Block){
    return <div className="space-y-2">
      {proposal[key]&&<div className="rounded-lg border border-teal-200 bg-teal-50 p-3 text-sm">
        <p className="text-xs font-semibold text-teal-800">Propuesta de la IA</p><p className="mt-1 whitespace-pre-wrap break-words text-neutral-800">{proposal[key]}</p>
        <div className="mt-2 flex flex-wrap gap-4"><button type="button" className="font-semibold text-teal-800 underline" disabled={disabled||working} onClick={()=>accept([key])}>Usar propuesta</button>
          <button type="button" className="underline" disabled={disabled||working} onClick={()=>discard([key])}>Descartar</button></div>
      </div>}
      <label className="block text-sm"><span className="sr-only">Comentario: {labels[key]}</span>
        <textarea className="input block w-full" rows={key==="general"?3:2} maxLength={SHOULDER_NARRATIVE_LIMIT} value={values[key]??""} disabled={disabled}
          placeholder={key==="general"?"¿Qué destacarías del perfil de este atleta?":"¿Qué le dirías al atleta sobre esta capacidad?"}
          onChange={e=>onChange({...values,[key]:e.target.value})}/>
      </label>
    </div>;
  }
  return <section className="card scroll-mt-4 space-y-3" id="comentarios-del-informe" aria-labelledby="titulo-comentarios-del-informe">
    <div><h2 className="font-semibold text-lg" id="titulo-comentarios-del-informe">Comentarios del informe</h2>
      <p className="text-sm text-neutral-600">Explica al atleta qué observas en su perfil y en cada capacidad. Puedes escribir tus comentarios o partir de una propuesta con los resultados guardados.</p></div>
    <div className="flex flex-wrap items-center gap-2">
      <button type="button" className="btn btn-ghost" disabled={working||disabled||dirty||!hasScores} onClick={generate}>{working?"Generando comentarios…":"Proponer comentarios con IA"}</button>
      {empty.length>0&&<button type="button" className="btn btn-ghost" disabled={working||disabled} onClick={()=>accept(empty)}>Completar los comentarios vacíos ({empty.length})</button>}
    </div>
    {dirty?<p className="text-xs text-neutral-600">Guarda el borrador para generar propuestas con los últimos cambios.</p>:!hasScores&&<p className="text-xs text-neutral-600">La propuesta necesita al menos una capacidad valorada. Ya puedes escribir comentarios.</p>}
    {error&&<p role="alert" className="text-sm text-red-700">{error}</p>}{status&&<p role="status" className="text-xs text-teal-800">{status}</p>}
    <div><h3 className="mb-2 font-semibold text-sm">Perfil general</h3>{editor("general")}</div>
    <div className="divide-y divide-neutral-200">{axes.map(a=>{
      if(!Object.hasOwn(labels,a.key)||a.key==="general")return null;
      const key=a.key as Block;
      return <details key={key} className="py-2"><summary className="cursor-pointer text-sm font-semibold">{labels[key]}<span className="ml-2 font-normal text-neutral-600">{a.score===null?"Sin valorar":a.score.toLocaleString("es-ES",{maximumFractionDigits:1})+" / 10"}{proposal[key]?" · Propuesta pendiente":values[key]?.trim()?" · Con comentario":""}</span></summary>
        <div className="mt-2">{editor(key)}</div></details>;
    })}</div>
  </section>;
}
