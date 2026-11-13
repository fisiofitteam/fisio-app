"use client";
import { useEffect, useRef, useState } from "react";

type Lead={id:string;fullName:string;email:string|null;contactType:string;contactValue:string};
export function ReserveLeadDialog({lead,fisios,onClose,onCreated}:{lead:Lead;fisios:{id:string;fullName:string}[];onClose:()=>void;onCreated:()=>void}){
  const dialog=useRef<HTMLDialogElement>(null),lock=useRef(false);
  const [email,setEmail]=useState(lead.email || (lead.contactType==="email"?lead.contactValue:""));
  const [fisio,setFisio]=useState(""),[paid,setPaid]=useState(false),[amount,setAmount]=useState("");
  const [method,setMethod]=useState("Transferencia"),[busy,setBusy]=useState(false),[error,setError]=useState("");
  useEffect(()=>{const d=dialog.current;d?.showModal();return ()=>d?.close();},[]);
  async function save(){if(lock.current)return;
    const euros=Number(amount.replace(",","."));
    if(!email.trim()||paid&&(!/^\d+(?:[.,]\d{1,2})?$/.test(amount.trim())||euros<=0)){setError("Comprueba el correo y el importe de la señal.");return;}
    lock.current=true;setBusy(true);setError("");
    try{const res=await fetch("/api/leads/"+encodeURIComponent(lead.id)+"/reservation",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({email:email.trim(),assignedProfessionalId:fisio||null,amountEuros:paid?euros:0,...(paid?{paymentMethod:method}:{})})});
      const d=await res.json();if(!res.ok||!d.patientId)throw Error(d.error||"No se pudo abrir la reserva.");onCreated();}
    catch(e){setError(e instanceof Error?e.message:"No se pudo abrir la reserva.");}finally{lock.current=false;setBusy(false);}
  }
  return <dialog ref={dialog} aria-labelledby="reserva-lead-title" onCancel={e=>{e.preventDefault();if(!busy)onClose();}} className="w-[calc(100%-2rem)] max-w-md rounded-2xl p-5 backdrop:bg-black/50">
    <div className="flex items-start justify-between gap-3"><div><p className="text-xs text-teal-700 font-semibold">{lead.fullName}</p><h2 id="reserva-lead-title" className="font-semibold text-lg">Reservar plaza para valoración</h2></div><button type="button" aria-label="Cerrar" disabled={busy} onClick={onClose} className="px-2 text-xl">×</button></div>
    <p className="my-3 text-sm text-neutral-600">La ficha aparecerá en Pacientes para que el fisio pueda pautar test antes de vender el programa.</p>
    <form onSubmit={e=>{e.preventDefault();void save();}}><fieldset disabled={busy} className="space-y-3">
      <label className="block text-sm">Correo de acceso<input type="email" className="input block w-full mt-1" required value={email} onChange={e=>setEmail(e.target.value)}/></label>
      <label className="block text-sm">Fisio asignado<select className="input block w-full mt-1" value={fisio} onChange={e=>setFisio(e.target.value)}><option value="">Por asignar</option>{fisios.map(f=><option key={f.id} value={f.id}>{f.fullName}</option>)}</select></label>
      <label className="block text-sm">Señal<select className="input block w-full mt-1" value={paid?"paid":"none"} onChange={e=>setPaid(e.target.value==="paid")}><option value="none">Sin cobro, solo test</option><option value="paid">Ya he recibido una señal fuera de la app</option></select></label>
      {paid&&<div className="grid grid-cols-2 gap-2"><label className="text-sm">Importe recibido (€)<input required inputMode="decimal" className="input block w-full mt-1" value={amount} onChange={e=>setAmount(e.target.value)}/></label><label className="text-sm">Método<select className="input block w-full mt-1" value={method} onChange={e=>setMethod(e.target.value)}>{["Transferencia","Bizum","Efectivo","Otro"].map(m=><option key={m}>{m}</option>)}</select></label></div>}
      {error&&<p role="alert" className="text-sm text-red-700">{error}</p>}
      <button type="submit" className="btn btn-accent text-sm w-full" disabled={busy}>{busy?"Guardando…":"Confirmar reserva"}</button>
    </fieldset></form>
  </dialog>;
}
