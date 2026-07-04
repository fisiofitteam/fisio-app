"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AiSessionTester } from "@/components/AiSessionTester";

type Brief = {
  systemPrompt: string;
  philosophy: string;
  voiceTone: string;
  structureHints: string;
  formats: string;
  intensityRules: string;
  vocabulary: string;
  dos: string;
  donts: string;
  goodExamples: string;
  badExamples: string;
};

const FIELDS: {
  key: keyof Brief;
  label: string;
  help: string;
  minRows: number;
}[] = [
  { key: "systemPrompt", label: "🧠 System prompt base", help: "Instrucciones iniciales que verá el modelo antes de todo. Sitúa el rol.", minRows: 6 },
  { key: "philosophy", label: "🎯 Filosofía / enfoque", help: "Qué persigues con estas sesiones. Alto nivel.", minRows: 5 },
  { key: "voiceTone", label: "🗣️ Voz y tono", help: "Cómo suena una sesión bien escrita.", minRows: 5 },
  { key: "structureHints", label: "🧱 Estructura típica", help: "Bloques, orden esperado, títulos habituales.", minRows: 6 },
  { key: "formats", label: "⏱️ Formatos y notación", help: "EMOM/TABATA/AMRAP, cargas duales, pausas, ON/OFF.", minRows: 5 },
  { key: "intensityRules", label: "🔥 Intensidad e intención", help: "Duración, RPE, %, límites por bloque.", minRows: 5 },
  { key: "vocabulary", label: "📚 Vocabulario y ejercicios", help: "Nombres preferidos, abreviaturas, palabras clave.", minRows: 5 },
  { key: "dos", label: "✅ Do's", help: "Lo que SIEMPRE debe hacer.", minRows: 5 },
  { key: "donts", label: "🚫 Don'ts", help: "Lo que NUNCA debe hacer.", minRows: 5 },
  { key: "goodExamples", label: "🌟 Ejemplos buenos", help: "Sesiones que representan tu estilo. Se pasarán como few-shot.", minRows: 8 },
  { key: "badExamples", label: "🗑️ Ejemplos malos", help: "Qué evitar (opcional).", minRows: 5 },
];

export function AiTrainingBriefEditor({
  kind,
  kindLabel,
  allKinds,
  brief,
  totalExamples,
  exampleSummary,
}: {
  kind: string;
  kindLabel: string;
  allKinds: { kind: string; label: string; count: number }[];
  brief: Brief;
  totalExamples: number;
  exampleSummary: { summary: string; count: number }[];
}) {
  const router = useRouter();
  const [values, setValues] = useState<Brief>(brief);
  const [savingKey, setSavingKey] = useState<keyof Brief | null>(null);
  const [savedAt, setSavedAt] = useState<Record<string, number>>({});
  const [seeding, setSeeding] = useState(false);
  const [seedMsg, setSeedMsg] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadMsg, setUploadMsg] = useState<string | null>(null);
  const [clearing, setClearing] = useState(false);

  const qs = `?kind=${encodeURIComponent(kind)}`;

  async function save(key: keyof Brief) {
    setSavingKey(key);
    try {
      const res = await fetch(`/api/ai/training-brief${qs}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [key]: values[key] }),
      });
      if (res.ok) {
        setSavedAt((s) => ({ ...s, [key]: Date.now() }));
      }
    } finally {
      setSavingKey(null);
    }
  }

  async function uploadHtml(file: File) {
    setUploading(true);
    setUploadMsg(null);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch(`/api/ai/training-brief/import-html${qs}`, {
        method: "POST",
        body: form,
      });
      const d = await res.json();
      if (res.ok) {
        setUploadMsg(
          `✓ ${d.total} sesiones detectadas · ${d.inserted} nuevas · ${d.updated} actualizadas${d.skipped ? ` · ${d.skipped} saltadas` : ""}`
        );
        router.refresh();
      } else {
        setUploadMsg(`⚠ ${d?.error ?? "Error"}`);
      }
    } catch (e: any) {
      setUploadMsg(`⚠ ${e?.message ?? "Error de red"}`);
    } finally {
      setUploading(false);
    }
  }

  async function clearAll() {
    if (!confirm(`¿Vaciar todos los campos del brief "${kindLabel}"? Podrás volver a sembrar después. No afecta al banco de ejemplos.`)) return;
    setClearing(true);
    try {
      const res = await fetch(`/api/ai/training-brief${qs}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "clear-all-fields" }),
      });
      if (res.ok) {
        const d = await res.json();
        setValues({
          systemPrompt: d.systemPrompt,
          philosophy: d.philosophy,
          voiceTone: d.voiceTone,
          structureHints: d.structureHints,
          formats: d.formats,
          intensityRules: d.intensityRules,
          vocabulary: d.vocabulary,
          dos: d.dos,
          donts: d.donts,
          goodExamples: d.goodExamples,
          badExamples: d.badExamples,
        });
        setSeedMsg("✓ Brief vaciado. Pulsa 🌱 Sembrar para volver a rellenar.");
        router.refresh();
      }
    } finally {
      setClearing(false);
    }
  }

  async function seedEmpty() {
    setSeeding(true);
    setSeedMsg(null);
    try {
      const res = await fetch(`/api/ai/training-brief${qs}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "seed-empty-fields" }),
      });
      const d = await res.json();
      if (res.ok) {
        setValues({
          systemPrompt: d.systemPrompt,
          philosophy: d.philosophy,
          voiceTone: d.voiceTone,
          structureHints: d.structureHints,
          formats: d.formats,
          intensityRules: d.intensityRules,
          vocabulary: d.vocabulary,
          dos: d.dos,
          donts: d.donts,
          goodExamples: d.goodExamples,
          badExamples: d.badExamples,
        });
        if (d._seedResult?.noSeed) {
          setSeedMsg("Aún no hay seed pre-cargada para este brief. Redáctalo tú o sube el HTML correspondiente.");
        } else {
          const filled: string[] = d._seedResult?.filledFields ?? [];
          setSeedMsg(
            filled.length > 0
              ? `✓ Se rellenaron ${filled.length} campo${filled.length === 1 ? "" : "s"}: ${filled.join(", ")}`
              : "Ningún campo estaba vacío. No se sobreescribe."
          );
        }
        router.refresh();
      } else {
        setSeedMsg(`⚠ Error: ${d?.error ?? "desconocido"}`);
      }
    } finally {
      setSeeding(false);
    }
  }

  function switchKind(nextKind: string) {
    const url = new URL(window.location.href);
    url.searchParams.set("kind", nextKind);
    router.push(url.pathname + url.search);
    router.refresh();
  }

  return (
    <section className="space-y-4">
      <header>
        <h2 className="text-base font-semibold">✨ Brief IA · Generador de sesiones ADVANCE</h2>
        <p className="text-xs text-neutral-500 mt-0.5">
          Cada tipo de sesión tiene su propio brief y su propio banco de ejemplos.
          El generador combinará el brief activo con las sesiones del banco como few-shot.
        </p>
      </header>

      {/* Tabs por kind */}
      <div className="flex gap-1 border-b border-neutral-200">
        {allKinds.map((k) => {
          const active = k.kind === kind;
          return (
            <button
              key={k.kind}
              onClick={() => switchKind(k.kind)}
              className={`px-4 py-2 text-sm font-medium border-b-2 whitespace-nowrap transition-colors ${
                active ? "border-neutral-900 text-neutral-900" : "border-transparent text-neutral-500 hover:text-neutral-900"
              }`}
            >
              {k.label}
              <span className={`ml-1.5 text-[10px] px-1.5 py-0.5 rounded-full ${active ? "bg-neutral-100" : "bg-neutral-50"}`}>
                {k.count}
              </span>
            </button>
          );
        })}
      </div>

      {/* Panel resumen del banco */}
      <div className="card">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <div className="text-xs uppercase tracking-wider text-neutral-500">Banco · {kindLabel}</div>
            <div className="text-xl font-semibold">{totalExamples.toLocaleString("es-ES")} sesiones</div>
            {exampleSummary.length > 0 && (
              <div className="text-[11px] text-neutral-500 mt-1 flex flex-wrap gap-2">
                {exampleSummary.map((s) => (
                  <span key={s.summary} className="bg-neutral-100 px-2 py-0.5 rounded">
                    {s.summary} · {s.count}
                  </span>
                ))}
              </div>
            )}
          </div>
          <div className="flex flex-col items-end gap-2">
            <div className="flex items-center gap-2">
              <label
                className={`text-xs font-medium px-3 py-1.5 rounded-lg border border-neutral-300 bg-white cursor-pointer ${uploading ? "opacity-50" : "hover:bg-neutral-50"}`}
                title="Sube tu HTML con el histórico de sesiones de este tipo. Idempotente: subir dos veces no duplica."
              >
                {uploading ? "Cargando…" : `📥 Cargar HTML de ${kind}`}
                <input
                  type="file"
                  accept=".html,text/html"
                  disabled={uploading}
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) uploadHtml(f);
                    e.target.value = "";
                  }}
                />
              </label>
              <button
                onClick={seedEmpty}
                disabled={seeding}
                className="text-xs font-medium px-3 py-1.5 rounded-lg disabled:opacity-50"
                style={{ background: "#0A0A0A", color: "#FAFAFA" }}
                title="Rellena los campos vacíos con la destilación de tu histórico (si la hay para este kind). No sobreescribe lo tuyo."
              >
                {seeding ? "Sembrando…" : "🌱 Sembrar campos vacíos"}
              </button>
              <button
                onClick={clearAll}
                disabled={clearing}
                className="text-xs text-neutral-500 hover:text-red-700 hover:underline disabled:opacity-50"
                title="Vacía TODOS los campos de este brief. Útil si por error se rellenaron con el brief del otro tipo."
              >
                {clearing ? "Vaciando…" : "🗑 Vaciar este brief"}
              </button>
            </div>
            {uploadMsg && <span className="text-[11px] text-neutral-600 text-right">{uploadMsg}</span>}
            {seedMsg && <span className="text-[11px] text-neutral-600 text-right">{seedMsg}</span>}
          </div>
        </div>
      </div>

      {/* Panel de prueba del generador */}
      <AiSessionTester kind={kind} />

      {/* Campos */}
      <div className="space-y-4">
        {FIELDS.map((f) => (
          <FieldCard
            key={f.key}
            field={f}
            value={values[f.key]}
            onChange={(v) => setValues((s) => ({ ...s, [f.key]: v }))}
            onBlur={() => save(f.key)}
            saving={savingKey === f.key}
            savedAt={savedAt[f.key] ?? 0}
          />
        ))}
      </div>

      <p className="text-[11px] text-neutral-400 italic mt-4">
        💡 Los cambios se autoguardan cuando sales del campo. El generador (próximo hito) usará el brief del kind activo cuando pulses "✨ Generar con IA" desde el editor de sesiones.
      </p>
    </section>
  );
}

function FieldCard({
  field,
  value,
  onChange,
  onBlur,
  saving,
  savedAt,
}: {
  field: { key: string; label: string; help: string; minRows: number };
  value: string;
  onChange: (v: string) => void;
  onBlur: () => void;
  saving: boolean;
  savedAt: number;
}) {
  const showSaved = savedAt > 0 && Date.now() - savedAt < 3000;
  return (
    <div className="card">
      <div className="flex items-center justify-between mb-1">
        <label className="text-sm font-medium">{field.label}</label>
        <div className="text-[11px] text-neutral-400">
          {saving ? "Guardando…" : showSaved ? <span className="text-emerald-600">✓ guardado</span> : null}
        </div>
      </div>
      <p className="text-[11px] text-neutral-500 mb-2 italic">{field.help}</p>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onBlur={onBlur}
        rows={field.minRows}
        className="w-full text-sm bg-white border border-neutral-200 focus:border-neutral-400 rounded-md px-2 py-1.5 font-mono outline-none"
        style={{ fontSize: 12, lineHeight: 1.5 }}
      />
      <div className="text-[10px] text-neutral-400 mt-1 text-right">
        {value.length.toLocaleString("es-ES")} caracteres
      </div>
    </div>
  );
}
