"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowLeft, LifeBuoy, RefreshCw } from "lucide-react";
import { kindLabels, priorityLabels, statusLabels, type TicketDTO, type TicketPriority, type TicketStatus } from "@/lib/support/contracts";
import { supportFetch } from "./api";

type ListRow = Pick<TicketDTO, "id" | "kind" | "title" | "priority" | "status" | "reporter" | "updatedAt">;
type List = { manager: boolean; total: number; page: number; counts: Record<string, number>; tickets: ListRow[] };
const date = (value: string) => new Date(value).toLocaleString("es-ES", { timeZone: "Europe/Madrid", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

export function SupportInbox({ manager, initialTicket }: { manager: boolean; initialTicket?: string }) {
  const [list, setList] = useState<List | null>(null), [selected, setSelected] = useState(initialTicket ?? "");
  const [status, setStatus] = useState(""), [kind, setKind] = useState(""), [priority, setPriority] = useState(""), [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false), [error, setError] = useState("");
  const generation = useRef(0);
  const load = useCallback(async () => {
    const current = ++generation.current; setLoading(true); setError("");
    try { const result = await supportFetch<List>("/api/support/tickets?" + new URLSearchParams({ status, kind, priority, page: String(page) })); if (current === generation.current) setList(result); }
    catch (e) { if (current === generation.current) setError(e instanceof Error ? e.message : "No se pudo cargar."); }
    finally { if (current === generation.current) setLoading(false); }
  }, [status, kind, priority, page]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { if (initialTicket) setSelected(initialTicket); }, [initialTicket]);
  return <main className="max-w-6xl mx-auto space-y-5 pb-24">
    <header className="rounded-2xl bg-neutral-950 text-white p-6 sm:p-8">
      <Link href="/fisio" className="text-xs text-neutral-400 hover:text-white inline-flex gap-1 items-center"><ArrowLeft size={12} />Volver al panel</Link>
      <div className="flex items-center gap-3 mt-4"><LifeBuoy className="text-amber-400" size={27} /><h1 className="text-2xl font-semibold">Soporte y mejoras</h1></div>
      <p className="text-sm text-neutral-400 mt-3 max-w-xl">{manager ? "Problemas, propuestas y respuestas del equipo. Todo en un mismo lugar, con prioridad y seguimiento." : "Tus avisos y las respuestas del equipo. Para enviar uno nuevo, abre Ayuda desde la pantalla donde lo necesites."}</p>
    </header>
    <div className="grid grid-cols-3 gap-3">{[["Por revisar", list?.counts.new ?? 0], ["En seguimiento", (list?.counts.in_progress ?? 0) + (list?.counts.awaiting_info ?? 0)], ["Resueltos", list?.counts.resolved ?? 0]].map(([label, count]) => <div key={label} className="rounded-xl border border-neutral-200 bg-white p-4"><p className="text-xs text-neutral-500">{label}</p><p className="text-2xl font-semibold mt-1">{count}</p></div>)}</div>
    <div className="flex flex-wrap gap-2 items-end">
      <label className="text-xs">Estado<select className="input mt-1" value={status} onChange={e => { setStatus(e.target.value); setPage(1); }}><option value="">Todos los estados</option>{Object.entries(statusLabels).map(([k, label]) => <option key={k} value={k}>{label}</option>)}</select></label>
      <label className="text-xs">Tipo<select className="input mt-1" value={kind} onChange={e => { setKind(e.target.value); setPage(1); }}><option value="">Problemas y mejoras</option>{Object.entries(kindLabels).map(([k, label]) => <option key={k} value={k}>{label}</option>)}</select></label>
      <label className="text-xs">Prioridad<select className="input mt-1" value={priority} onChange={e => { setPriority(e.target.value); setPage(1); }}><option value="">Todas las prioridades</option>{Object.entries(priorityLabels).map(([k, label]) => <option key={k} value={k}>{label}</option>)}</select></label>
      <button type="button" className="btn btn-ghost ml-auto" onClick={load} disabled={loading}><RefreshCw size={15} />Actualizar</button>
    </div>
    {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
    <div className="grid lg:grid-cols-[minmax(270px,0.8fr)_minmax(0,1.4fr)] gap-4 items-start">
      <section aria-label="Lista de avisos" className="space-y-2">
        {loading && !list && <p role="status" className="card text-sm text-neutral-500">Cargando avisos…</p>}
        {list?.tickets.length === 0 && <div className="card py-10 text-center"><LifeBuoy className="mx-auto text-neutral-300 mb-3" /><p className="font-medium">Sin avisos en esta vista</p><p className="text-sm text-neutral-500 mt-2">Prueba otros filtros o envía una consulta desde Ayuda.</p></div>}
        {list?.tickets.map(ticket => <button key={ticket.id} type="button" onClick={() => setSelected(ticket.id)} aria-pressed={selected === ticket.id} className={"w-full text-left rounded-xl border p-4 transition-colors " + (selected === ticket.id ? "border-amber-400 bg-amber-50" : "border-neutral-200 bg-white hover:border-neutral-400")}>
          <div className="flex gap-2 justify-between text-[11px] text-neutral-500"><span>{kindLabels[ticket.kind]}</span><span>{date(ticket.updatedAt)}</span></div>
          <h2 className="text-sm font-semibold mt-2 break-words">{ticket.title}</h2><p className="text-xs text-neutral-500 mt-1">{ticket.reporter}</p>
          <div className="flex flex-wrap gap-2 mt-3 text-[11px]"><span className="rounded-full bg-white border border-neutral-200 px-2 py-0.5">{statusLabels[ticket.status]}</span><span className={"px-2 py-0.5 " + (ticket.priority === "blocking" || ticket.priority === "high" ? "font-semibold text-amber-800" : "text-neutral-500")}>{priorityLabels[ticket.priority]}</span></div>
        </button>)}
        {!!list && list.total > 30 && <div className="flex items-center justify-between text-xs py-3"><button type="button" className="underline" disabled={page === 1} onClick={() => setPage(p => p - 1)}>Anterior</button><span>Página {page} de {Math.ceil(list.total / 30)}</span><button type="button" className="underline" disabled={page * 30 >= list.total} onClick={() => setPage(p => p + 1)}>Siguiente</button></div>}
      </section>
      {selected ? <SupportTicketDetail key={selected} id={selected} manager={manager} updated={load} /> : <div className="hidden lg:block rounded-2xl border border-dashed border-neutral-300 p-12 text-center text-sm text-neutral-500">Abre un aviso para ver su contexto y continuar la conversación.</div>}
    </div>
  </main>;
}

function SupportTicketDetail({ id, manager, updated }: { id: string; manager: boolean; updated: () => Promise<void> }) {
  const [ticket, setTicket] = useState<TicketDTO | null>(null), [body, setBody] = useState("");
  const [status, setStatus] = useState<TicketStatus>("new"), [priority, setPriority] = useState<TicketPriority>("normal");
  const [busy, setBusy] = useState(false), [error, setError] = useState(""), [notice, setNotice] = useState("");
  const request = useRef<string>();
  function apply(value: TicketDTO) { setTicket(value); setStatus(value.status); setPriority(value.priority); }
  const load = useCallback(async () => { try { apply(await supportFetch<TicketDTO>("/api/support/tickets/" + id)); setError(""); } catch (e) { setError(e instanceof Error ? e.message : "No se pudo cargar."); } }, [id]);
  useEffect(() => { load(); }, [load]);
  const changed = !!body.trim() || !!ticket && (status !== ticket.status || priority !== ticket.priority);
  async function save(e: React.FormEvent) {
    e.preventDefault(); if (!ticket || busy || !changed) return;
    setBusy(true); setError(""); setNotice(""); request.current ??= crypto.randomUUID();
    try {
      apply(await supportFetch<TicketDTO>("/api/support/tickets/" + id, { requestId: request.current, version: ticket.version, body,
        ...(manager && status !== ticket.status ? { status } : {}), ...(manager && priority !== ticket.priority ? { priority } : {}) }, "PATCH"));
      setBody(""); request.current = undefined; setNotice("Actualización guardada."); await updated();
    } catch (e) { setError(e instanceof Error ? e.message : "No se pudo guardar."); }
    finally { setBusy(false); }
  }
  if (!ticket) return <section className="card text-sm">{error ? <p role="alert">{error}</p> : <p role="status">Cargando aviso…</p>}<button type="button" onClick={load} className="underline mt-3">Volver a cargar</button></section>;
  return <section className="rounded-2xl border border-neutral-200 bg-white p-5 sm:p-6 space-y-5">
    <header><div className="flex gap-2 text-xs text-neutral-500"><span>{kindLabels[ticket.kind]}</span><span>·</span><span>{statusLabels[ticket.status]}</span></div><h2 className="text-xl font-semibold mt-2 break-words">{ticket.title}</h2><p className="text-xs text-neutral-500 mt-2">{ticket.reporter} · {date(ticket.createdAt)}</p></header>
    <p className="text-sm leading-relaxed whitespace-pre-wrap break-words">{ticket.description}</p>
    <details className="rounded-xl bg-neutral-50 p-3 text-xs"><summary className="cursor-pointer font-medium">Pantalla y comprobaciones</summary><div className="mt-3 space-y-2"><Link href={ticket.path} className="underline">Abrir {ticket.context.screen || "pantalla"} ↗</Link><ul className="list-disc pl-4 space-y-1">{ticket.context.facts?.map((fact, i) => <li key={i}>{fact}</li>)}</ul><p className="text-neutral-500">Guía {ticket.context.guideVersion} · versión {ticket.context.release?.slice(0, 8)} · roles {ticket.context.roles?.join(", ")}</p></div></details>
    {ticket.conversation.length > 0 && <details className="text-xs"><summary className="font-medium cursor-pointer">Conversación adjunta por el profesional</summary><div className="space-y-3 mt-3">{ticket.conversation.map((m, i) => <div key={i} className="rounded-lg bg-neutral-50 p-3"><p className="font-semibold mb-1">{m.role === "user" ? ticket.reporter : "Asistente"}</p><p className="whitespace-pre-wrap break-words">{m.text}</p></div>)}</div></details>}
    <div className="border-t border-neutral-100 pt-4 space-y-4"><h3 className="text-sm font-semibold">Seguimiento</h3>{ticket.eventCount > ticket.events.length && <p className="text-xs text-neutral-500">Mostrando las últimas {ticket.events.length} de {ticket.eventCount} actualizaciones.</p>}{ticket.events.length === 0 && <p className="text-sm text-neutral-500">Todavía no hay respuestas.</p>}{ticket.events.map(event => <article key={event.id} className="border-l-2 border-amber-300 pl-3"><p className="text-xs"><strong>{event.author}</strong><span className="text-neutral-400 ml-2">{date(event.createdAt)}</span></p>{event.body && <p className="text-sm whitespace-pre-wrap break-words mt-2">{event.body}</p>}<div className="text-[11px] text-neutral-500 mt-1">{event.status && <span>Estado: {statusLabels[event.status]} </span>}{event.priority && <span>· Prioridad: {priorityLabels[event.priority]}</span>}</div></article>)}</div>
    <form onSubmit={save} className="space-y-3 border-t border-neutral-100 pt-4">
      {manager && <div className="grid grid-cols-2 gap-3"><label className="text-xs font-medium">Estado<select className="input mt-1" value={status} onChange={e => { setStatus(e.target.value as TicketStatus); request.current = undefined; }}>{Object.entries(statusLabels).map(([k, label]) => <option key={k} value={k}>{label}</option>)}</select></label><label className="text-xs font-medium">Prioridad<select className="input mt-1" value={priority} onChange={e => { setPriority(e.target.value as TicketPriority); request.current = undefined; }}>{Object.entries(priorityLabels).map(([k, label]) => <option key={k} value={k}>{label}</option>)}</select></label></div>}
      <label className="block text-xs font-medium">{manager ? "Responder al profesional" : "Añadir información"}<textarea className="input mt-1" rows={4} value={body} maxLength={4000} onChange={e => { setBody(e.target.value); request.current = undefined; }} placeholder="Escribe aquí…" /></label>
      {error && <div role="alert" className="text-xs text-red-700"><p>{error}</p><button type="button" className="underline mt-2" onClick={async () => { request.current = undefined; await load(); }}>Actualizar estado (conserva tu texto)</button></div>}
      {notice && <p role="status" className="text-sm text-neutral-600">{notice}</p>}
      <button type="submit" className="btn btn-accent" disabled={!changed || busy}>{busy ? "Guardando…" : manager ? "Guardar actualización" : "Enviar información"}</button>
    </form>
  </section>;
}
