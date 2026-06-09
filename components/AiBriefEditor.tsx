"use client";

import { useEffect, useRef, useState } from "react";

type Brief = {
  brand: string;
  voiceTone: string;
  dos: string;
  donts: string;
  structureHints: string;
  goodExamples: string;
  badExamples: string;
};

const SECTIONS: Array<{
  key: keyof Brief;
  emoji: string;
  title: string;
  hint: string;
  placeholder: string;
  minRows: number;
}> = [
  {
    key: "brand",
    emoji: "🏷️",
    title: "Marca",
    hint: "Quiénes sois, para quién, qué prometéis. Lo que define a FisioFit Team.",
    placeholder:
      "FisioFit Team es el servicio de fisioterapia online especializado en atletas CrossFit. Nuestro promesa es...",
    minRows: 4,
  },
  {
    key: "voiceTone",
    emoji: "🎙️",
    title: "Voz y tono",
    hint: "Cómo habláis: tuteo, registro, expresiones que usas, ritmo. Para que la IA suene a TI.",
    placeholder:
      "Tuteo siempre. Frases cortas. Directo, sin paja. Uso analogías deportivas. Nunca tecnicismos sin explicar...",
    minRows: 4,
  },
  {
    key: "dos",
    emoji: "✅",
    title: "Qué SÍ hago siempre",
    hint: "Reglas firmes que tienen que aparecer en cada guion.",
    placeholder:
      "- Hook en los 3 primeros segundos\n- Dato concreto, no genérico\n- CTA claro a DM con palabra clave\n- Cerrar con una pregunta...",
    minRows: 4,
  },
  {
    key: "donts",
    emoji: "🚫",
    title: "Qué NO hago JAMÁS",
    hint: "Líneas rojas. Si la IA las cruza, has fallado.",
    placeholder:
      "- No empezar con 'Hola CrossFiters'\n- No usar emojis decorativos sin sentido\n- No prometer 'cura' ni diagnosticar\n- No sonar a AI-slop genérico...",
    minRows: 4,
  },
  {
    key: "structureHints",
    emoji: "🧱",
    title: "Estructuras y patrones",
    hint: "Patrones de ritmo que sueles usar fuera de las plantillas oficiales. Opcional.",
    placeholder:
      "Patrón A: situación dolorosa → mito → contraste real → cómo lo hago yo → CTA\nPatrón B: ...",
    minRows: 3,
  },
  {
    key: "goodExamples",
    emoji: "⭐",
    title: "Ejemplos de guiones que clavé",
    hint: "Pega 2-3 guiones tuyos que funcionaron muy bien. Anota debajo por qué.",
    placeholder:
      "GUION 1 (Reel, 18-mar-2026, 24k views, 800 saves):\n[Hook] Si te truena el hombro al hacer snatch...\n[Desarrollo] ...\n\n→ Funcionó porque empieza con dolor concreto, da una solución no obvia, y cierra con DM...",
    minRows: 6,
  },
  {
    key: "badExamples",
    emoji: "❌",
    title: "Ejemplos de lo que NO quiero",
    hint: "Pega 2-3 trozos típicos de salida AI o de copy genérico que detestes.",
    placeholder:
      "❌ 'Hola CrossFiters! ¿Sabías que tu hombro es la articulación más compleja?'\n→ Suena a AI plana, sin alma, sin angle.\n\n❌ 'En FisioFit Team somos un equipo de profesionales apasionados...'\n→ Bla bla autoreferencial.",
    minRows: 5,
  },
];

const SAVE_DEBOUNCE_MS = 800;

export function AiBriefEditor({ initial }: { initial: Brief }) {
  const [brief, setBrief] = useState<Brief>(initial);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const [error, setError] = useState<string | null>(null);
  const dirty = useRef<Partial<Brief>>({});
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inFlight = useRef(false);

  function set<K extends keyof Brief>(key: K, value: string) {
    setBrief((prev) => ({ ...prev, [key]: value }));
    dirty.current = { ...dirty.current, [key]: value };
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(flush, SAVE_DEBOUNCE_MS);
  }

  async function flush() {
    if (inFlight.current) return;
    if (Object.keys(dirty.current).length === 0) return;
    const patch = dirty.current;
    dirty.current = {};
    inFlight.current = true;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/contenido/brief-ia", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data?.error || `HTTP ${res.status}`);
      }
      setSavedAt(new Date());
    } catch (e: any) {
      setError(e?.message || "Error guardando");
      // Reponer dirty para reintentar
      dirty.current = { ...patch, ...dirty.current };
    } finally {
      setSaving(false);
      inFlight.current = false;
    }
  }

  // Flush pendiente al salir
  useEffect(() => {
    return () => {
      if (timer.current) clearTimeout(timer.current);
      // No await porque es cleanup; el server lo recibirá en background
      if (Object.keys(dirty.current).length > 0) flush();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="space-y-4">
      {/* Indicador de guardado */}
      <div className="flex items-center justify-end text-xs text-neutral-500 min-h-[20px]">
        {saving && <span>Guardando…</span>}
        {!saving && savedAt && <span>✓ Guardado {timeAgo(savedAt)}</span>}
        {error && <span className="text-red-600 ml-3">⚠ {error}</span>}
      </div>

      {SECTIONS.map((s) => (
        <section
          key={s.key}
          className="rounded-xl p-4"
          style={{ background: "#FAFAFA", border: "1px solid #E5E5E5" }}
        >
          <div className="flex items-baseline justify-between gap-3 mb-1">
            <h2 className="text-sm font-semibold flex items-center gap-2">
              <span>{s.emoji}</span> {s.title}
            </h2>
            <span className="text-[11px] text-neutral-500">{brief[s.key].length} chars</span>
          </div>
          <p className="text-xs text-neutral-500 mb-2">{s.hint}</p>
          <textarea
            value={brief[s.key]}
            onChange={(e) => set(s.key, e.target.value)}
            rows={s.minRows}
            placeholder={s.placeholder}
            className="w-full text-sm p-3 rounded-lg outline-none resize-y font-mono"
            style={{
              background: "#FFFFFF",
              border: "1px solid #D4D4D4",
              minHeight: s.minRows * 24,
              lineHeight: 1.55,
            }}
          />
        </section>
      ))}

      <p className="text-[11px] text-neutral-400 italic">
        Modelo usado: Claude Opus 4.7. Coste estimado por generación: ~$0.20.
        Este brief se inyecta en CADA llamada — afínalo bien y notarás la diferencia.
      </p>
    </div>
  );
}

function timeAgo(d: Date): string {
  const sec = Math.floor((Date.now() - d.getTime()) / 1000);
  if (sec < 5) return "ahora";
  if (sec < 60) return `hace ${sec}s`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `hace ${min} min`;
  return d.toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" });
}
