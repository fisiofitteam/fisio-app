"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

export function ReferralRewardButton({leadId,paidAt,canDeliver}:{leadId:string;paidAt:string|null;canDeliver:boolean}){
  const [busy,setBusy]=useState(false),[error,setError]=useState("");
  const router=useRouter();
  async function update(){
    const action=paidAt?"undo":"mark_delivered";
    if(!window.confirm(paidAt?"¿Deshacer solo el registro de entrega? Esto no recupera dinero ni cambia ningún pago.":"¿Confirmas que ya has entregado los 50 € al recomendador? Este botón solo registra la entrega; no transfiere dinero."))return;
    setBusy(true);setError("");
    try{
      const response=await fetch("/api/patient-referrals/rewards/"+encodeURIComponent(leadId),{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({action,expectedPaidAt:paidAt})});
      const body=await response.json();
      if(!response.ok)throw new Error(body.error||"No se pudo actualizar.");
      router.refresh();
    }catch(error){setError(error instanceof Error?error.message:"No se pudo actualizar.");}
    finally{setBusy(false);}
  }
  return <div className="space-y-2">
    <button type="button" className={paidAt?"text-xs underline text-neutral-500":"btn btn-accent text-sm"} disabled={busy||(!paidAt&&!canDeliver)} onClick={update}>{busy?"Guardando…":paidAt?"Deshacer registro":"Marcar 50 € entregados"}</button>
    {error&&<p role="alert" className="max-w-sm text-xs text-red-700">{error}</p>}
  </div>;
}
