"use client";

import { useEffect, useRef, useState } from "react";
import type { AiAdsBriefData } from "@/lib/ai-ads-brief";

const FIELDS: { key: keyof AiAdsBriefData; label: string; placeholder: string; rows: number; desc?: string }[] = [
  {
    key: "brand",
    label: "👋 Marca",
    placeholder: "Quiénes sois, valores, posicionamiento. ¿Cómo os definís?",
    rows: 3,
  },
  {
    key: "voiceTone",
    label: "🎙️ Voz y tono",
    placeholder: "Cómo habláis: tuteo, registro, expresiones recurrentes, qué tipo de español.",
    rows: 3,
  },
  {
    key: "dos",
    label: "✅ Qué SÍ hacer",
    placeholder: "Hablar siempre desde el dolor, frases cortas, usar números, terminar con CTA suave...",
    rows: 4,
  },
  {
    key: "donts",
    label: "🚫 Qué NO hacer",
    placeholder: "No prometer curaciones, no usar 'simplemente', no hablar de descuentos agresivos...",
    rows: 4,
  },
  {
    key: "structureHints",
    label: "🧱 Estructura recomendada",
    placeholder: "Patrón típico: 3s hook → identificación dolor → solución sin promesa → CTA. Variantes...",
    rows: 4,
  },
  {
    key: "goodExamples",
    label: "⭐ Ejemplos buenos",
    placeholder: "Pega 2-3 guiones de anuncios tuyos que funcionaron, con una nota corta de POR QUÉ funcionaron.",
    rows: 6,
  },
  {
    key: "badExamples",
    label: "🗑️ Ejemplos malos / AI-slop",
    placeholder: "2-3 ejemplos genéricos / con olor a IA / que NO encajan con la marca.",
    rows: 4,
  },
];

export function AdsBriefEditor({ initial }: { initial: AiAdsBriefData }) {
  const [data, setData] = useState<AiAdsBriefData>(initial);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const debounceRef = useRef<NodeJS.Timeout | null>(null);

  function update<K extends keyof AiAdsBriefData>(key: K, value: AiAdsBriefData[K]) {
    setData((prev) => ({ ...prev, [key]: value }));
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => persist({ ...data, [key]: value }), 1200);
  }

  async function persist(state: AiAdsBriefData) {
    setSaving(true);
    await fetch("/api/ads/brief", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(state),
    });
    setSaving(false);
    setSavedAt(new Date());
  }

  useEffect(() => () => { if (debounceRef.current) clearTimeout(debounceRef.current); }, []);

  return (
    <div>
      <header className="mb-4">
        <h2 className="font-medium">🤖 Brief para la IA de anuncios</h2>
        <p className="text-xs text-neutral-500 mt-0.5">
          Lo que pongas aquí Claude lo usará como contexto al generar guiones desde el editor de anuncios.
          Autoguardado cada vez que dejas de escribir.
        </p>
        <p className="text-[10px] text-neutral-400 mt-1">
          {saving ? "Guardando…" : savedAt ? `Guardado · ${savedAt.toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" })}` : ""}
        </p>
      </header>

      {/* Skill / system prompt directo */}
      <section className="card mb-4 border-amber-200 bg-amber-50/30">
        <div className="mb-2">
          <h3 className="font-medium text-sm">🪄 System prompt completo (opcional)</h3>
          <p className="text-xs text-neutral-600 mt-0.5">
            Si tienes una <strong>Skill de Claude</strong> ya entrenada para anuncios, pega aquí su instrucción
            completa. Cuando este campo no está vacío, ignoramos los campos de abajo y usamos esto literal.
          </p>
        </div>
        <textarea
          className="input font-mono text-xs"
          rows={10}
          value={data.systemPrompt}
          onChange={(e) => update("systemPrompt", e.target.value)}
          placeholder="Pega aquí el system prompt completo de tu Skill (opcional). Si dejas vacío, se usan los campos estructurados de abajo."
        />
        {data.systemPrompt.trim() && (
          <p className="text-[11px] text-amber-800 mt-2">
            ⚠️ Estás usando el system prompt completo. Los campos de abajo quedan ignorados hasta que vacíes esto.
          </p>
        )}
      </section>

      {/* Campos estructurados (fallback) */}
      <section className="space-y-3">
        {FIELDS.map((f) => (
          <div key={f.key} className="card">
            <label className="font-medium text-sm block mb-1">{f.label}</label>
            <textarea
              className="input"
              rows={f.rows}
              placeholder={f.placeholder}
              value={data[f.key] as string}
              onChange={(e) => update(f.key, e.target.value)}
            />
          </div>
        ))}
      </section>
    </div>
  );
}
