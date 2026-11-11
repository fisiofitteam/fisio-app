"use client";

import { useRef } from "react";
import { canAnalyzeShoulderTest } from "@/lib/shoulder-analysis-types";
import type { ProposalEntry, ShoulderVideoSource as Source } from "@/lib/shoulder-analysis-queue";

type Props={source:Source|null;initial?:Source;entry?:ProposalEntry;disabled:boolean;conflict:boolean;batchBusy:boolean;progress?:string;
  onAnalyze:()=>void;onCancel:()=>void;onProposal:(fields:Record<string,number|string>)=>void};
const holdLabels:Record<string,string>={holdSeconds:"Sostén",inRangeSeconds:"Por encima de las orejas",positionLossSeconds:"Pérdida de posición o recolocación"};

export function ShoulderVideoProposal({source,initial,entry,disabled,conflict,batchBusy,progress,onAnalyze,onCancel,onProposal}:Props) {
  const video=useRef<HTMLVideoElement>(null);
  const draft=entry?.draft;
  function seek(sec:number){const v=video.current;if(!v)return;const go=()=>{v.currentTime=Math.max(0,Math.min(sec,Number.isFinite(v.duration)?v.duration:sec));v.pause();};if(v.readyState>=1){go();}else{v.addEventListener("loadedmetadata",go,{once:true});v.load();}}
  if(!source&&!initial)return <p className="text-xs text-neutral-500">Este test todavía no tiene vídeo entregado.</p>;
  return <div className="space-y-2">
    <div className={initial?"grid sm:grid-cols-2 gap-3":""}>
      {initial&&<figure><figcaption className="text-xs text-neutral-500 mb-1">Vídeo inicial · semana 1</figcaption><video controls playsInline preload="none" className="w-full max-w-lg max-h-64 bg-neutral-900 rounded-lg" src={initial.url}/></figure>}
      {source?<figure><figcaption className="text-xs text-neutral-500 mb-1">{initial?"Vídeo del retest":"Vídeo del atleta"}</figcaption><video ref={video} controls playsInline preload="none" className="w-full max-w-lg max-h-64 bg-neutral-900 rounded-lg" src={source.url}/></figure>:<p className="text-sm">Pendiente de vídeo en el retest.</p>}
    </div>
    {source&&canAnalyzeShoulderTest(source.testId)&&!disabled&&<div className="rounded-lg bg-neutral-50 p-3 space-y-2">
      {progress?<div className="flex gap-3 items-center"><span role="status" className="text-xs">{progress}</span><button type="button" className="text-xs underline" onClick={onCancel}>Detener análisis</button></div>:<button type="button" className="btn btn-ghost" onClick={onAnalyze} disabled={batchBusy}>{draft?"Volver a analizar el vídeo":"Proponer revisión con IA"}</button>}
      {entry?.error&&<p role="alert" className="text-sm text-red-700">{entry.error} Puedes continuar manualmente.</p>}
      {draft&&<div className="text-sm space-y-2"><strong>Propuesta pendiente de verificación</strong>
        {draft.notes&&<p className="whitespace-pre-wrap">{draft.notes}</p>}
        {draft.kind==="hold"&&<dl>{Object.entries(draft.observationFields).map(([key,v])=><div key={key}><dt className="inline">{holdLabels[key]??key}: </dt><dd className="inline font-semibold">{v.toLocaleString("es-ES")} s</dd></div>)}</dl>}
        {draft.findings.map((f,i)=><div key={i} className="flex items-start gap-2"><button type="button" className="text-xs font-semibold underline whitespace-nowrap" onClick={()=>seek(f.start)}>Ver {f.start.toFixed(1)} s</button><span>{f.text}</span></div>)}
        {draft.limitations.length>0&&<ul className="list-disc pl-5 text-xs text-neutral-600">{draft.limitations.map((v,i)=><li key={i}>{v}</li>)}</ul>}
        <button type="button" className="btn btn-ghost" disabled={conflict || entry?.applied || (draft.kind==="hold"?!Object.keys(draft.observationFields).length:!draft.notes.trim())} onClick={()=>onProposal(draft.kind==="hold"?draft.observationFields:{comment:draft.notes})}>{entry?.applied?"Propuesta incorporada. Revisa los datos.":"Incorporar a mi borrador"}</button>
      </div>}
    </div>}
  </div>;
}
