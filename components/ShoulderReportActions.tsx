"use client";
import { useEffect, useRef, useState } from "react";

type ShareState = {active:boolean;expiresAt:string|null;sharedPublishedAt:string|null;upToDate:boolean};
function date(iso:string){return new Date(iso).toLocaleDateString("es-ES",{timeZone:"Europe/Madrid",year:"numeric",month:"long",day:"numeric"});}
export function ShoulderReportActions({sessionId,publishedAt}:{sessionId:string;publishedAt:string}) {
  const endpoint="/api/shoulder-pilot/"+encodeURIComponent(sessionId)+"/share";
  const [state,setState]=useState<ShareState|null>(null),[href,setHref]=useState("");
  const [busy,setBusy]=useState(false),[error,setError]=useState(""),[message,setMessage]=useState(""),[retry,setRetry]=useState(0);
  const mutation=useRef(false),linkInput=useRef<HTMLInputElement>(null);
  useEffect(()=>{
    const c=new AbortController();setState(null);setHref("");setError("");setMessage("");
    (async()=>{const r=await fetch(endpoint,{cache:"no-store",signal:c.signal});const d=await r.json();
      if(!r.ok)throw Error(d.error||"No se pudo consultar el enlace.");
      if(!c.signal.aborted)setState(d);
    })().catch(e=>{if(!c.signal.aborted)setError(e instanceof Error?e.message:"No se pudo consultar el enlace.");});
    return ()=>c.abort();
  },[endpoint,publishedAt,retry]);
  async function update(action:"POST"|"DELETE"){
    if(!state||mutation.current)return;
    const issuing=action==="POST";
    if(!issuing&&!window.confirm("¿Revocar el enlace? Dejará de abrir este informe."))return;
    if(issuing&&state.active&&!window.confirm("¿Sustituir el enlace actual? El anterior dejará de abrir el informe."))return;
    mutation.current=true;setBusy(true);setError("");setMessage("");
    try{
      const r=await fetch(endpoint,{method:action,cache:"no-store",headers:{"Content-Type":"application/json"},...(issuing?{body:JSON.stringify({publishedAt})}:{})});
      const d=await r.json();
      if(!r.ok)throw Error(d.error||"No se pudo actualizar el enlace.");
      if(issuing && (typeof d.path!=="string"||!/^\/informe-hombro\/[a-zA-Z0-9_-]+$/.test(d.path)))throw Error("No se pudo obtener el enlace del informe.");
      setState(d);setHref(issuing?new URL(d.path,window.location.origin).href:"");
      setMessage(issuing?"Enlace creado. Cópialo antes de salir de esta página.":"Enlace revocado.");
    }catch(e){setError(e instanceof Error?e.message:"No se pudo actualizar el enlace.");}
    finally{mutation.current=false;setBusy(false);}
  }
  async function copy(){
    try{if(!navigator.clipboard)throw Error();await navigator.clipboard.writeText(href);setMessage("Enlace copiado.");}
    catch{linkInput.current?.focus();linkInput.current?.select();setMessage("Selecciona y copia la dirección del enlace.");}
  }
  return <section className="card space-y-2" aria-labelledby="titulo-compartir-informe"><h2 id="titulo-compartir-informe" className="font-semibold">Informe publicado</h2>
    <p className="text-sm text-neutral-600">Abre la vista del atleta para grabar un Loom o guardar el informe como PDF.</p>
    <a className="btn btn-ghost inline-flex" href={"/valoraciones/hombro/"+encodeURIComponent(sessionId)+"/informe"} target="_blank" rel="noopener noreferrer">Abrir informe y PDF</a>
    <details className="border-t border-neutral-200 pt-2"><summary className="cursor-pointer font-medium text-sm">Compartir mediante enlace</summary>
      <div className="mt-3 space-y-2"><p className="text-sm text-neutral-600">Cualquier persona con el enlace podrá ver una copia de este informe publicado durante 30 días, sin entrar en la ficha.</p>
        {state?.active&&<p className="text-sm">Enlace activo{state.expiresAt?" hasta el "+date(state.expiresAt):""}. {!state.upToDate&&"Corresponde a una publicación anterior. Crea un enlace nuevo para compartir la versión actual."}</p>}
        {state?.active&&!href&&<p className="text-xs text-neutral-600">Si no conservas la dirección, puedes crear un enlace nuevo para sustituir el anterior.</p>}
        {!state&&!error&&<p className="text-sm" role="status">Consultando enlace…</p>}
        <div className="flex flex-wrap gap-2">
          {state&&<button type="button" className="btn btn-ghost" disabled={busy} onClick={()=>update("POST")}>{state.active?"Crear un enlace nuevo":"Crear enlace de 30 días"}</button>}
          {state?.active&&<button type="button" className="text-sm underline" disabled={busy} onClick={()=>update("DELETE")}>Revocar enlace</button>}
          {!state&&error&&<button type="button" className="text-sm underline" onClick={()=>setRetry(n=>n+1)}>Reintentar</button>}
        </div>
        {state?.active&&href&&<div className="space-y-2"><label className="block text-xs font-medium">Enlace al informe<input aria-label="Enlace al informe" className="input block w-full mt-1 font-normal text-sm" ref={linkInput} value={href} readOnly onFocus={e=>e.target.select()}/></label>
          <div className="flex flex-wrap gap-3 items-center"><button type="button" className="btn btn-accent" onClick={copy}>Copiar enlace</button>
          <a href={href} className="text-sm underline" target="_blank" rel="noopener noreferrer">Abrir enlace</a></div></div>}
        {error&&<p className="text-sm text-red-700" role="alert">{error}</p>}{(message||busy)&&<p className="text-xs" role="status">{busy?"Actualizando enlace…":message}</p>}
      </div>
    </details></section>;
}
