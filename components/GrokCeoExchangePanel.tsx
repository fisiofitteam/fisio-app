"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { MessageSquare, Send, CheckCircle2, Clock } from "lucide-react";
import { channelStatus, exchangeStatus, CONNECTION_TEST } from "@/lib/grok-ceo-channel-health";
type Exchange = { id: string; reportId: string | null; decisionIndex: number | null; kind: "analysis" | "decision"; decision: "approved" | "rejected" | null; question: string | null; message: string; createdAt: string; response: string | null; respondedAt: string | null; deliveredAt: string | null };
type Inbox = { history: Exchange[]; reportDecisions: Exchange[]; channelConfigured: boolean; pendingCount: number; lastPollAt: string | null; lastReplyAt: string | null };
const date = (value: string) => new Date(value).toLocaleString("es-ES", { timeZone: "Europe/Madrid", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
export function GrokCeoExchangePanel({ reportId, decisions = [] }: { reportId?: string; decisions?: string[] }) {
  const [inbox, setInbox] = useState<Inbox | null>(null);
  const [message, setMessage] = useState("");
  const [notes, setNotes] = useState<Record<number,string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const retry = useRef<{ key: string; id: string } | null>(null);
  const currentReport = useRef(reportId);
  currentReport.current = reportId;
  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/ceo/grok-exchange" + (reportId ? "?reportId=" + encodeURIComponent(reportId) : ""), { cache: "no-store" });
      if (!res.ok) throw new Error("No se ha podido abrir el buzón.");
      const data = await res.json();
      if (currentReport.current === reportId) { setInbox(data); setError(""); }
    } catch { if (currentReport.current === reportId) setError("Buzón temporalmente no disponible."); }
  }, [reportId]);
  useEffect(() => {
    setInbox(null); setNotes({}); void load();
    const timer = setInterval(() => { void load(); }, 60000);
    return () => clearInterval(timer);
  }, [load]);
  async function submit(body: Record<string, unknown>) {
    if (busy) return;
    setBusy(true); setError(""); setNotice("");
    const key = JSON.stringify(body);
    const id = retry.current?.key === key ? retry.current.id : crypto.randomUUID();
    retry.current = { key, id };
    try {
      const res = await fetch("/api/ceo/grok-exchange", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...body, id }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "No se pudo guardar.");
      retry.current = null;
      if (body.kind === "analysis") setMessage("");
      setNotice("Guardado en el buzón. La entrega y respuesta dependen de la conexión de Grok.");
      await load();
    } catch (e) { setError(e instanceof Error ? e.message : "Error de conexión."); }
    finally { setBusy(false); }
  }
  return <section id="buzon-ceo" className="rounded-xl border border-neutral-200 bg-white p-4 space-y-4">
    <div className="flex items-center gap-2"><MessageSquare size={20} className="text-amber-700" /><h3 className="font-semibold">Buzón de dirección</h3></div>
    <p className="text-xs text-neutral-600">Registra decisiones o solicita análisis al CEO IA. No incluyas datos personales de pacientes ni credenciales. Ningún mensaje autoriza operaciones automáticas.</p>
    {inbox && <div className="rounded-lg border border-neutral-200 bg-neutral-50 p-3 space-y-2">
      <p className="font-medium text-sm">{({unconfigured:"Canal sin credencial",unverified:"Credencial configurada · conexión por verificar",poll_recorded:"Consulta autenticada registrada",reply_recorded:"Respuesta autenticada registrada"})[channelStatus(inbox)]}</p>
      <div className="grid sm:grid-cols-3 gap-2 text-xs"><div><p className="text-neutral-500">Última consulta</p><p>{inbox.lastPollAt ? date(inbox.lastPollAt) : "Sin evidencia"}</p></div><div><p className="text-neutral-500">Última respuesta</p><p>{inbox.lastReplyAt ? date(inbox.lastReplyAt) : "Sin evidencia"}</p></div><div><p className="text-neutral-500">Sin responder</p><p>{inbox.pendingCount}</p></div></div>
      <p className="text-xs text-neutral-600">Las fechas acreditan peticiones aceptadas por la app, no que la rutina externa esté programada ni que Grok haya leído cada mensaje.</p>
      <div className="flex flex-wrap gap-2"><button type="button" onClick={() => void load()} className="rounded-lg border bg-white px-3 py-1.5 text-xs">Actualizar estado</button>{inbox.channelConfigured && <button type="button" disabled={busy} onClick={() => void submit({kind:"analysis",message:CONNECTION_TEST})} className="rounded-lg border bg-white px-3 py-1.5 text-xs disabled:opacity-50">Enviar prueba de conexión</button>}</div>
    </div>}
    {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
    {notice && <p role="status" className="text-sm text-emerald-700">{notice}</p>}
    {reportId && !!decisions.length && <div className="space-y-3">
      <h4 className="text-sm font-semibold">Decisiones del informe</h4>
      {decisions.map((question,i) => {
        const recorded = inbox?.reportDecisions.find(x => x.decisionIndex === i);
        return <div key={i} className="rounded-lg border border-neutral-200 p-3 space-y-2">
          <p className="text-sm">{question}</p>
          {recorded ? <p className="text-xs font-medium text-neutral-700">Registrada: {recorded.decision === "approved" ? "aprobada" : "rechazada"} · {date(recorded.createdAt)}{recorded.message && " · " + recorded.message}</p> : <>
            <label className="block text-xs text-neutral-600">Motivo o condiciones (opcional)<textarea rows={2} maxLength={3000} value={notes[i] ?? ""} onChange={e => setNotes(prev => ({ ...prev, [i]: e.target.value }))} className="mt-1 w-full border rounded-lg p-2 text-sm" /></label>
            <div className="flex gap-2 flex-wrap"><button type="button" disabled={!inbox || busy} onClick={() => void submit({ kind: "decision", reportId, decisionIndex: i, decision: "approved", message: (notes[i] ?? "").trim() })} className="rounded-lg border border-emerald-700 text-emerald-800 px-3 py-2 text-xs font-medium disabled:opacity-50">Registrar aprobación</button><button type="button" disabled={!inbox || busy} onClick={() => void submit({ kind: "decision", reportId, decisionIndex: i, decision: "rejected", message: (notes[i] ?? "").trim() })} className="rounded-lg border border-neutral-300 px-3 py-2 text-xs font-medium disabled:opacity-50">Registrar rechazo</button></div>
          </>}
        </div>;
      })}
    </div>}
    <form onSubmit={e => { e.preventDefault(); if (message.trim()) void submit({ kind: "analysis", message: message.trim(), ...(reportId ? { reportId } : {}) }); }} className="space-y-2">
      <label htmlFor="grok-briefing-message" className="block font-medium text-sm">Encargar un análisis</label>
      <textarea id="grok-briefing-message" rows={3} maxLength={3000} placeholder="Por ejemplo: analiza la caída de conversión y propón tres medidas." value={message} onChange={e => setMessage(e.target.value)} className="w-full rounded-lg border border-neutral-300 p-3 text-sm" />
      <button disabled={!inbox || busy || !message.trim()} type="submit" className="flex items-center gap-2 rounded-lg bg-neutral-900 text-white px-4 py-2 text-sm disabled:opacity-50"><Send size={15} />{busy ? "Guardando…" : "Guardar encargo"}</button>
    </form>
    <div className="border-t pt-3"><h4 className="text-sm font-semibold mb-2">Historial de conversaciones y decisiones</h4>
      {!inbox ? <p className="text-xs text-neutral-500">{error ? "No disponible." : "Cargando…"}</p> : !inbox.history.length ? <p className="text-xs text-neutral-500">Aún no hay mensajes.</p> : <div className="space-y-2">{inbox.history.map(item => <details key={item.id} className="rounded-lg border border-neutral-200 p-3"><summary className="cursor-pointer text-sm"><span className="inline-flex gap-1 items-center text-xs text-neutral-600 mr-2">{item.respondedAt ? <CheckCircle2 size={14} className="text-emerald-700" /> : <Clock size={14} />}{exchangeStatus(item)}</span>{item.kind === "decision" ? (item.decision === "approved" ? "Aprobación" : "Rechazo") : "Encargo"} · {date(item.createdAt)}</summary>
        {item.question && <p className="mt-2 text-sm font-medium whitespace-pre-wrap">{item.question}</p>}
        {item.message && <p className="mt-2 text-sm whitespace-pre-wrap">{item.message}</p>}
        {item.response && <div className="rounded-lg bg-neutral-50 border border-neutral-200 p-3 mt-3"><p className="text-xs font-semibold mb-1">Respuesta del CEO IA</p><p className="text-sm whitespace-pre-wrap">{item.response}</p></div>}
      </details>)}</div>}
    </div>
  </section>;
}
