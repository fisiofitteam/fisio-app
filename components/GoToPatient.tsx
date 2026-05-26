"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeftRight, Search } from "lucide-react";

type Result = { id: string; fullName: string; programType: string | null; diagnosis: string | null };

export function GoToPatient() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [results, setResults] = useState<Result[]>([]);
  const [loading, setLoading] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Cerrar al hacer click fuera
  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    }
    if (open) document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  // Foco al abrir
  useEffect(() => { if (open) inputRef.current?.focus(); }, [open]);

  // Búsqueda con debounce
  useEffect(() => {
    if (!open) return;
    const term = q.trim();
    if (!term) { setResults([]); return; }
    setLoading(true);
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/patients/search?q=${encodeURIComponent(term)}`);
        setResults(res.ok ? await res.json() : []);
      } catch { setResults([]); }
      setLoading(false);
    }, 220);
    return () => clearTimeout(t);
  }, [q, open]);

  function go(id: string) {
    setOpen(false);
    setQ("");
    router.push(`/fisio/paciente/${id}/calendario`);
  }

  return (
    <div className="relative" ref={boxRef}>
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-1.5 text-xs font-medium px-3 py-2 rounded-lg border border-neutral-200 bg-white hover:bg-neutral-50 whitespace-nowrap"
      >
        <ArrowLeftRight size={14} /> Ir a otro paciente
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-72 bg-white border border-neutral-200 rounded-xl shadow-lg z-50 p-2">
          <div className="flex items-center gap-2 px-2 py-1.5 rounded-lg border border-neutral-200 mb-1">
            <Search size={14} className="text-neutral-400 flex-shrink-0" />
            <input
              ref={inputRef}
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Nombre del paciente…"
              className="flex-1 text-sm bg-transparent outline-none"
            />
          </div>
          <div className="max-h-72 overflow-y-auto">
            {loading && <p className="text-xs text-neutral-400 px-2 py-2">Buscando…</p>}
            {!loading && q.trim() && results.length === 0 && (
              <p className="text-xs text-neutral-400 px-2 py-2">Sin resultados.</p>
            )}
            {!loading && !q.trim() && (
              <p className="text-xs text-neutral-400 px-2 py-2">Escribe para buscar.</p>
            )}
            {results.map((r) => (
              <button
                key={r.id}
                onClick={() => go(r.id)}
                className="w-full text-left px-2 py-2 rounded-lg hover:bg-neutral-100"
              >
                <div className="text-sm font-medium truncate">{r.fullName}</div>
                <div className="text-[11px] text-neutral-500 truncate">
                  {[r.programType, r.diagnosis].filter(Boolean).join(" · ") || "—"}
                </div>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
