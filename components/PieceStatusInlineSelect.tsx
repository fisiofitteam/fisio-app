"use client";
/**
 * Selector inline del estado de una ContentPiece.
 *
 * Diseñado para tarjetas de dossier / listados donde el CEO quiere
 * pulsar en el estado y cambiarlo sin abrir el editor. Guarda vía PATCH
 * al mismo endpoint que usa el editor y muestra un tick verde al éxito.
 *
 * Se oculta al imprimir — el print muestra el badge plano.
 */
import { useState } from "react";
import { useRouter } from "next/navigation";

const OPTIONS: { value: string; label: string; badgeClass: string }[] = [
  { value: "idea",       label: "Idea",       badgeClass: "bg-neutral-100 text-neutral-700 border-neutral-200" },
  { value: "script",     label: "Guion listo", badgeClass: "bg-amber-100 text-amber-800 border-amber-200" },
  { value: "recorded",   label: "Grabado",    badgeClass: "bg-blue-100 text-blue-800 border-blue-200" },
  { value: "edited",     label: "Editado",    badgeClass: "bg-purple-100 text-purple-800 border-purple-200" },
  { value: "scheduled",  label: "Programado", badgeClass: "bg-indigo-100 text-indigo-800 border-indigo-200" },
  { value: "published",  label: "Publicado",  badgeClass: "bg-emerald-100 text-emerald-800 border-emerald-200" },
];

export function PieceStatusInlineSelect({ pieceId, initialStatus }: { pieceId: string; initialStatus: string }) {
  const router = useRouter();
  const [status, setStatus] = useState(initialStatus);
  const [saving, setSaving] = useState<"idle" | "saving" | "saved" | "error">("idle");

  const current = OPTIONS.find((o) => o.value === status) ?? OPTIONS[0];

  async function change(newStatus: string) {
    if (newStatus === status) return;
    const previous = status;
    setStatus(newStatus);
    setSaving("saving");
    try {
      const res = await fetch("/api/content/pieces", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: pieceId, status: newStatus }),
      });
      if (!res.ok) {
        setStatus(previous);
        setSaving("error");
        setTimeout(() => setSaving("idle"), 2000);
        return;
      }
      setSaving("saved");
      setTimeout(() => setSaving((s) => (s === "saved" ? "idle" : s)), 1200);
      router.refresh();
    } catch {
      setStatus(previous);
      setSaving("error");
      setTimeout(() => setSaving("idle"), 2000);
    }
  }

  return (
    <>
      {/* Interactivo en pantalla */}
      <span className="relative inline-flex items-center gap-1 print:hidden">
        <select
          value={status}
          onChange={(e) => change(e.target.value)}
          disabled={saving === "saving"}
          className={`text-[10px] px-1.5 py-0.5 rounded-full border cursor-pointer appearance-none pr-4 focus:outline-none focus:ring-1 focus:ring-neutral-400 ${current.badgeClass}`}
          style={{ backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='8' height='8' viewBox='0 0 8 8'%3E%3Cpath fill='%23555' d='M4 6L0 2h8z'/%3E%3C/svg%3E\")", backgroundRepeat: "no-repeat", backgroundPosition: "right 4px center" }}
          title="Cambiar estado"
        >
          {OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
        {saving === "saving" && <span className="text-[9px] text-neutral-400">…</span>}
        {saving === "saved" && <span className="text-[9px] text-emerald-600">✓</span>}
        {saving === "error" && <span className="text-[9px] text-red-600">✕</span>}
      </span>
      {/* Estático al imprimir */}
      <span className={`hidden print:inline text-[10px] px-1.5 py-0.5 rounded-full border ${current.badgeClass}`}>
        {current.label}
      </span>
    </>
  );
}
