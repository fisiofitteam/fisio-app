"use client";

import { useRef } from "react";
import { AssessmentVideoPlayer, type AssessmentPlayback } from "@/components/AssessmentVideoPlayer";
import { canAnalyzeShoulderTest } from "@/lib/shoulder-analysis-types";
import { PILOT_TEST_BY_ID } from "@/lib/shoulder-pilot";
import { proposalFields, type ProposalEntry, type ShoulderVideoSource as Source } from "@/lib/shoulder-analysis-queue";

type Props={source:Source|null;initial?:Source;entry?:ProposalEntry;disabled:boolean;conflict:boolean;batchBusy:boolean;progress?:string;
  onAnalyze:()=>void;onCancel:()=>void;onProposal:(fields:Record<string,number|string>)=>void};
const holdLabels:Record<string,string>={holdSeconds:"Sostén",positionLossSeconds:"Pérdida de posición o recolocación"};

export function ShoulderVideoProposal({source,initial,entry,disabled,conflict,batchBusy,progress,onAnalyze,onCancel,onProposal}:Props) {
  const video=useRef<AssessmentPlayback>(null);
  const draft=entry?.draft;
  const numericDraft=draft?.kind==="hold"||draft?.kind==="measurement";
  const testFields=draft?PILOT_TEST_BY_ID[draft.testId]?.fields??[]:[];
  const proposedFields=draft?proposalFields(draft):{};
  const proposedNumbers=Object.entries(proposedFields).filter((entry):entry is [string,number]=>typeof entry[1]==="number");
  const pendingNumbers=testFields.filter(f=>f.type==="number"&&typeof proposedFields[f.key]!=="number"&&
    !(f.key==="abduction"&&typeof proposedFields.externalDeficit==="number"&&proposedFields.externalDeficit>0));
  const commentOnly=!!proposedFields.comment&&!proposedNumbers.length;
  const hasProposal=Object.keys(proposedFields).length>0;
  if(!source&&!initial)return <p className="text-xs text-neutral-500">Este test todavía no tiene vídeo entregado.</p>;
  return <div className="space-y-2">
    <div className={initial?"grid sm:grid-cols-2 gap-3":""}>
      {initial&&<figure className="max-w-lg"><figcaption className="text-xs text-neutral-500 mb-1">Vídeo inicial · semana 1</figcaption><AssessmentVideoPlayer label="Vídeo inicial de la semana 1" className="w-full max-h-64 bg-neutral-900 rounded-lg" src={initial.url}/></figure>}
      {source?<figure className="max-w-lg"><figcaption className="text-xs text-neutral-500 mb-1">{initial?"Vídeo del retest":"Vídeo del atleta"}</figcaption><AssessmentVideoPlayer playerRef={video} label={initial?"Vídeo del retest":"Vídeo del atleta"} className="w-full max-h-64 bg-neutral-900 rounded-lg" src={source.url}/></figure>:<p className="text-sm">Pendiente de vídeo en el retest.</p>}
    </div>
    {source&&canAnalyzeShoulderTest(source.testId)&&!disabled&&<div className="rounded-lg bg-neutral-50 p-3 space-y-2">
      {progress?<div className="flex gap-3 items-center"><span role="status" className="text-xs">{progress}</span><button type="button" className="text-xs underline" onClick={onCancel}>Detener análisis</button></div>:<button type="button" className="btn btn-ghost" onClick={onAnalyze} disabled={batchBusy}>{entry?.error?"Reintentar análisis con IA":draft?"Volver a analizar el vídeo":"Proponer revisión con IA"}</button>}
      {entry?.error&&<p role="alert" className="text-sm text-red-700">{entry.error}</p>}
      {draft&&<div className="text-sm space-y-2"><strong>Propuesta pendiente de verificación</strong>
        {draft.model&&<p className="text-xs text-neutral-500">Modelo: {draft.model==="claude-opus-5-5"?"Claude Opus 5.5":draft.model}</p>}
        {draft.notes&&<p className="whitespace-pre-wrap">{draft.notes}</p>}
        {numericDraft&&<div className="rounded border border-neutral-200 bg-white p-2 text-xs space-y-1">
          <p className="font-semibold">{proposedNumbers.length} {proposedNumbers.length===1?"medida propuesta":"medidas propuestas"}{pendingNumbers.length>0?" · "+pendingNumbers.length+" sin estimar":""}</p>
          {proposedNumbers.length>0&&<p>Estimaciones visuales: comprueba los valores antes de confirmar el test.</p>}
          {pendingNumbers.length>0&&<p>Pendientes: {pendingNumbers.map(f=>f.label).join("; ")}. Revisa la limitación indicada o completa estos campos manualmente.</p>}
        </div>}
        {numericDraft&&<dl>{proposedNumbers.map(([key,v])=><div key={key}><dt className="inline">{draft.kind==="hold"?holdLabels[key]:testFields.find(f=>f.key===key)?.label}: </dt><dd className="inline font-semibold">{v.toLocaleString("es-ES")}{draft.kind==="hold"?" s":""}</dd></div>)}</dl>}
        {draft.findings.map((f,i)=><div key={i} className="flex items-start gap-2"><button type="button" className="text-xs font-semibold underline whitespace-nowrap" onClick={()=>video.current?.seek(f.start)}>Ver {f.start.toFixed(1)} s</button><span>{f.text}</span></div>)}
        {draft.limitations.length>0&&<ul className="list-disc pl-5 text-xs text-neutral-600">{draft.limitations.map((v,i)=><li key={i}>{v}</li>)}</ul>}
        {draft.kind==="load"&&<p className="text-xs text-neutral-600">Contrasta la ejecución con el vídeo y confirma manualmente las cargas declaradas por el atleta.</p>}
        <button type="button" className="btn btn-ghost" disabled={conflict || entry?.applied || !hasProposal} onClick={()=>onProposal(proposedFields)}>{entry?.applied?"Propuesta incorporada. Revisa el borrador.":commentOnly&&(numericDraft||draft.kind==="load")?"Incorporar comentario al borrador":"Incorporar a mi borrador"}</button>
        {commentOnly&&(numericDraft||draft.kind==="load")&&!entry?.applied&&<p className="text-xs text-neutral-600">Se incorporará el comentario. Las medidas pendientes seguirán sin rellenar.</p>}
        {!hasProposal&&<p className="text-xs text-neutral-600">No hay medidas ni comentarios que incorporar. Puedes completar el test manualmente.</p>}
      </div>}
    </div>}
  </div>;
}
