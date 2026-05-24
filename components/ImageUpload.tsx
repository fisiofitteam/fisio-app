"use client";

import { useRef, useState } from "react";

// Subida de imagen a Vercel Blob. value = URL actual (o ""), onChange recibe la URL.
export function ImageUpload({
  value,
  onChange,
  hint,
}: {
  value: string;
  onChange: (url: string) => void;
  hint?: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");

  async function handle(file: File) {
    setUploading(true);
    setError("");
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/upload", { method: "POST", body: fd });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.url) onChange(data.url);
      else setError(data.error || "No se pudo subir.");
    } catch {
      setError("Error de red al subir.");
    }
    setUploading(false);
  }

  return (
    <div>
      {value ? (
        <div className="flex items-center gap-3">
          <img src={value} alt="" className="w-16 h-16 rounded-lg object-cover border border-neutral-200" />
          <div className="flex gap-3">
            <button type="button" onClick={() => inputRef.current?.click()} disabled={uploading} className="text-sm text-blue-600 hover:underline">
              {uploading ? "Subiendo..." : "Cambiar"}
            </button>
            <button type="button" onClick={() => onChange("")} className="text-sm text-red-600 hover:underline">Quitar</button>
          </div>
        </div>
      ) : (
        <button type="button" onClick={() => inputRef.current?.click()} disabled={uploading} className="btn text-sm">
          {uploading ? "Subiendo..." : "📷 Subir imagen"}
        </button>
      )}
      {hint && <p className="text-[11px] text-neutral-400 mt-1">{hint}</p>}
      {error && <p className="text-sm text-red-600 mt-1">{error}</p>}
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) handle(f);
          e.target.value = "";
        }}
      />
    </div>
  );
}
