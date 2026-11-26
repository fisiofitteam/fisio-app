"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import { ArrowUp, ExternalLink, LifeBuoy, Lightbulb, MessageCircle, Minus, RefreshCw, TriangleAlert } from "lucide-react";
import type { ChatDTO, TicketKind } from "@/lib/support/contracts";
import { screenFor } from "@/lib/support/screen";
import { SupportTicketComposer } from "./SupportTicketComposer";
import { supportFetch } from "./api";

export function SupportAssistant() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false), [chat, setChat] = useState<ChatDTO | null>(null);
  const [text, setText] = useState(""), [busy, setBusy] = useState(false), [loading, setLoading] = useState(false), [error, setError] = useState("");
  const [composer, setComposer] = useState<{ kind: TicketKind; path: string } | null>(null);
  const input = useRef<HTMLTextAreaElement>(null), trigger = useRef<HTMLButtonElement>(null), end = useRef<HTMLDivElement>(null);
  const retry = useRef<{ id: string; text: string; path: string } | null>(null);
  const refresh = useCallback(async () => {
    setLoading(true);
    try { setChat(await supportFetch<ChatDTO>("/api/support/chat")); setError(""); }
    catch (e) { setError(e instanceof Error ? e.message : "No se pudo cargar la conversación."); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { if (open) refresh(); }, [open, refresh]);
  useEffect(() => { if (!open || !chat?.busy || busy) return; const timer = setTimeout(refresh, 4000); return () => clearTimeout(timer); }, [open, chat, busy, refresh]);
  useEffect(() => { if (open && !composer) input.current?.focus(); }, [open, composer]);
  useEffect(() => { if (open && !composer) end.current?.scrollIntoView({ block: "nearest" }); }, [chat?.messages.length, open, composer, busy]);
  const close = useCallback(() => { setOpen(false); trigger.current?.focus(); }, []);
  useEffect(() => {
    if (!open) return;
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") close(); };
    document.addEventListener("keydown", key); return () => document.removeEventListener("keydown", key);
  }, [open, close]);
  async function send(value = text) {
    const content = value.trim(); if (!content || busy || chat?.busy || !chat) return;
    setBusy(true); setError("");
    if (!retry.current || retry.current.text !== content || retry.current.path !== pathname) retry.current = { id: crypto.randomUUID(), text: content, path: pathname };
    try {
      const next = await supportFetch<ChatDTO>("/api/support/chat", { text: content, path: pathname, version: chat.version, requestId: retry.current.id });
      setChat(next); setText(""); retry.current = null;
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo enviar.");
      try { setChat(await supportFetch<ChatDTO>("/api/support/chat")); } catch { /* Keep the local draft for retry. */ }
    } finally { setBusy(false); }
  }
  const waiting = busy || chat?.busy;
  return <div className="print:hidden text-neutral-900">
    {open && <section role="dialog" aria-modal="false" aria-label="Asistente de FisioFit" className="fixed z-[70] bottom-24 sm:bottom-20 right-3 sm:right-5 w-[calc(100vw-1.5rem)] sm:w-[410px] max-h-[calc(100dvh-8rem)] sm:max-h-[min(720px,calc(100dvh-7rem))] flex flex-col rounded-2xl border border-neutral-200 bg-white shadow-2xl overflow-hidden">
      <header className="flex items-center gap-3 px-4 py-3 bg-neutral-950 text-white shrink-0">
        <span className="grid h-9 w-9 place-items-center rounded-xl bg-amber-400 text-neutral-950"><LifeBuoy size={19} /></span>
        <div className="flex-1"><h2 className="text-sm font-semibold">Tu asistente FisioFit</h2><p className="text-[11px] text-neutral-400">Ayuda con la app · IA</p></div>
        <button type="button" onClick={close} className="p-2 rounded-lg hover:bg-neutral-800 focus-visible:outline focus-visible:outline-amber-400" aria-label="Minimizar asistente"><Minus size={18} /></button>
      </header>
      <div className="flex justify-between gap-2 items-center px-4 py-2 border-b border-neutral-100 text-[11px] shrink-0"><span className="text-neutral-500 truncate">En {screenFor(pathname)}</span><Link href="/fisio/soporte" onClick={close} className="font-medium whitespace-nowrap flex gap-1 items-center">Mis avisos <ExternalLink size={11} /></Link></div>
      <div className="overflow-y-auto overscroll-contain flex-1 min-h-0">
        {composer ? <SupportTicketComposer key={composer.kind + composer.path} {...composer} suggestion={chat?.messages.filter(m => m.role === "user").at(-1)?.text ?? ""} onClose={() => setComposer(null)} /> : <div className="p-4 space-y-4 min-h-[220px]">
          {!chat?.messages.length && <div className="py-3"><MessageCircle className="text-amber-600 mb-3" size={26} /><h3 className="font-semibold text-lg">¿Qué necesitas resolver?</h3><p className="text-sm text-neutral-500 mt-2">Te ayudo a encontrar funciones y entender bloqueos. La conversación te acompaña al cambiar de pantalla.</p>
            <div className="flex flex-wrap gap-2 mt-4">{["¿Qué puedo hacer en esta pantalla?", pathname.includes("valoraciones") ? "¿Qué falta para publicar el informe?" : "¿Cómo encuentro una función en el menú?"].map(q => <button type="button" key={q} disabled={!chat || !!waiting} onClick={() => send(q)} className="rounded-xl border border-neutral-200 bg-neutral-50 px-3 py-2 text-xs text-left hover:border-amber-400 disabled:opacity-50">{q}</button>)}</div>
          </div>}
          {loading && !chat && <p role="status" className="text-sm text-neutral-500">Recuperando tu conversación…</p>}
          {chat?.messages.map(m => <article key={m.id} className={m.role === "user" ? "ml-8 rounded-2xl rounded-br-md bg-neutral-900 text-white p-3" : "mr-2 rounded-2xl rounded-bl-md bg-neutral-50 border border-neutral-100 p-3"}>
            <p className={"text-[10px] font-semibold mb-2 " + (m.role === "user" ? "text-neutral-400" : "text-amber-700")}>{m.role === "user" ? "Tú" : "Asistente FisioFit"}</p>
            <p className="text-sm leading-relaxed whitespace-pre-wrap break-words">{m.text}</p>
            {!!m.answer?.steps.length && <ol className="list-decimal pl-4 mt-3 text-sm space-y-2">{m.answer.steps.map((step, i) => <li key={i}>{step}</li>)}</ol>}
            {!!m.answer?.links.length && <div className="flex flex-wrap gap-2 mt-3">{m.answer.links.map(link => <Link key={link.href + link.title} href={link.href} className="text-xs font-medium underline underline-offset-2">{link.title} ↗</Link>)}</div>}
            {m.answer && <p className="text-[10px] text-neutral-500 mt-3">{m.answer.fallback ? "Respuesta de respaldo" : "Guía de la app"} · {m.answer.context.screen}</p>}
          </article>)}
          {waiting && <p role="status" className="text-xs text-neutral-500 animate-pulse motion-reduce:animate-none">Comprobando el contexto y preparando la respuesta…</p>}
          {error && <div role="alert" className="text-xs text-red-700 space-y-2"><p>{error}</p><button type="button" onClick={refresh} disabled={loading || busy} className="underline inline-flex gap-1 items-center"><RefreshCw size={12} />Actualizar conversación</button></div>}
          <div ref={end} />
        </div>}
      </div>
      {!composer && <div className="shrink-0 border-t border-neutral-100 p-3 bg-white">
        <form onSubmit={e => { e.preventDefault(); send(); }} className="flex items-end gap-2 rounded-xl border border-neutral-300 p-2 focus-within:border-amber-500">
          <textarea ref={input} aria-label="Tu consulta al asistente" value={text} onChange={e => setText(e.target.value)} onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); send(); } }} maxLength={2400} rows={2} placeholder="Cuéntame qué necesitas…" className="min-w-0 flex-1 resize-none bg-transparent px-1 py-1 text-sm outline-none" />
          <button type="submit" aria-label="Enviar consulta" disabled={!text.trim() || !!waiting || !chat} className="grid place-items-center h-9 w-9 shrink-0 rounded-lg bg-amber-400 text-neutral-950 disabled:opacity-40 hover:bg-amber-300"><ArrowUp size={18} /></button>
        </form>
        <div className="flex justify-between mt-3 gap-2 text-[11px] font-medium">
          <button type="button" onClick={() => setComposer({ kind: "problem", path: pathname })} className="flex items-center gap-1.5 hover:underline"><TriangleAlert size={13} />Reportar un problema</button>
          <button type="button" onClick={() => setComposer({ kind: "improvement", path: pathname })} className="flex items-center gap-1.5 hover:underline"><Lightbulb size={13} />Proponer una mejora</button>
        </div>
      </div>}
    </section>}
    <button ref={trigger} type="button" aria-label={open ? "Minimizar asistente FisioFit" : "Abrir asistente FisioFit"} aria-expanded={open} onClick={() => open ? close() : setOpen(true)} className="fixed z-[70] bottom-8 sm:bottom-5 right-3 sm:right-5 flex items-center gap-2 h-12 px-4 rounded-full bg-neutral-950 text-white border border-neutral-700 shadow-lg hover:bg-neutral-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-500 focus-visible:outline-offset-4">
      <LifeBuoy size={21} className="text-amber-400" /><span className="text-sm font-medium">Ayuda</span>
    </button>
  </div>;
}
