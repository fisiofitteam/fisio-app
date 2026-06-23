"use client";
/**
 * Popup que aparece al abrir el panel "Mi CEO" cuando hay ítems de ayer
 * pendientes (dianas o cosas rápidas no marcadas como hechas).
 *
 * El usuario decide por cada ítem: marcar hecho ✓ / traerlo a hoy ↩ / tirar ✕.
 * También puede hacer la acción global "Traer todo a hoy".
 *
 * Para no agobiar, solo se autoabre la primera vez que se entra al panel
 * cada día (controlado con localStorage flag `ceo-carryover-checked-YYYY-MM-DD`).
 */
import { useEffect, useState } from "react";

type Item = { id: string; content: string; important: boolean; order: number };

function todayMadridYmd(): string {
  return new Date().toLocaleDateString("es-CA", { timeZone: "Europe/Madrid" });
}

export function CeoYesterdayCarryoverModal({ onResolved }: { onResolved: () => void }) {
  const [items, setItems] = useState<Item[]>([]);
  const [important, setImportant] = useState<Item[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    (async () => {
      const r = await fetch("/api/ceo/agenda/yesterday-pending", { cache: "no-store" });
      if (r.ok) {
        const data = await r.json();
        const imp = (data.importantItems ?? []) as Item[];
        const q = (data.items ?? []) as Item[];
        setImportant(imp);
        setItems(q);
        if (imp.length > 0 || q.length > 0) {
          const flag = `ceo-carryover-checked-${todayMadridYmd()}`;
          if (!localStorage.getItem(flag)) setOpen(true);
        }
      }
      setLoaded(true);
    })();
  }, []);

  function markCheckedForToday() {
    localStorage.setItem(`ceo-carryover-checked-${todayMadridYmd()}`, "1");
  }

  async function markDone(id: string) {
    setBusy(true);
    try {
      await fetch("/api/ceo/agenda", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, completedAt: new Date().toISOString() }),
      });
      setItems((arr) => arr.filter((x) => x.id !== id));
      setImportant((arr) => arr.filter((x) => x.id !== id));
    } finally { setBusy(false); }
  }

  async function discard(id: string) {
    setBusy(true);
    try {
      await fetch(`/api/ceo/agenda?id=${id}`, { method: "DELETE" });
      setItems((arr) => arr.filter((x) => x.id !== id));
      setImportant((arr) => arr.filter((x) => x.id !== id));
    } finally { setBusy(false); }
  }

  async function bringToToday(ids: string[]) {
    if (ids.length === 0) return;
    setBusy(true);
    try {
      await fetch("/api/ceo/agenda/carryover", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids }),
      });
      setItems((arr) => arr.filter((x) => !ids.includes(x.id)));
      setImportant((arr) => arr.filter((x) => !ids.includes(x.id)));
      // Notificar al panel para refrescar las quickies de hoy
      window.dispatchEvent(new CustomEvent("ceo-agenda:changed"));
    } finally { setBusy(false); }
  }

  function close() {
    markCheckedForToday();
    setOpen(false);
    onResolved();
  }

  if (!loaded || !open) return null;
  const allIds = [...important, ...items].map((x) => x.id);
  if (allIds.length === 0) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-16 px-4 bg-black/40" onClick={close}>
      <div className="bg-white rounded-lg shadow-xl w-full max-w-lg p-5" onClick={(e) => e.stopPropagation()}>
        <div className="flex justify-between items-baseline mb-1">
          <h2 className="font-semibold text-base">⏰ Quedaron cosas de ayer</h2>
          <button onClick={close} className="text-neutral-400 hover:text-neutral-700 text-xs">Cerrar</button>
        </div>
        <p className="text-xs text-neutral-500 mb-3">
          {allIds.length} ítem{allIds.length > 1 && "s"} sin terminar. Decide qué hacer con cada uno o trae todo a hoy.
        </p>

        <div className="space-y-3">
          {important.length > 0 && (
            <div>
              <h3 className="text-[10px] uppercase tracking-wide text-neutral-500 mb-1">🎯 Dianas pendientes</h3>
              <div className="space-y-1.5">
                {important.map((it) => (
                  <CarryoverRow key={it.id} item={it} onDone={markDone} onDiscard={discard} onBring={(id) => bringToToday([id])} busy={busy} />
                ))}
              </div>
            </div>
          )}
          {items.length > 0 && (
            <div>
              <h3 className="text-[10px] uppercase tracking-wide text-neutral-500 mb-1">📌 Cosas rápidas pendientes</h3>
              <div className="space-y-1.5">
                {items.map((it) => (
                  <CarryoverRow key={it.id} item={it} onDone={markDone} onDiscard={discard} onBring={(id) => bringToToday([id])} busy={busy} />
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="flex justify-between gap-2 mt-4 pt-3 border-t border-neutral-100">
          <button
            onClick={() => bringToToday(allIds).then(close)}
            disabled={busy}
            className="text-xs btn btn-primary px-3 py-1.5 disabled:opacity-50"
          >
            ↩ Traer todo a hoy
          </button>
          <button onClick={close} className="text-xs text-neutral-500 hover:text-neutral-900">
            Más tarde
          </button>
        </div>
      </div>
    </div>
  );
}

function CarryoverRow({
  item, onDone, onDiscard, onBring, busy,
}: {
  item: Item;
  onDone: (id: string) => void;
  onDiscard: (id: string) => void;
  onBring: (id: string) => void;
  busy: boolean;
}) {
  return (
    <div className="flex items-center gap-2 p-2 border border-neutral-200 rounded">
      <span className="text-sm flex-1 truncate">{item.content}</span>
      <button onClick={() => onDone(item.id)} disabled={busy} className="text-[11px] text-emerald-700 hover:underline whitespace-nowrap" title="Marcar como hecha (ayer)">
        ✓ Hecho
      </button>
      <button onClick={() => onBring(item.id)} disabled={busy} className="text-[11px] text-blue-700 hover:underline whitespace-nowrap" title="Traer a hoy en rojo">
        ↩ Hoy
      </button>
      <button onClick={() => onDiscard(item.id)} disabled={busy} className="text-[11px] text-red-600 hover:underline whitespace-nowrap" title="Borrar">
        ✕ Tirar
      </button>
    </div>
  );
}
