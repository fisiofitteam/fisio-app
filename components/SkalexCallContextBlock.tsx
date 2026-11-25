"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import type { SkalexCallContext } from "@/lib/skalex/insights";

// Share requests between card/detail mounts and limit expensive first lookups.
const requests = new Map<string, Promise<SkalexCallContext>>();
const queue: Array<() => void> = []; let active = 0;
function drain() { while (active < 2 && queue.length) { active++; queue.shift()!(); } }
function requestContext(id: string) {
  const previous = requests.get(id); if (previous) return previous;
  const promise = new Promise<SkalexCallContext>((resolve, reject) => {
    queue.push(() => { void (async () => {
      try {
        const response = await fetch(`/api/leads/${encodeURIComponent(id)}/skalex-insights`, { method: "POST", signal: AbortSignal.timeout(95000) });
        const body = await response.json(); if (!response.ok) throw Error(body.error || "No se pudo consultar Skalex.");
        resolve(body.context);
      } catch (error) { reject(error); }
      finally { active--; drain(); }
    })(); }); drain();
  });
  requests.set(id, promise); void promise.finally(() => requests.delete(id)).catch(() => {}); return promise;
}
export function SkalexCallContextBlock({ leadId, initial, autoLoad = false }: { leadId: string; initial?: SkalexCallContext; autoLoad?: boolean }) {
  const [context, setContext] = useState(initial), [loading, setLoading] = useState(false), [error, setError] = useState("");
  const [expanded, setExpanded] = useState(false), [attempt, setAttempt] = useState(0);
  const container = useRef<HTMLDivElement>(null), mounted = useRef(true), busy = useRef(false);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useEffect(() => { if (initial) setContext(initial); }, [initial]);
  const load = useCallback(async () => {
    if (busy.current) return; busy.current = true; setLoading(true); setError(""); setAttempt(a => a + 1);
    try { const value = await requestContext(leadId); if (mounted.current) setContext(value); }
    catch (err) { if (mounted.current) setError(err instanceof Error && err.name !== "TimeoutError" ? err.message : "Skalex ha tardado demasiado. Vuelve a intentarlo."); }
    finally { busy.current = false; if (mounted.current) setLoading(false); }
  }, [leadId]);
  useEffect(() => {
    if (!autoLoad || attempt || context?.status === "ready" || (context?.retryAt && Date.parse(context.retryAt) > Date.now())) return;
    const observer = new IntersectionObserver(entries => { if (entries.some(entry => entry.isIntersecting)) { observer.disconnect(); void load(); } }, { rootMargin: "100px" });
    if (container.current) observer.observe(container.current); return () => observer.disconnect();
  }, [autoLoad, attempt, context, load]);
  useEffect(() => {
    if (!autoLoad || context?.reason !== "generating" || attempt >= 3 || loading) return;
    const timer = setTimeout(() => { void load(); }, Math.max(1000, Date.parse(context.retryAt || "") - Date.now() || 20000));
    return () => clearTimeout(timer);
  }, [autoLoad, context, attempt, loading, load]);
  const ready = context?.status === "ready", visible = ready ? (expanded ? context.fields : context.fields.slice(0, 3)) : [];
  return <div ref={container} className="mt-3 rounded-xl border border-violet-200 bg-violet-50/70 p-3 text-xs text-violet-950" onClick={e => e.stopPropagation()}>
    <div className="flex items-center justify-between gap-2"><h3 className="font-semibold">Contexto para la llamada <span className="ml-1 text-[10px] font-normal text-violet-700">Skalex · IA</span></h3>{ready && <span className="text-[10px] text-violet-700">Conversación previa</span>}</div>
    {ready && <><dl className="mt-3 space-y-3">{visible.map(field => <div key={field.key}><dt className="font-semibold">{field.label}</dt><dd className={`mt-0.5 whitespace-pre-wrap leading-relaxed text-neutral-700 ${expanded ? "" : "line-clamp-3"}`}>{field.value}</dd></div>)}</dl>
      <button type="button" onClick={() => setExpanded(v => !v)} className="mt-3 font-medium underline">{expanded ? "Ver menos" : "Ver contexto completo"}</button>
      {context.generatedAt && <p className="mt-2 text-[10px] text-neutral-500">Generado por Skalex el {new Date(context.generatedAt).toLocaleDateString("es-ES", { timeZone: "Europe/Madrid" })}</p>}</>}
    {!ready && <p className="mt-2 leading-relaxed text-neutral-600" role="status">{loading ? "Preparando el contexto… La primera consulta puede tardar unos 35 segundos." : context?.message || "Dolor, situación, objetivos y demás contexto disponible en la conversación."}</p>}
    {error && <p className="mt-2 text-red-700" role="alert">{error}</p>}
    {!ready && <button type="button" disabled={loading} onClick={() => void load()} className="mt-2 font-medium underline disabled:opacity-50">{loading ? "Consultando Skalex…" : attempt || context ? "Volver a consultar" : "Consultar contexto"}</button>}
  </div>;
}
