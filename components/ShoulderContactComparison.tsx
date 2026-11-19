"use client";
import Link from "next/link";
import {useEffect,useRef,useState} from "react";
import {prepareContactComparison,runContactProbe,type PreparedContactComparison} from "@/lib/shoulder-contact-client";
import type {ContactProbeResult,ContactProbeInput,CropRegion} from "@/lib/shoulder-contact-analysis-types";
import type {VideoInput} from "@/lib/shoulder-analysis-types";

const wallPressId="5ab05c1c-5874-4c6e-ae18-16f981357338";
const names={mosaic:"Mosaico actual",frame:"Fotograma individual",crop:"Detalle seleccionado"};
const statuses={visible_contact:"Contacto completo visible",visible_gap:"Separación visible",not_visible:"No comprobable"};
type Variant=ContactProbeInput["variant"];
type Box={x:number;y:number;width:number;height:number};
export function ShoulderContactComparison({sessionId}:{sessionId:string}){
  const job=useRef<AbortController|null>(null);
  const [source,setSource]=useState<VideoInput|null>(null);
  const [error,setError]=useState(""),[progress,setProgress]=useState("");
  const [busy,setBusy]=useState(false),[seconds,setSeconds]=useState(14);
  const [box,setBox]=useState<Box>({x:0,y:0,width:100,height:100});
  const [prepared,setPrepared]=useState<PreparedContactComparison|null>(null);
  const [results,setResults]=useState<Partial<Record<Variant,ContactProbeResult>>>({});
  const [failures,setFailures]=useState<Partial<Record<Variant,string>>>({});
  useEffect(()=>{
    const ctrl=new AbortController();
    fetch("/api/shoulder-pilot/"+encodeURIComponent(sessionId),{cache:"no-store",credentials:"same-origin",signal:ctrl.signal})
      .then(async r=>{const data=await r.json();if(!r.ok)throw Error(data.error||"No se puede abrir esta valoración.");
        const video=data.videos?.find((v:{sessionId:string;testId:string;url?:string;uploadedAt?:string;aiReviewBlocked?:boolean})=>v.sessionId===sessionId&&v.testId===wallPressId&&v.url&&v.uploadedAt&&!v.aiReviewBlocked);
        if(data.aiReviewBlocked||!video)throw Error("Este wall press no está disponible para comparación con IA.");
        if(!ctrl.signal.aborted)setSource({sessionId,testId:wallPressId,videoId:video.id,uploadedAt:video.uploadedAt});
      }).catch(e=>{if(!ctrl.signal.aborted)setError(e instanceof Error?e.message:"No se pudo cargar el vídeo.");});
    return()=>{ctrl.abort();job.current?.abort();};
  },[sessionId]);
  function invalidate(){setPrepared(null);setResults({});setFailures({});setError("");setProgress("");}
  async function prepare(){
    if(!source||job.current)return;
    const ctrl=new AbortController();job.current=ctrl;setBusy(true);setError("");setResults({});setFailures({});setPrepared(null);setProgress("Preparando las tres imágenes del mismo instante…");
    try{
      const crop:CropRegion={x:box.x/100,y:box.y/100,width:box.width/100,height:box.height/100};
      const data=await prepareContactComparison(source,seconds,crop,ctrl.signal);
      if(!ctrl.signal.aborted){setPrepared(data);setProgress("Imágenes preparadas. Comprueba el encuadre antes de comparar.");}
    }catch(e){if(!ctrl.signal.aborted)setError(e instanceof Error?e.message:"No se pudo preparar la comparación.");}
    finally{if(job.current===ctrl){job.current=null;setBusy(false);if(ctrl.signal.aborted)setProgress("Preparación detenida.");}}
  }
  async function compare(){
    if(!source||!prepared||job.current)return;
    const ctrl=new AbortController();job.current=ctrl;setBusy(true);setError("");setResults({});setFailures({});
    try{
      for(const image of prepared.variants){
        if(ctrl.signal.aborted)break;
        setProgress("Analizando: "+names[image.variant]+"…");
        try{const result=await runContactProbe(source,prepared,image,ctrl.signal);
          if(!ctrl.signal.aborted)setResults(p=>({...p,[image.variant]:result}));
        }catch(e){if(!ctrl.signal.aborted)setFailures(p=>({...p,[image.variant]:e instanceof Error?e.message:"Análisis no disponible."}));}
      }
      if(!ctrl.signal.aborted)setProgress("Comparación terminada. Las respuestas siguen pendientes de verificación.");
    }finally{if(job.current===ctrl){job.current=null;setBusy(false);if(ctrl.signal.aborted)setProgress("Comparación detenida.");}}
  }
  return <main className="mx-auto max-w-6xl space-y-4">
    <Link href={"/fisio/valoraciones/"+sessionId} target="_blank" className="text-sm underline">Abrir la valoración en otra pestaña</Link>
    <header className="card space-y-2"><p className="text-xs font-semibold uppercase text-neutral-500">Comprobación interna de calidad</p><h1 className="text-2xl font-bold">Comparar la detección del contacto</h1>
      <p>Las tres imágenes se analizan por separado con la misma pregunta y el mismo modelo. Se comprueba el contacto de cada brazo, sin pedir grados ni puntuaciones.</p>
      <p className="text-sm text-neutral-600">Esta prueba no modifica el borrador ni publica resultados. Detectar una separación no implica poder medir su ángulo.</p>
    </header>
    {error&&<p role="alert" className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</p>}
    <section className="card space-y-3">
      <fieldset disabled={busy||!source} className="space-y-3">
        <label className="block max-w-xs text-sm">Instante del vídeo (segundos enteros)<input className="input mt-1" type="number" min={0} max={59} step={1} value={seconds} onChange={e=>{invalidate();setSeconds(Number(e.target.value));}}/></label>
        <p className="text-sm">Selecciona un recorte que conserve los brazos y la pared. Las posiciones y tamaños se expresan como porcentaje del encuadre.</p>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">{([["x","Izquierda (%)"],["y","Arriba (%)"],["width","Anchura (%)"],["height","Altura (%)"]] as const).map(([key,label])=><label className="text-sm" key={key}>{label}<input className="input mt-1" type="number" min={key==="x"||key==="y"?0:1} max={100} step={1} value={box[key]} onChange={e=>{invalidate();setBox(p=>({...p,[key]:Number(e.target.value)}));}}/></label>)}</div>
        <div className="flex flex-wrap gap-2"><button type="button" className="btn btn-ghost" onClick={prepare}>Preparar imágenes</button><button type="button" className="btn btn-accent" disabled={!prepared} onClick={compare}>Comparar las tres imágenes con IA</button></div>
      </fieldset>
      {progress&&<p role="status" className="text-sm">{progress}</p>}{busy&&<button type="button" className="text-sm underline" onClick={()=>job.current?.abort()}>Detener comparación</button>}
      {prepared&&<p className="text-xs text-neutral-500">Vídeo fuente: {prepared.width} × {prepared.height} · duración {prepared.duration.toFixed(2)} s · instante seleccionado {prepared.time.toFixed(1)} s. El recorte conserva la resolución disponible; no añade detalle artificial.</p>}
    </section>
    {prepared&&<div className="grid gap-4 lg:grid-cols-3">{prepared.variants.map(image=>{
      const result=results[image.variant];
      return <section key={image.variant} className="card space-y-3" aria-label={names[image.variant]}>
        <h2 className="text-lg font-semibold">{names[image.variant]}</h2>
        <img src={"data:image/jpeg;base64,"+image.jpeg} alt={names[image.variant]+" del wall press en "+prepared.time+" segundos"} className="mx-auto h-auto max-h-[32rem] w-auto max-w-full rounded bg-neutral-950"/>
        <p className="text-xs text-neutral-500">{image.width} × {image.height} · calidad JPEG {Math.round(image.quality*100)}% · {Math.round(image.jpeg.length*3/4/1024)} KB</p>
        {failures[image.variant]&&<p role="alert" className="text-sm text-red-700">{failures[image.variant]}</p>}
        {result&&<div className="space-y-3 text-sm"><p className="text-xs text-neutral-500">Modelo: {result.model}</p>{([["leftImageArm","Brazo izquierdo de la imagen"],["rightImageArm","Brazo derecho de la imagen"]] as const).map(([key,label])=><div key={key}><h3 className="font-semibold">{label}</h3><p className="font-medium">{statuses[result[key].status]}</p><p>{result[key].reason}</p></div>)}{result.limitations.length>0&&<ul className="list-disc pl-5 text-xs text-neutral-600">{result.limitations.map((v,i)=><li key={i}>{v}</li>)}</ul>}</div>}
      </section>;
    })}</div>}
  </main>;
}
