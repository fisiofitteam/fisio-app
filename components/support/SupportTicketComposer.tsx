"use client";
import { useRef, useState } from "react";
import Link from "next/link";
import { priorityLabels, type TicketKind, type TicketPriority, type TicketDTO } from "@/lib/support/contracts";
import { screenFor } from "@/lib/support/screen";
import { supportFetch } from "./api";
import { SupportMaterialsEditor, useSupportMaterials } from "./SupportMaterialsEditor";

export function SupportTicketComposer({ kind, path, suggestion, onClose, onCreated, standalone = false }: { kind: TicketKind; path: string; suggestion: string; onClose: () => void; onCreated?: (ticket: TicketDTO) => void; standalone?: boolean }) {
  const [title, setTitle] = useState(suggestion.split("\n")[0].slice(0, 100)), [description, setDescription] = useState(suggestion.slice(0, 6000));
  const [priority, setPriority] = useState<TicketPriority>("normal"), [includeConversation, setInclude] = useState(false);
  const [busy, setBusy] = useState(false), [error, setError] = useState(""), [saved, setSaved] = useState<TicketDTO | null>(null);
  const request = useRef<{ payload: string; id: string }>();
  const materials = useSupportMaterials();
  async function submit(event: React.FormEvent) {
    event.preventDefault(); if (busy || materials.blocked) return; setBusy(true); setError("");
    const payload = { kind, title, description, priority, path, includeConversation, ...materials.value };
    const signature = JSON.stringify(payload);
    if (request.current?.payload !== signature) request.current = { payload: signature, id: crypto.randomUUID() };
    try { const ticket = await supportFetch<TicketDTO>("/api/support/tickets", { requestId: request.current.id, ...payload }); setSaved(ticket); materials.clear(); onCreated?.(ticket); }
    catch (e) { setError(e instanceof Error ? e.message : "No se pudo enviar."); } finally { setBusy(false); }
  }
  if (saved) return <div className="space-y-4 p-5">
    <div className="h-10 w-10 grid place-items-center rounded-full bg-amber-100 text-amber-900" aria-hidden>✓</div>
    <h3 className="font-semibold text-lg">Aviso enviado al CEO</h3>
    <p className="text-sm text-neutral-600">Podrás seguir su estado y las respuestas en Soporte y mejoras. También te avisaremos en la campanita.</p>
    <Link href={"/fisio/soporte?ticket=" + saved.id} onClick={onClose} className="btn btn-accent block text-center">Ver mi aviso</Link>
    <button type="button" onClick={onClose} className="text-sm underline">{standalone ? "Volver a soporte" : "Volver a la conversación"}</button>
  </div>;
  return <form onSubmit={submit} onPaste={e => { if (!busy) materials.onPaste(e); }} className="p-4 space-y-4">
    <div><h3 className="font-semibold">{kind === "problem" ? "Reportar un problema" : "Proponer una mejora"}</h3><p className="text-xs text-neutral-500 mt-1">Revisa el resumen antes de enviarlo.</p></div>
    <label className="block text-xs font-medium">Título<input autoFocus className="input mt-1" value={title} onChange={e => setTitle(e.target.value)} minLength={5} maxLength={140} required placeholder={kind === "problem" ? "¿Qué no funciona?" : "¿Qué te gustaría mejorar?"} /></label>
    <label className="block text-xs font-medium">{kind === "problem" ? "Qué ocurre y qué esperabas" : "Tu propuesta y para qué serviría"}<textarea className="input mt-1" rows={6} value={description} onChange={e => setDescription(e.target.value)} minLength={10} maxLength={6000} required /></label>
    <label className="block text-xs font-medium">Prioridad<select className="input mt-1" value={priority} onChange={e => setPriority(e.target.value as TicketPriority)}>{Object.entries(priorityLabels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
    <SupportMaterialsEditor draft={materials} disabled={busy} />
    <div className="rounded-xl bg-neutral-50 p-3 text-xs text-neutral-600 space-y-2"><p>Pantalla: <strong>{screenFor(path)}</strong></p><p>Se adjuntan la pantalla, la versión y las comprobaciones técnicas. Evita incluir datos clínicos que no hagan falta.</p>
      {!standalone && <label className="flex gap-2 items-start"><input type="checkbox" checked={includeConversation} onChange={e => setInclude(e.target.checked)} className="mt-0.5" />Adjuntar los últimos 8 mensajes de esta conversación</label>}
    </div>
    {error && <p role="alert" className="text-xs text-red-700">{error}</p>}
    <div className="flex gap-2"><button type="submit" className="btn btn-accent flex-1" disabled={busy || materials.blocked}>{busy ? "Enviando…" : materials.busy ? "Preparando adjuntos…" : "Enviar al CEO"}</button><button type="button" className="btn btn-ghost" disabled={busy || materials.busy} onClick={onClose}>Volver</button></div>
  </form>;
}
