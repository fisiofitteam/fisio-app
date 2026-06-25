"use client";

import { useEffect, useRef, useState } from "react";

export function LoadReviewBriefEditor({
  initial,
}: {
  initial: {
    methodology: string;
    hardRules: string;
    goodExamples: string;
    briefPdfUrl?: string | null;
    briefPdfName?: string | null;
    briefPdfSize?: number | null;
  };
}) {
  const initialJoined = [initial.methodology, initial.hardRules, initial.goodExamples]
    .map((s) => (s || "").trim())
    .filter(Boolean)
    .join("\n\n");

  const [content, setContent] = useState(initialJoined);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // PDF adjunto
  const [pdfUrl, setPdfUrl] = useState<string | null>(initial.briefPdfUrl ?? null);
  const [pdfName, setPdfName] = useState<string | null>(initial.briefPdfName ?? null);
  const [pdfSize, setPdfSize] = useState<number | null>(initial.briefPdfSize ?? null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);

  function scheduleSave(next: string) {
    setSaving(true);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      const r = await fetch("/api/load-review/brief", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ methodology: next, hardRules: "", goodExamples: "" }),
      });
      setSaving(false);
      if (r.ok) setSavedAt(new Date());
    }, 800);
  }
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  async function uploadPdf(file: File) {
    setUploadError(null);
    setUploading(true);
    try {
      const form = new FormData();
      form.append("file", file);
      const r = await fetch("/api/load-review/brief/pdf", { method: "POST", body: form });
      const data = await r.json();
      if (!r.ok) throw new Error(data?.error ?? "Error subiendo");
      setPdfUrl(data?.brief?.briefPdfUrl ?? null);
      setPdfName(data?.brief?.briefPdfName ?? null);
      setPdfSize(data?.brief?.briefPdfSize ?? null);
    } catch (e: any) {
      setUploadError(e?.message ?? "No se pudo subir");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function removePdf() {
    if (!confirm("¿Quitar el PDF adjunto? La IA ya no lo usará.")) return;
    const r = await fetch("/api/load-review/brief/pdf", { method: "DELETE" });
    if (r.ok) {
      setPdfUrl(null);
      setPdfName(null);
      setPdfSize(null);
    }
  }

  function fmtSize(b: number | null): string {
    if (!b) return "";
    if (b < 1024) return `${b} B`;
    if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
    return `${(b / (1024 * 1024)).toFixed(1)} MB`;
  }

  return (
    <div className="space-y-3">
      <div className="flex justify-end items-center text-[11px] text-neutral-400 min-h-[16px]">
        {saving ? "Guardando…" : savedAt ? `Guardado · ${savedAt.toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" })}` : ""}
      </div>

      {/* PDF adjunto */}
      <section className="card space-y-2">
        <div className="flex justify-between items-start gap-3 flex-wrap">
          <div>
            <h3 className="text-sm font-medium">📄 PDF metodológico</h3>
            <p className="text-[11px] text-neutral-500 mt-0.5">
              Adjunta tu protocolo completo (≤ 25 MB). La IA lo lee en cada sugerencia.
              Se usa prompt caching de Anthropic, así que solo cuenta como input nuevo la primera vez por hora.
            </p>
          </div>
          <input
            ref={fileRef}
            type="file"
            accept="application/pdf,.pdf"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) uploadPdf(f);
            }}
          />
          <button
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
            className="btn btn-primary text-xs whitespace-nowrap"
          >
            {uploading ? "Subiendo…" : pdfUrl ? "Reemplazar PDF" : "📎 Adjuntar PDF"}
          </button>
        </div>

        {pdfUrl && (
          <div className="flex justify-between items-center gap-2 p-2 rounded bg-blue-50 border border-blue-200 text-xs">
            <a href={pdfUrl} target="_blank" rel="noopener noreferrer" className="text-blue-900 hover:underline truncate">
              📄 {pdfName ?? "brief.pdf"} {pdfSize ? <span className="text-blue-700">· {fmtSize(pdfSize)}</span> : null}
            </a>
            <button onClick={removePdf} className="text-red-700 hover:underline whitespace-nowrap">Quitar</button>
          </div>
        )}

        {uploadError && (
          <p className="text-xs text-red-700">⚠ {uploadError}</p>
        )}
      </section>

      <section className="card">
        <p className="text-[11px] text-neutral-500 mb-2">
          Notas/aclaraciones extra (opcional). Lo que escribas aquí se inyecta junto al PDF.
        </p>
        <textarea
          className="w-full min-h-[400px] font-mono text-xs leading-relaxed bg-transparent outline-none resize-y"
          value={content}
          onChange={(e) => { setContent(e.target.value); scheduleSave(e.target.value); }}
          placeholder="Si tienes notas que añadir al PDF, escríbelas aquí. Si vas a usar solo el PDF, puedes dejarlo vacío."
        />
      </section>
    </div>
  );
}
