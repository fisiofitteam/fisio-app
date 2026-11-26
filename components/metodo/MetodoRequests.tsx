"use client";
import {useCallback,useEffect,useState} from "react";
type Request={id:string;createdAt:string;name:string;phone:string;zone:string;duration:string;impact:string;sport:string;tried:string;detail:string|null;origin:string|null;reference:string|null;handledAt:string|null};
/** Valoración requests: health information, visible to CEO/setter only. Not part of any export. */
export function MetodoRequests({from,to}:{from:string;to:string}){
  const [rows,setRows]=useState<Request[]>([]),[truncated,setTruncated]=useState(false),[loading,setLoading]=useState(true),[error,setError]=useState(""),[pending,setPending]=useState(""),[onlyOpen,setOnlyOpen]=useState(true);
  const load=useCallback(async()=>{setLoading(true);setError("");try{const r=await fetch(`/api/metodo/admin/solicitudes?from=${from}&to=${to}`);const d=await r.json();if(!r.ok)throw Error(d.error);setRows(d.requests);setTruncated(d.truncated);}catch(e){setError(e instanceof Error?e.message:"No se pudieron cargar las solicitudes.");}finally{setLoading(false);}},[from,to]);
  useEffect(()=>{void load();},[load]);
  async function toggle(row:Request){setPending(row.id);setError("");try{const r=await fetch("/api/metodo/admin/solicitudes",{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({id:row.id,handled:!row.handledAt})});const d=await r.json();if(!r.ok)throw Error(d.error);setRows(list=>list.map(x=>x.id===row.id?{...x,handledAt:d.handledAt}:x));}catch(e){setError(e instanceof Error?e.message:"No se pudo actualizar.");}finally{setPending("");}}
  const visible=onlyOpen?rows.filter(r=>!r.handledAt):rows,open=rows.filter(r=>!r.handledAt).length;
  return <section className="card space-y-4">
    <div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="font-semibold text-lg">Solicitudes del formulario de valoración</h2><p className="text-sm text-neutral-600 mt-1">{rows.length} en el intervalo · {open} sin gestionar. Al enviar, a la persona se le abre WhatsApp con su caso escrito: si no llega el mensaje, puedes escribirle tú.</p></div><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={onlyOpen} onChange={e=>setOnlyOpen(e.target.checked)}/>Solo sin gestionar</label></div>
    <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950">Contienen información de salud con consentimiento explícito. Úsala solo para atender la solicitud; no la copies a otras herramientas. Se eliminan automáticamente a los 12 meses.</p>
    {error&&<p className="text-sm text-red-700" role="alert">{error}</p>}
    {loading?<p className="text-sm text-neutral-500">Cargando…</p>:!visible.length?<p className="text-sm text-neutral-500">{rows.length?"Todas las solicitudes del intervalo están gestionadas.":"Todavía no hay solicitudes en este intervalo."}</p>:<div className="overflow-x-auto"><table className="w-full text-sm text-left align-top"><thead><tr>{["Fecha","Persona","Caso","Entrenamiento","Ha probado","Origen","Gestionada"].map(h=><th className="p-3 border-b whitespace-nowrap" key={h}>{h}</th>)}</tr></thead><tbody>{visible.map(r=><tr key={r.id} className={r.handledAt?"text-neutral-500":""}>
      <td className="p-3 border-b whitespace-nowrap">{new Date(r.createdAt).toLocaleString("es-ES",{timeZone:"Europe/Madrid",dateStyle:"short",timeStyle:"short"})}</td>
      <td className="p-3 border-b"><strong>{r.name}</strong><a className="block underline" href={`https://wa.me/${r.phone}`} target="_blank" rel="noopener noreferrer">+{r.phone}</a></td>
      <td className="p-3 border-b"><strong>{r.zone}</strong><span className="block">{r.duration}</span>{r.detail&&<span className="block text-neutral-600 max-w-xs">{r.detail}</span>}</td>
      <td className="p-3 border-b">{r.impact}<span className="block text-neutral-600">{r.sport}</span></td>
      <td className="p-3 border-b max-w-[14rem]">{r.tried}</td>
      <td className="p-3 border-b">{r.origin||"General"}{r.reference&&<span className="block font-mono text-xs">{r.reference}</span>}</td>
      <td className="p-3 border-b"><label className="flex items-center gap-2"><input type="checkbox" checked={!!r.handledAt} disabled={pending===r.id} onChange={()=>void toggle(r)}/><span className="sr-only">Marcar como gestionada</span></label></td>
    </tr>)}</tbody></table></div>}
    {truncated&&<p className="text-sm text-neutral-500">Se muestran las 200 más recientes. Acorta el intervalo para ver el resto.</p>}
  </section>;
}
