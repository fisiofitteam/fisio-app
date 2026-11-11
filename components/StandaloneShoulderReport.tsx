"use client";

import {useRef,useState} from "react";
import {ShoulderPilotReport,type PilotReportSnapshot} from "@/components/ShoulderPilotReport";

export function StandaloneShoulderReport({report,previous,example=false}:{report:PilotReportSnapshot;previous?:PilotReportSnapshot|null;example?:boolean}){
  const content=useRef<HTMLDivElement>(null),lock=useRef(false);
  const [busy,setBusy]=useState(false),[error,setError]=useState("");
  async function download(){
    const element=content.current?.querySelector<HTMLElement>("[data-shoulder-report]");
    if(!element||lock.current)return;
    lock.current=true;setBusy(true);setError("");
    try {
      const {downloadShoulderPdf}=await import("@/lib/shoulder-pdf");
      await downloadShoulderPdf(element,report.weekNumber,example);
    }catch{setError("No se pudo preparar el PDF. Vuelve a intentarlo.");}
    finally{lock.current=false;setBusy(false);}
  }
  const Shell=example?"section":"main", Heading=example?"h2":"h1";
  return <Shell className={example?"space-y-3":"mx-auto min-h-screen max-w-3xl px-3 py-5 sm:px-5 sm:py-8"}>
    <header className="mb-4 flex flex-wrap items-center justify-between gap-3">
      <div><p className="text-xs font-bold tracking-widest text-teal-800">FISIOFIT TEAM</p>
      <Heading className="text-xl font-bold text-neutral-900">{example?"Informe de ejemplo":"Informe de valoración"}</Heading></div>
      <button type="button" disabled={busy} onClick={download} className="rounded-lg bg-teal-800 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60">{busy?"Preparando PDF…":"Descargar PDF"}</button>
    </header>
    {error&&<p role="alert" className="mb-3 text-sm text-red-700">{error}</p>}
    <div ref={content}><ShoulderPilotReport report={report} previous={previous}/></div>
  </Shell>;
}
