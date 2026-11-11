"use client";

import { useEffect, useRef, useState } from "react";
import { analyzeShoulderVideo } from "@/lib/shoulder-video-client";
import { canAnalyzeShoulderTest, type ShoulderAIDraft } from "@/lib/shoulder-analysis-types";

type Source = {id:string;testId:string;url:string;uploadedAt:string;sessionId:string};
export function ShoulderVideoProposal({source,initial,consent,onProposal}: {source:Source|null;initial?:Source;consent:boolean;onProposal:(fields:Record<string,number|string>)=>void}) {
  const video=useRef<HTMLVideoElement>(null);
  const work=useRef<AbortController|null>(null), [running,setRunning]=useState(false), [message,setMessage]=useState(""), [error,setError]=useState("");
  const [draft,setDraft]=useState<ShoulderAIDraft|null>(null),[applied,setApplied]=useState(false);
  useEffect(()=>{setDraft(null);setMessage("");setApplied(false);setError("");return ()=>{work.current?.abort();};},[source?.id,source?.uploadedAt]);
  async function analyze(){
    if(!source || running || !consent)return;
    const controller=new AbortController();work.current=controller;
    setRunning(true);setError("");setDraft(null);setApplied(false);setMessage("Preparando vídeo…");
    try {
      const result=await analyzeShoulderVideo({sessionId:source.sessionId,testId:source.testId,videoId:source.id,uploadedAt:source.uploadedAt},s=>{if(!controller.signal.aborted)setMessage(s);},controller.signal);
      if(!controller.signal.aborted)setDraft(result);
    }catch(e){if(!controller.signal.aborted)setError(e instanceof Error?e.message:"No se pudo analizar el vídeo.");}
    finally{if(work.current===controller){work.current=null;setRunning(false);setMessage("");}}
  }
  function seek(sec:number){const v=video.current;if(!v)return;const go=()=>{v.currentTime=Math.max(0,Math.min(sec,Number.isFinite(v.duration)?v.duration:sec));v.pause();};if(v.readyState>=1){go();}else{v.addEventListener("loadedmetadata",go,{once:true});v.load();}}
  if(!source&&!initial)return <p className="text-xs text-neutral-500">Este test todavía no tiene vídeo entregado.</p>;
  return <div className="space-y-2">
    <div className={initial?"grid sm:grid-cols-2 gap-3":""}>
      {initial&&<figure><figcaption className="text-xs text-neutral-500 mb-1">Vídeo inicial · semana 1</figcaption><video controls playsInline preload="none" className="w-full max-w-lg max-h-64 bg-neutral-900 rounded-lg" src={initial.url}/></figure>}
      {source?<figure><figcaption className="text-xs text-neutral-500 mb-1">{initial?"Vídeo del retest":"Vídeo del atleta"}</figcaption><video ref={video} controls playsInline preload="none" className="w-full max-w-lg max-h-64 bg-neutral-900 rounded-lg" src={source.url}/></figure>:<p className="text-sm">Pendiente de vídeo en el retest.</p>}
    </div>
    {source&&canAnalyzeShoulderTest(source.testId)&&<div className="rounded-lg bg-neutral-50 p-3 space-y-2">
      {!running?<button type="button" className="btn btn-ghost" onClick={analyze} disabled={!consent}>{draft?"Volver a analizar el vídeo":"Proponer revisión con IA"}</button>:<div className="flex gap-3 items-center"><span role="status" className="text-xs">{message||"Analizando…"}</span><button type="button" className="text-xs underline" onClick={()=>{work.current?.abort();}}>Cancelar análisis</button></div>}
      {!consent&&<p className="text-xs text-neutral-600">El atleta no ha autorizado el análisis asistido. Puedes revisar el vídeo manualmente.</p>}
      {error&&<p role="alert" className="text-sm text-red-700">{error} Puedes continuar manualmente.</p>}
      {draft&&<div className="text-sm space-y-2"><strong>Propuesta pendiente de verificación</strong>
        {draft.notes&&<p className="whitespace-pre-wrap">{draft.notes}</p>}
        {draft.kind==="hold"&&<dl>{Object.entries(draft.observationFields).map(([key,v])=><div key={key}><dt className="inline">{{holdSeconds:"Sostén",inRangeSeconds:"Por encima de las orejas",unstableSeconds:"Inestabilidad"}[key]??key}: </dt><dd className="inline font-semibold">{v.toLocaleString("es-ES")} s</dd></div>)}</dl>}
        {draft.findings.map((f,i)=><div key={i} className="flex items-start gap-2"><button type="button" className="text-xs font-semibold underline whitespace-nowrap" onClick={()=>seek(f.start)}>Ver {f.start.toFixed(1)} s</button><span>{f.text}</span></div>)}
        {draft.limitations.length>0&&<ul className="list-disc pl-5 text-xs text-neutral-600">{draft.limitations.map((v,i)=><li key={i}>{v}</li>)}</ul>}
        <button type="button" className="btn btn-ghost" disabled={applied || (draft.kind==="hold"?!Object.keys(draft.observationFields).length:!draft.notes.trim())} onClick={()=>{const fields=draft.kind==="hold"?draft.observationFields:{comment:draft.notes};onProposal(fields);setApplied(true);}}>{applied?"Propuesta incorporada. Revisa los datos.":"Incorporar a mi borrador"}</button>
      </div>}
    </div>}
  </div>;
}
