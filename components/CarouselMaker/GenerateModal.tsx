"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CAROUSEL_CATEGORIES } from "@/lib/carousel-maker/types";

/**
 * Modal para generar un nuevo carrusel con IA. Toma un brief, categoría
 * opcional y número orientativo de slides. Envía a /api/carousel-maker/generate
 * y al obtener el draft, redirige a su página de edición.
 */
export function GenerateModal({
  libraryReady,
  onClose,
}: {
  libraryReady: boolean;
  onClose: () => void;
}) {
  const router = useRouter();
  const [brief, setBrief] = useState("");
  const [category, setCategory] = useState("");
  const [targetSlides, setTargetSlides] = useState<number | "">("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function submit() {
    setError("");
    if (brief.trim().length < 20) {
      setError("El brief es corto. Cuéntale el tema, ángulo y qué quieres que el atleta se lleve del carrusel.");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/carousel-maker/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          brief,
          category: category || null,
          targetSlides: typeof targetSlides === "number" ? targetSlides : null,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data?.error ?? "No se pudo generar.");
        setLoading(false);
        return;
      }
      router.push(`/fisio/contenido/carrusel-maker/${data.id}`);
    } catch (e: any) {
      setError(e?.message ?? "Error de red.");
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl max-w-lg w-full p-5 max-h-[92vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex justify-between items-center mb-4">
          <h3 className="font-semibold">✨ Generar carrusel con IA</h3>
          <button onClick={onClose} className="text-neutral-400 text-xl leading-none">✕</button>
        </div>

        {!libraryReady && (
          <div className="mb-3 p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-900">
            La biblioteca está vacía o casi vacía. La IA necesita al menos 1 carrusel tuyo como referencia. Añade uno antes en la biblioteca para que suene a ti.
          </div>
        )}

        <div className="space-y-3">
          <div>
            <label className="text-xs text-neutral-500 block mb-1">Brief *</label>
            <textarea
              className="input text-sm"
              rows={5}
              value={brief}
              onChange={(e) => setBrief(e.target.value)}
              placeholder='Ej: "quiero un carrusel sobre por qué el dolor de rodilla en el squat casi nunca es por ‘mala técnica’ y sí por control excéntrico débil. Tono directo. Terminar pidiendo que escriban RODILLA."'
            />
            <p className="text-[10px] text-neutral-500 mt-1">
              Cuanto más contexto le des (tema, ángulo, qué quieres que se lleve, tono si aplica), mejor sale.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs text-neutral-500 block mb-1">Estructura</label>
              <select className="input text-sm" value={category} onChange={(e) => setCategory(e.target.value)}>
                <option value="">— Que decida la IA —</option>
                {CAROUSEL_CATEGORIES.map((c) => (
                  <option key={c.value} value={c.value}>{c.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs text-neutral-500 block mb-1">Nº slides (orientativo)</label>
              <input
                type="number"
                min={3}
                max={15}
                className="input text-sm"
                value={targetSlides}
                onChange={(e) => setTargetSlides(e.target.value ? Number(e.target.value) : "")}
                placeholder="que decida IA"
              />
            </div>
          </div>

          {error && <p className="text-xs text-red-600">{error}</p>}

          <button
            onClick={submit}
            disabled={loading || !libraryReady}
            className="btn btn-primary w-full"
          >
            {loading ? "Generando… (puede tardar 30-60s)" : "✨ Generar"}
          </button>
          {loading && (
            <p className="text-[10px] text-neutral-500 text-center">
              Estoy pidiendo al modelo que sea directo y no suene a IA. Aguanta.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
