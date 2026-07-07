"use client";

import { useEffect, useState } from "react";

type Tag = { id: string; label: string; color: string | null; active: boolean };

/**
 * Selector de "etiqueta de origen del lead" con creación en línea.
 * - Dropdown con las etiquetas activas del catálogo.
 * - Botón "+ Nueva" que abre un input inline para crear una nueva sin salir.
 * - Chip con la etiqueta seleccionada + botón "quitar".
 *
 * Cambios se propagan al padre por onChange(tagId | null).
 */
export function LeadSourceTagPicker({
  value,
  onChange,
  compact = false,
}: {
  value: string | null;
  onChange: (tagId: string | null) => void;
  compact?: boolean;
}) {
  const [tags, setTags] = useState<Tag[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [newLabel, setNewLabel] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const res = await fetch("/api/lead-source-tags", { cache: "no-store" });
      if (!res.ok) throw new Error("no se pudieron cargar");
      setTags(await res.json());
    } catch {
      setTags([]);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { load(); }, []);

  async function createTag() {
    if (!newLabel.trim()) { setCreating(false); return; }
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/lead-source-tags", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ label: newLabel.trim() }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d?.error || "error");
      await load();
      setNewLabel("");
      setCreating(false);
      onChange(d.id);
    } catch (e: any) {
      setError(e?.message || "Error");
    } finally {
      setBusy(false);
    }
  }

  const selected = tags.find((t) => t.id === value) ?? null;

  return (
    <div className={compact ? "space-y-1" : "space-y-2"}>
      <div className="flex items-center gap-2 flex-wrap">
        <select
          value={value ?? ""}
          onChange={(e) => onChange(e.target.value || null)}
          className="input text-sm flex-1 min-w-[140px]"
          disabled={loading || busy}
        >
          <option value="">— Sin etiqueta —</option>
          {tags.map((t) => (
            <option key={t.id} value={t.id}>{t.label}</option>
          ))}
        </select>
        {creating ? (
          <div className="flex items-center gap-1">
            <input
              type="text"
              autoFocus
              maxLength={60}
              value={newLabel}
              onChange={(e) => setNewLabel(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") { e.preventDefault(); createTag(); }
                if (e.key === "Escape") { setCreating(false); setNewLabel(""); setError(""); }
              }}
              placeholder="Nombre de la etiqueta"
              className="input text-sm"
            />
            <button
              type="button"
              onClick={createTag}
              disabled={busy || !newLabel.trim()}
              className="text-xs font-medium px-2 py-1 rounded disabled:opacity-50"
              style={{ background: "#0A0A0A", color: "#FAFAFA" }}
            >
              {busy ? "…" : "✓"}
            </button>
            <button
              type="button"
              onClick={() => { setCreating(false); setNewLabel(""); setError(""); }}
              className="text-xs text-neutral-500 px-1"
            >
              ✕
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setCreating(true)}
            className="text-xs text-blue-700 hover:underline whitespace-nowrap"
          >
            + Nueva
          </button>
        )}
      </div>
      {error && <div className="text-[11px] text-red-600">{error}</div>}
      {selected && !compact && (
        <div className="text-[10px] text-neutral-500 italic">
          Etiqueta seleccionada: <strong>{selected.label}</strong>
        </div>
      )}
    </div>
  );
}

/**
 * Chip compacto para mostrar la etiqueta de origen en una tarjeta de lead.
 * Devuelve null si no hay etiqueta.
 */
export function LeadSourceTagChip({ tag }: { tag: { label: string; color?: string | null } | null }) {
  if (!tag) return null;
  const bg = tag.color ?? "#F5F5F5";
  return (
    <span
      className="text-[9px] font-bold tracking-wider px-1.5 py-0.5 rounded uppercase"
      style={{ background: bg, color: "#111827" }}
    >
      {tag.label}
    </span>
  );
}
