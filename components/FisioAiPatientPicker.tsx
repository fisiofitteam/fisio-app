"use client";

import { useEffect, useRef, useState } from "react";
import { Search, X, Loader2 } from "lucide-react";

export type PickedPatient = { id: string; fullName: string; programType: string | null };

/**
 * Buscador de paciente para adjuntar su ficha al chat del agente. Ligero:
 * lupa + input, debounce corto y desplegable de hasta 10 resultados.
 * Al elegir uno queda como chip; se puede quitar con la X.
 */
export function FisioAiPatientPicker({
  selected,
  onChange,
}: {
  selected: PickedPatient | null;
  onChange: (p: PickedPatient | null) => void;
}) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<PickedPatient[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const debounceRef = useRef<any>(null);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (q.trim().length < 2) {
      setResults([]);
      setOpen(false);
      return;
    }
    debounceRef.current = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/fisio-ai/patients-search?q=${encodeURIComponent(q.trim())}`);
        const data = await res.json();
        setResults(Array.isArray(data?.patients) ? data.patients : []);
        setOpen(true);
      } catch { setResults([]); }
      setLoading(false);
    }, 250);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [q]);

  function pick(p: PickedPatient) {
    onChange(p);
    setQ("");
    setResults([]);
    setOpen(false);
  }

  if (selected) {
    return (
      <div className="rounded-lg border border-neutral-300 bg-amber-50 px-3 py-2 flex items-center gap-2">
        <span className="text-xs font-bold uppercase tracking-widest text-amber-700">Paciente adjunto</span>
        <span className="text-sm font-semibold text-neutral-900 flex-1 truncate">
          {selected.fullName}
          {selected.programType && (
            <span className="ml-1.5 text-[10px] font-normal text-neutral-500">· {selected.programType}</span>
          )}
        </span>
        <button
          onClick={() => onChange(null)}
          className="text-neutral-500 hover:text-red-600 p-1 -mr-1"
          title="Quitar paciente adjunto"
        >
          <X size={14} />
        </button>
      </div>
    );
  }

  return (
    <div className="relative">
      <div className="flex items-center gap-2 rounded-lg border border-neutral-300 bg-white px-3 py-2">
        <Search size={14} className="text-neutral-400 flex-shrink-0" />
        <input
          type="text"
          className="flex-1 outline-none text-sm bg-transparent"
          placeholder="Buscar paciente para adjuntar su ficha…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onFocus={() => q.trim().length >= 2 && setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
        />
        {loading && <Loader2 size={14} className="animate-spin text-neutral-400" />}
      </div>
      {open && results.length > 0 && (
        <div className="absolute z-20 top-full left-0 right-0 mt-1 rounded-lg border border-neutral-200 bg-white shadow-lg max-h-64 overflow-y-auto">
          {results.map((p) => (
            <button
              key={p.id}
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => pick(p)}
              className="w-full text-left px-3 py-2 text-sm hover:bg-neutral-100 flex justify-between items-center"
            >
              <span className="font-medium text-neutral-900">{p.fullName}</span>
              {p.programType && <span className="text-[10px] text-neutral-500">{p.programType}</span>}
            </button>
          ))}
        </div>
      )}
      {open && !loading && q.trim().length >= 2 && results.length === 0 && (
        <div className="absolute z-20 top-full left-0 right-0 mt-1 rounded-lg border border-neutral-200 bg-white shadow-lg px-3 py-2 text-sm text-neutral-500">
          Ningún paciente coincide con "{q}".
        </div>
      )}
    </div>
  );
}
