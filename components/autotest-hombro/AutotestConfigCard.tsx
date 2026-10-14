"use client";
/**
 * Card de configuración del Autotest Funcional del Hombro: 3 URLs de vídeo
 * (una por test) + plantilla de mensaje WhatsApp. Autosave con debounce
 * 800 ms + flush al blur. Mismo patrón que SemaforoConfigCard.
 */
import { useEffect, useRef, useState } from "react";
import { DEFAULT_WHATSAPP_TEMPLATE } from "@/lib/autotest-hombro/get-config";

type Config = {
  videoUrls: { test1: string; test2: string; test3: string; test4: string };
  whatsappTemplate: string;
  quizFunnelEnabled: boolean;
};

const TEST_LABELS = {
  test1: { label: "🧱 Test 1 · Wall slide", help: "Movilidad overhead + estabilidad escapular" },
  test2: { label: "🔄 Test 2 · Rotación torácica", help: "Rotación externa / recepción snatch" },
  test3: { label: "🏋 Test 3 · Overhead squat", help: "Movilidad overhead + rotación externa" },
  test4: { label: "💪 Test 4 · Flexión isométrica", help: "Fuerza de empuje + estabilidad" },
} as const;

export function AutotestConfigCard() {
  const [config, setConfig] = useState<Config | null>(null);
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const videoDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const templateDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    fetch("/api/autotest-hombro/admin/config")
      .then((r) => r.json())
      .then((d) => { if (d?.ok) setConfig(d.config); })
      .catch(() => {});
  }, []);

  async function persist(next: Partial<{
    videoUrlTest1: string | null;
    videoUrlTest2: string | null;
    videoUrlTest3: string | null;
    videoUrlTest4: string | null;
    whatsappTemplate: string | null;
  }>) {
    setStatus("saving");
    setErrorMsg(null);
    try {
      const r = await fetch("/api/autotest-hombro/admin/config", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(next),
      });
      const d = await r.json();
      if (!r.ok || !d?.ok) {
        setStatus("error");
        setErrorMsg(d?.hint || d?.error || "Error al guardar");
        return;
      }
      setStatus("saved");
      setTimeout(() => setStatus((s) => (s === "saved" ? "idle" : s)), 1200);
    } catch (e: any) {
      setStatus("error");
      setErrorMsg(e?.message || "Error de red");
    }
  }

  type TestKey = "test1" | "test2" | "test3" | "test4";
  function patchKeyFor(k: TestKey) {
    return k === "test1"
      ? "videoUrlTest1"
      : k === "test2"
        ? "videoUrlTest2"
        : k === "test3"
          ? "videoUrlTest3"
          : "videoUrlTest4";
  }
  function scheduleVideo(testKey: TestKey, next: string) {
    if (!config) return;
    const nextVideos = { ...config.videoUrls, [testKey]: next };
    setConfig({ ...config, videoUrls: nextVideos });
    if (videoDebounceRef.current) clearTimeout(videoDebounceRef.current);
    videoDebounceRef.current = setTimeout(() => persist({ [patchKeyFor(testKey)]: next } as any), 800);
  }
  function flushVideo(testKey: TestKey) {
    if (!config) return;
    if (videoDebounceRef.current) {
      clearTimeout(videoDebounceRef.current);
      videoDebounceRef.current = null;
    }
    persist({ [patchKeyFor(testKey)]: config.videoUrls[testKey] } as any);
  }

  function scheduleTemplate(next: string) {
    if (!config) return;
    setConfig({ ...config, whatsappTemplate: next });
    if (templateDebounceRef.current) clearTimeout(templateDebounceRef.current);
    templateDebounceRef.current = setTimeout(() => persist({ whatsappTemplate: next }), 800);
  }
  function flushTemplate() {
    if (!config) return;
    if (templateDebounceRef.current) {
      clearTimeout(templateDebounceRef.current);
      templateDebounceRef.current = null;
    }
    persist({ whatsappTemplate: config.whatsappTemplate });
  }

  useEffect(() => () => {
    if (videoDebounceRef.current) clearTimeout(videoDebounceRef.current);
    if (templateDebounceRef.current) clearTimeout(templateDebounceRef.current);
  }, []);

  if (!config) {
    return <div className="text-xs text-neutral-400 italic">Cargando configuración…</div>;
  }

  return (
    <section className="rounded-xl p-4 mb-4" style={{ background: "#FFFFFF", border: "1px solid #E5E5E5" }}>
      <div className="flex items-start justify-between gap-3 mb-3">
        <div>
          <h2 className="text-sm font-semibold">⚙️ Configuración del autotest</h2>
          <p className="text-[11px] text-neutral-500 mt-0.5">Vídeos de YouTube para los 3 tests y plantilla del mensaje de WhatsApp del embudo.</p>
        </div>
        <span className="text-[10px] text-neutral-400 select-none">
          {status === "saving" && "guardando…"}
          {status === "saved" && <span className="text-emerald-600">✓ guardado</span>}
          {status === "error" && <span className="text-red-600">✕ error</span>}
        </span>
      </div>

      <div className="rounded-lg p-3 mb-3" style={{ background: "#FAFAFA", border: "1px solid #E5E5E5" }}>
        <div className="mb-2">
          <span className="text-xs font-semibold text-neutral-700">🎥 Vídeos de los tests</span>
          <p className="text-[11px] text-neutral-500 leading-snug mt-0.5">
            Pega la URL de YouTube para cada test (watch, youtu.be o embed, todas valen). Vacío = la landing pintará un placeholder "vídeo pendiente".
          </p>
        </div>
        <div className="grid gap-2">
          {(["test1", "test2", "test3", "test4"] as const).map((k) => {
            const meta = TEST_LABELS[k];
            return (
              <div key={k} className="flex flex-col gap-1">
                <div className="flex items-center gap-2">
                  <span className="text-[11px] font-semibold w-36 shrink-0 flex items-center gap-1.5">{meta.label}</span>
                  <input
                    type="url"
                    value={config.videoUrls[k]}
                    onChange={(e) => scheduleVideo(k, e.target.value)}
                    onBlur={() => flushVideo(k)}
                    placeholder="https://youtu.be/… o https://www.youtube.com/watch?v=…"
                    className="flex-1 text-xs px-2 py-1.5 rounded border"
                    style={{ borderColor: "#E5E5E5", background: "#FFFFFF" }}
                  />
                </div>
                <span className="text-[10px] text-neutral-400 ml-[9.5rem]">{meta.help}</span>
              </div>
            );
          })}
        </div>
      </div>

      <details className="group rounded-lg border" style={{ borderColor: "#E5E5E5", background: "#FAFAFA" }}>
        <summary className="cursor-pointer select-none list-none px-3 py-2 flex items-center justify-between gap-2">
          <span className="text-xs font-medium text-neutral-700">
            💬 Mensaje predefinido de WhatsApp (CRM — botón "Contactar")
          </span>
          <span className="text-[11px] text-neutral-400 group-open:hidden">▸ mostrar</span>
          <span className="text-[11px] text-neutral-400 hidden group-open:inline">▾ ocultar</span>
        </summary>
        <div className="px-3 pb-3 pt-1">
          <div className="flex items-center justify-end mb-1.5">
            <button
              type="button"
              onClick={() => {
                if (!confirm("Reemplazar el mensaje actual con la plantilla por defecto?")) return;
                setConfig({ ...config, whatsappTemplate: DEFAULT_WHATSAPP_TEMPLATE });
                persist({ whatsappTemplate: DEFAULT_WHATSAPP_TEMPLATE });
              }}
              className="text-[10px] font-medium px-2 py-1 rounded border border-neutral-200 hover:bg-neutral-50 bg-white"
            >
              🔄 Cargar plantilla por defecto
            </button>
          </div>
          <textarea
            value={config.whatsappTemplate}
            onChange={(e) => scheduleTemplate(e.target.value)}
            onBlur={flushTemplate}
            rows={10}
            className="w-full text-sm p-2.5 rounded-lg border font-mono"
            style={{ borderColor: "#E5E5E5", background: "#FFFFFF", lineHeight: 1.5 }}
          />
          <div className="text-[10px] text-neutral-500 mt-1.5 leading-relaxed">
            <span className="font-medium text-neutral-700">Placeholders disponibles:</span>{" "}
            <code className="bg-neutral-100 px-1 rounded">{`{{nombre}}`}</code>{" "}
            <code className="bg-neutral-100 px-1 rounded">{`{{arquetipo}}`}</code>{" "}
            <code className="bg-neutral-100 px-1 rounded">{`{{resumen}}`}</code>{" "}
            <code className="bg-neutral-100 px-1 rounded">{`{{debiles}}`}</code>
          </div>
        </div>
      </details>

      {errorMsg && (
        <div className="mt-3 rounded-lg p-2 text-[11px]" style={{ background: "#FEE2E2", color: "#7F1D1D", border: "1px solid #FCA5A5" }}>
          {errorMsg}
        </div>
      )}
    </section>
  );
}
