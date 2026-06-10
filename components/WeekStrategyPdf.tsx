"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";

/**
 * Subida y gestión del PDF de estrategia de la semana. Vive en la cabecera
 * de ThisWeekView. Si no hay PDF subido, muestra botón "Subir estrategia
 * (PDF)". Si hay, muestra el nombre con enlace + botones "Cambiar" y
 * "Quitar".
 *
 * Solo se renderiza si el rol es CEO (el componente padre filtra).
 */
export function WeekStrategyPdf({
  weekId,
  initialUrl,
  initialName,
}: {
  weekId: string;
  initialUrl: string | null;
  initialName: string | null;
}) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState<"upload" | "remove" | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    setBusy("upload");
    try {
      // 1) Subir el PDF a Blob
      const form = new FormData();
      form.append("file", file);
      const up = await fetch("/api/upload-pdf", { method: "POST", body: form });
      if (!up.ok) {
        const d = await up.json().catch(() => ({}));
        throw new Error(d?.error || "No se pudo subir el PDF");
      }
      const data = await up.json();
      // 2) Guardar la URL en la semana
      const patch = await fetch("/api/content/weeks", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: weekId, strategyPdfUrl: data.url, strategyPdfName: data.name }),
      });
      if (!patch.ok) throw new Error("PDF subido pero no se pudo enlazar a la semana");
      router.refresh();
    } catch (e: any) {
      setError(e?.message || "Error subiendo");
    } finally {
      setBusy(null);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function onRemove() {
    if (!confirm("¿Quitar el PDF de estrategia de esta semana?")) return;
    setBusy("remove");
    setError(null);
    try {
      const res = await fetch("/api/content/weeks", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: weekId, strategyPdfUrl: null, strategyPdfName: null }),
      });
      if (!res.ok) throw new Error("No se pudo quitar");
      router.refresh();
    } catch (e: any) {
      setError(e?.message || "Error");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div
      className="mt-3 rounded-lg p-3 flex items-center justify-between gap-3 flex-wrap"
      style={{ background: "#FAFAFA", border: "1px solid #E5E5E5" }}
    >
      <div className="flex items-center gap-2 min-w-0 flex-1">
        <span className="text-lg flex-shrink-0">📄</span>
        {initialUrl ? (
          <div className="min-w-0 flex-1">
            <div className="text-xs text-neutral-500 uppercase tracking-wide font-medium">
              Estrategia de la semana
            </div>
            <a
              href={initialUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm font-medium hover:underline truncate block"
            >
              {initialName || "Documento.pdf"} ↗
            </a>
          </div>
        ) : (
          <div className="min-w-0 flex-1">
            <div className="text-sm font-medium">Estrategia de la semana</div>
            <div className="text-xs text-neutral-500">
              Sube un PDF con la estrategia, briefing o notas largas de esta semana.
            </div>
          </div>
        )}
      </div>

      <div className="flex gap-2 flex-shrink-0">
        <input
          ref={fileRef}
          type="file"
          accept="application/pdf,.pdf"
          onChange={onPick}
          className="hidden"
          disabled={!!busy}
        />
        <button
          onClick={() => fileRef.current?.click()}
          disabled={!!busy}
          className="text-xs font-medium px-3 py-1.5 rounded-lg"
          style={{ background: "#FFFFFF", border: "1px solid #D4D4D4" }}
        >
          {busy === "upload" ? "Subiendo…" : initialUrl ? "Cambiar" : "📤 Subir PDF"}
        </button>
        {initialUrl && (
          <button
            onClick={onRemove}
            disabled={!!busy}
            className="text-xs font-medium px-3 py-1.5 rounded-lg text-red-700 hover:bg-red-50"
            style={{ background: "#FFFFFF", border: "1px solid #FCA5A5" }}
          >
            {busy === "remove" ? "…" : "Quitar"}
          </button>
        )}
      </div>

      {error && (
        <div
          className="w-full mt-1 text-xs rounded px-2 py-1"
          style={{ background: "#FEE2E2", color: "#7F1D1D" }}
        >
          ⚠ {error}
        </div>
      )}
    </div>
  );
}
