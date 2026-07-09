"use client";

import { useEffect, useState } from "react";

type LibraryItem = {
  id: string;
  url: string;
  label: string;
  source: "Curso" | "Post";
  date: string;
};

/**
 * Modal para elegir fondo de slide desde las imágenes ya alojadas por el
 * equipo (portadas de cursos + posts publicados). Evita al CEO tener que
 * pegar URLs a mano.
 *
 * Filtro por fuente en la cabecera. Click en una thumbnail asigna la URL
 * al slide y cierra el modal.
 */
export function LibraryBackgroundPicker({
  onPick,
  onClose,
}: {
  onPick: (url: string) => void;
  onClose: () => void;
}) {
  const [items, setItems] = useState<LibraryItem[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | "Curso" | "Post">("all");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/story-maker/library-images");
        const data = await res.json();
        if (cancelled) return;
        if (!res.ok || !data.ok) {
          setError(data.error || "No se pudieron cargar las imágenes");
        } else {
          setItems(data.items);
        }
      } catch (e: any) {
        if (!cancelled) setError(e?.message || "Error de red");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // Cerrar con Esc
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const filtered = items?.filter((i) => filter === "all" || i.source === filter) ?? [];

  return (
    <div
      className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl max-w-3xl w-full max-h-[85vh] overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-4 border-b border-neutral-200">
          <div>
            <h3 className="font-semibold text-sm">📷 Biblioteca de imágenes</h3>
            <p className="text-[11px] text-neutral-500 mt-0.5">
              Portadas de cursos y posts publicados por el equipo. Click en una para usarla como fondo.
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-neutral-400 hover:text-neutral-900 text-xl leading-none"
          >
            ✕
          </button>
        </div>

        <div className="px-4 pt-3 pb-2 flex gap-1 border-b border-neutral-100">
          <FilterChip active={filter === "all"} onClick={() => setFilter("all")}>
            Todas
          </FilterChip>
          <FilterChip active={filter === "Curso"} onClick={() => setFilter("Curso")}>
            Cursos
          </FilterChip>
          <FilterChip active={filter === "Post"} onClick={() => setFilter("Post")}>
            Posts
          </FilterChip>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          {loading && (
            <p className="text-sm text-neutral-500 italic text-center py-10">
              Cargando…
            </p>
          )}
          {error && (
            <p className="text-sm text-red-600 text-center py-10">{error}</p>
          )}
          {!loading && !error && filtered.length === 0 && (
            <p className="text-sm text-neutral-500 italic text-center py-10">
              No hay imágenes en esta categoría. Sube algún curso o post con
              imagen desde Comunidad y aparecerá aquí.
            </p>
          )}
          {filtered.length > 0 && (
            <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
              {filtered.map((it) => (
                <button
                  key={it.id}
                  onClick={() => onPick(it.url)}
                  className="group relative aspect-[4/5] rounded-lg overflow-hidden bg-neutral-100 border border-neutral-200 hover:border-amber-400 hover:ring-2 hover:ring-amber-200 transition-all"
                  title={it.label}
                >
                  <img
                    src={it.url}
                    alt={it.label}
                    className="w-full h-full object-cover"
                    loading="lazy"
                  />
                  <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent p-2">
                    <div className="text-[10px] text-white/70 uppercase font-bold tracking-wider">
                      {it.source}
                    </div>
                    <div className="text-[11px] text-white font-medium truncate">
                      {it.label}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function FilterChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`text-xs font-medium px-3 py-1 rounded-full ${
        active
          ? "bg-neutral-900 text-white"
          : "bg-white border border-neutral-200 text-neutral-600 hover:border-neutral-400"
      }`}
    >
      {children}
    </button>
  );
}
