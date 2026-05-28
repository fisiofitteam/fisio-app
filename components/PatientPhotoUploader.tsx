"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { upload } from "@vercel/blob/client";
import { ImagePlus, X } from "lucide-react";

// Subida de foto de perfil del paciente. Sube el archivo directamente al Vercel Blob
// vía /api/community/upload (que acepta pacientes) y guarda la URL con PATCH al
// endpoint /api/patient/photo. Llama a router.refresh() tras guardar para que el
// banner del home y el avatar se actualicen.
export function PatientPhotoUploader({ initialUrl }: { initialUrl: string | null }) {
  const router = useRouter();
  const [photoUrl, setPhotoUrl] = useState<string | null>(initialUrl);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function persist(url: string | null) {
    setSaving(true);
    setErr(null);
    try {
      const res = await fetch("/api/patient/photo", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ photoUrl: url }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d?.error || "No se pudo guardar");
      }
      setPhotoUrl(url);
      router.refresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "No se pudo guardar");
    }
    setSaving(false);
  }

  async function handleFile(file: File) {
    setErr(null);
    if (!file.type.startsWith("image/")) { setErr("Sólo imágenes."); return; }
    if (file.size > 10 * 1024 * 1024) { setErr("Máximo 10 MB."); return; }
    setUploading(true);
    try {
      const blob = await upload(file.name, file, { access: "public", handleUploadUrl: "/api/community/upload" });
      await persist(blob.url);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Error al subir");
    }
    setUploading(false);
  }

  const busy = uploading || saving;

  return (
    <div className="flex items-center gap-4">
      <div
        className="w-20 h-20 rounded-full flex items-center justify-center flex-shrink-0 overflow-hidden"
        style={{ background: photoUrl ? "transparent" : "linear-gradient(135deg, var(--p-accent) 0%, #F59E0B 100%)", border: "1px solid var(--p-border-strong)" }}
      >
        {photoUrl ? (
          <img src={photoUrl} alt="" className="w-full h-full object-cover" />
        ) : (
          <span className="text-2xl font-bold" style={{ color: "var(--p-accent-ink)" }}>?</span>
        )}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <label className="text-xs cursor-pointer px-3 py-1.5 rounded-lg font-medium" style={{ background: "var(--p-accent)", color: "var(--p-accent-ink)", opacity: busy ? 0.6 : 1 }}>
            <ImagePlus size={14} className="inline -mt-0.5 mr-1" />
            {busy ? "Subiendo…" : photoUrl ? "Cambiar foto" : "Subir foto"}
            <input
              type="file"
              accept="image/*"
              className="hidden"
              disabled={busy}
              onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = ""; }}
            />
          </label>
          {photoUrl && (
            <button onClick={() => persist(null)} disabled={busy} className="text-xs px-2 py-1.5 rounded-lg" style={{ color: "var(--p-text-dim)" }}>
              <X size={13} className="inline -mt-0.5 mr-0.5" /> Quitar
            </button>
          )}
        </div>
        <p className="text-[11px] mt-1" style={{ color: "var(--p-text-faint)" }}>Cuadrada (~400×400). Máx 10 MB.</p>
        {err && <p className="text-xs mt-1" style={{ color: "#FCA5A5" }}>{err}</p>}
      </div>
    </div>
  );
}
