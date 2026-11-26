"use client";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { ReceiptText, AlertTriangle, Plus } from "lucide-react";
import { expenseCategories } from "@/lib/business-expense-candidate-contract";
type Category = typeof expenseCategories[number];
type Candidate = { id:string; source:string; merchant:string; description:string; amountCents:number; occurredAt:string; category:Category; status:string; reviewNote:string|null; transactionId:string|null; reviewedAt:string|null };
type Inbox = { pending:Candidate[]; history:Candidate[]; pendingCount:number; ingestConfigured:boolean };
const labels:Record<Category,string> = { software:"Software", sueldos:"Sueldos", marketing:"Marketing", otros:"Otros" };
const sourceLabels:Record<string,string> = { manual:"Manual", gmail:"Gmail", stripe:"Stripe", bank:"Banco", subscription:"Suscripción" };
const eur = (cents:number) => (cents/100).toLocaleString("es-ES",{style:"currency",currency:"EUR"});
const today = () => new Intl.DateTimeFormat("en-CA",{timeZone:"Europe/Madrid",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date());
const initial = () => ({ merchant:"", description:"", amount:"", date:today(), category:"otros" as Category });
export function BusinessExpenseCandidates() {
  const [data,setData] = useState<Inbox|null>(null);
  const [form,setForm] = useState(initial);
  const [open,setOpen] = useState(false);
  const [busy,setBusy] = useState(false);
  const [error,setError] = useState("");
  const [notice,setNotice] = useState("");
  const [edits,setEdits] = useState<Record<string,{category?:Category;note?:string;duplicate?:boolean}>>({});
  const [duplicateWarnings,setDuplicateWarnings] = useState<Record<string,boolean>>({});
  const retry = useRef<{key:string;id:string}|null>(null);
  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/ceo/expense-candidates",{cache:"no-store"});
      const json = await res.json();
      if(!res.ok) throw new Error(json.error || "No disponible");
      setData(json);
    } catch(e) { setError(e instanceof Error ? e.message : "No se pudo cargar la bandeja."); }
  },[]);
  useEffect(()=>{void load();},[load]);
  function edit(id:string, patch: {category?:Category;note?:string;duplicate?:boolean}) { setEdits(prev=>({...prev,[id]:{...prev[id],...patch}})); }
  async function add() {
    if(busy)return;
    const amountText=form.amount.trim().replace(",",".");
    if(!/^\d+(\.\d{1,2})?$/.test(amountText)) {setError("Introduce un importe en euros con un máximo de dos decimales.");return;}
    const amountCents=Math.round(Number(amountText)*100);
    if(!Number.isSafeInteger(amountCents)||amountCents<1||amountCents>100000000){setError("Importe fuera de rango.");return;}
    const payload={source:"manual",merchant:form.merchant.trim(),description:form.description.trim(),amountCents,currency:"EUR",date:form.date,category:form.category};
    const key=JSON.stringify(payload);
    const id=retry.current?.key===key?retry.current.id:crypto.randomUUID();
    retry.current={key,id};
    setBusy(true);setError("");setNotice("");
    try{
      const res=await fetch("/api/ceo/expense-candidates",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({...payload,sourceRef:id})});
      const json=await res.json();if(!res.ok)throw new Error(json.error || "No se pudo guardar.");
      retry.current=null;setForm(initial());setOpen(false);setNotice("Gasto guardado para revisión. Todavía no contabilizado.");await load();
    }catch(e){setError(e instanceof Error?e.message:"Error de conexión.");}finally{setBusy(false);}
  }
  async function scanStripe() {
    if(busy)return;
    setBusy(true);setError("");setNotice("");
    try{
      const res=await fetch("/api/ceo/expense-candidates/stripe",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({days:7})});
      const result=await res.json();if(!res.ok)throw new Error(result.error||"No se pudo consultar Stripe.");
      setNotice("Stripe: "+result.available+" días con candidatos disponibles; "+result.conflicts+" conflictos que requieren conciliación. No se ha contabilizado ningún gasto.");
      await load();
    }catch(e){setError(e instanceof Error?e.message:"Error de conexión.");}finally{setBusy(false);}
  }
  async function review(row:Candidate, action:"approve"|"reject") {
    if(busy)return;
    const values=edits[row.id] ?? {};
    const note=values.note?.trim() ?? "";
    if(action==="reject"&&!note){setError("Indica el motivo del rechazo.");return;}
    if(action==="approve"&&!window.confirm("¿Has comprobado el gasto y quieres incorporarlo al libro de finanzas?"))return;
    setBusy(true);setError("");setNotice("");
    try{
      const payload=action==="approve"?{id:row.id,action,category:values.category??row.category,confirmDuplicate:values.duplicate===true,note}:{id:row.id,action,note};
      const res=await fetch("/api/ceo/expense-candidates",{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify(payload)});
      const json=await res.json();
      if(!res.ok){if(json.potentialDuplicate){setDuplicateWarnings(prev=>({...prev,[row.id]:true}));}throw new Error(json.error || "No se pudo revisar.");}
      setNotice(action==="approve"?"Gasto incorporado al libro contable.":"Gasto rechazado sin contabilizar.");await load();
    }catch(e){setError(e instanceof Error?e.message:"Error de conexión.");}finally{setBusy(false);}
  }
  return <section className="space-y-5">
    <Link href="/fisio/finanzas/banco" className="inline-block text-sm font-medium text-amber-800 underline">Banco y tesorería · Conectar Ponto</Link>
    <header className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-lg font-semibold flex items-center gap-2"><ReceiptText size={22} className="text-amber-700"/> Gastos pendientes de validar</h2><p className="text-sm text-neutral-500">Comprueba los candidatos antes de incorporarlos a tus finanzas.</p></div><button type="button" disabled={!data||busy} onClick={()=>setOpen(x=>!x)} className="flex items-center gap-2 rounded-lg bg-neutral-900 text-white px-3 py-2 text-sm disabled:opacity-50"><Plus size={16}/> Añadir candidato</button></header>
    {data&&!data.ingestConfigured&&<p className="rounded-lg bg-amber-50 border border-amber-200 text-amber-900 text-sm p-3">Gmail y la ingestión externa están pendientes de conexión. Ponto dispone de su propia conexión en Banco y tesorería. La detección de Stripe se puede iniciar desde esta pantalla.</p>}
    <div className="rounded-xl border bg-white p-4 space-y-2"><h3 className="font-semibold text-sm">Detectar comisiones de Stripe</h3><p className="text-xs text-neutral-600">Consulta los últimos siete días completos. Agrupa solo comisiones de cobros en euros, sin datos de clientes. No incluye devoluciones, comisiones independientes ni otros movimientos. Comprueba si ya están descontadas de tus ingresos antes de contabilizar.</p><button type="button" disabled={!data||busy} onClick={()=>void scanStripe()} className="rounded-lg border border-neutral-300 px-3 py-2 text-sm font-medium disabled:opacity-50">Buscar candidatos en Stripe</button></div>
    {error&&<p role="alert" className="text-sm text-red-700">{error}</p>}{notice&&<p role="status" className="text-sm text-emerald-700">{notice}</p>}
    {open&&<form onSubmit={e=>{e.preventDefault();void add();}} className="border rounded-xl p-4 bg-white grid sm:grid-cols-2 gap-3">
      <label className="text-xs text-neutral-600">Proveedor<input required maxLength={180} value={form.merchant} onChange={e=>setForm({...form,merchant:e.target.value})} className="block w-full border rounded-lg p-2 mt-1 text-sm"/></label>
      <label className="text-xs text-neutral-600">Descripción<input required maxLength={600} value={form.description} onChange={e=>setForm({...form,description:e.target.value})} className="block w-full border rounded-lg p-2 mt-1 text-sm"/></label>
      <label className="text-xs text-neutral-600">Importe (€)<input required inputMode="decimal" value={form.amount} onChange={e=>setForm({...form,amount:e.target.value})} className="block w-full border rounded-lg p-2 mt-1 text-sm"/></label>
      <label className="text-xs text-neutral-600">Fecha<input required type="date" value={form.date} onChange={e=>setForm({...form,date:e.target.value})} className="block w-full border rounded-lg p-2 mt-1 text-sm"/></label>
      <label className="text-xs text-neutral-600">Categoría<select value={form.category} onChange={e=>setForm({...form,category:e.target.value as Category})} className="block w-full border rounded-lg p-2 mt-1 text-sm">{expenseCategories.map(c=><option key={c} value={c}>{labels[c]}</option>)}</select></label>
      <div className="flex items-end"><button disabled={busy} type="submit" className="rounded-lg bg-neutral-900 text-white px-4 py-2 text-sm disabled:opacity-50">Guardar para revisar</button></div>
    </form>}
    {!data?<p className="text-sm text-neutral-500">{error?"No disponible.":"Cargando…"}</p>:<>
      <div className="grid sm:grid-cols-2 gap-3"><div className="rounded-xl bg-white border p-4"><p className="text-xs text-neutral-500">Pendientes</p><p className="text-2xl font-semibold tabular-nums">{data.pendingCount}</p></div><div className="rounded-xl bg-white border p-4"><p className="text-xs text-neutral-500">Importe de candidatos visibles</p><p className="text-2xl font-semibold tabular-nums">{eur(data.pending.reduce((sum,x)=>sum+x.amountCents,0))}</p><p className="text-xs text-neutral-500">Todavía no contabilizado.</p></div></div>
      {!data.pending.length?<p className="text-sm text-neutral-500">No hay gastos pendientes.</p>:data.pending.map(row=><article key={row.id} className="bg-white rounded-xl border border-neutral-200 p-4 space-y-3">
        <div className="flex gap-3 justify-between"><div className="min-w-0"><p className="font-semibold break-words">{row.merchant}</p><p className="text-xs text-neutral-500">{sourceLabels[row.source]??row.source} · {row.occurredAt.slice(0,10)}</p><p className="text-sm mt-1 whitespace-pre-wrap break-words">{row.description}</p></div><span className="font-semibold text-lg tabular-nums whitespace-nowrap">{eur(row.amountCents)}</span></div>
        <div className="grid sm:grid-cols-2 gap-3"><label className="text-xs text-neutral-600">Categoría<select value={edits[row.id]?.category??row.category} onChange={e=>edit(row.id,{category:e.target.value as Category})} className="block w-full border rounded-lg p-2 mt-1 text-sm">{expenseCategories.map(c=><option key={c} value={c}>{labels[c]}</option>)}</select></label><label className="text-xs text-neutral-600">Nota de revisión / motivo de rechazo<textarea maxLength={600} rows={2} value={edits[row.id]?.note??""} onChange={e=>edit(row.id,{note:e.target.value})} className="block w-full border rounded-lg p-2 mt-1 text-sm"/></label></div>
        {duplicateWarnings[row.id]&&<label className="flex gap-2 items-start rounded-lg p-3 bg-amber-50 border border-amber-200 text-sm text-amber-900"><AlertTriangle size={17} className="shrink-0"/><input type="checkbox" checked={edits[row.id]?.duplicate===true} onChange={e=>edit(row.id,{duplicate:e.target.checked})}/> He comprobado el movimiento existente y confirmo que es otro gasto distinto.</label>}
        <div className="flex flex-wrap gap-2"><button type="button" disabled={busy} onClick={()=>void review(row,"approve")} className="rounded-lg bg-emerald-700 text-white px-3 py-2 text-sm disabled:opacity-50">Validar y contabilizar</button><button type="button" disabled={busy} onClick={()=>void review(row,"reject")} className="rounded-lg border px-3 py-2 text-sm disabled:opacity-50">Rechazar / duplicado</button></div>
      </article>)}
      <details className="bg-white rounded-xl border p-4"><summary className="cursor-pointer font-medium text-sm">Historial de revisiones</summary><div className="mt-3 divide-y">{data.history.map(row=><div key={row.id} className="py-2 text-sm"><div className="flex justify-between gap-2"><span>{row.merchant} · {row.status==="approved"?"Contabilizado":"Rechazado"}</span><strong>{eur(row.amountCents)}</strong></div><p className="text-xs text-neutral-500">{row.occurredAt.slice(0,10)} · {row.reviewNote??"Sin nota"}</p></div>)}{!data.history.length&&<p className="text-sm text-neutral-500">Sin revisiones.</p>}</div></details>
    </>}
  </section>;
}
