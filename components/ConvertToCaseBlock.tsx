"use client";
import { useState, useEffect } from "react";
import { CaseWhatsAppImport } from "@/components/CaseWhatsAppImport";
import { CaseMaterialPicker } from "@/components/CaseMaterialPicker";
import { mergeCaseAttachments, type CaseAttachment } from "@/lib/case-attachments";
type CasePatient = { id: string; fullName: string; diagnosis: string };

export function ConvertToCaseBlock({ patient }: { patient: CasePatient }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <section className="card">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="flex-1">
            <h2 className="font-medium mb-1">🩺 Convertir en caso de éxito</h2>
            <p className="text-xs text-neutral-500">
              Crea un caso clínico publicable a partir de este paciente. Se guarda en el banco de recursos para usarlo en contenido (reels caso éxito, carruseles, etc).
            </p>
          </div>
          <button onClick={() => setOpen(true)} className="btn btn-primary text-xs whitespace-nowrap">
            Generar caso de éxito
          </button>
        </div>
      </section>
      {open && (
        <ConvertToCaseModal patient={patient} onClose={() => setOpen(false)} onCreated={() => setOpen(false)} />
      )}
    </>
  );
}

type VideoRef = CaseAttachment;

const APARTADOS = [
  {
    key: "initialSituation" as const,
    videosKey: "initialSituationVideos" as const,
    label: "Cómo estaba / dolor principal",
    placeholder: "Punto de partida: qué le pasaba, desde cuándo, tratamientos previos, hallazgos objetivos, estado emocional…",
  },
  {
    key: "process" as const,
    videosKey: "processVideos" as const,
    label: "Cómo ha sido su proceso",
    placeholder: "Arco del tratamiento: fases, hitos, adaptaciones, cómo respondió, adherencia…",
  },
  {
    key: "obstacles" as const,
    videosKey: "obstaclesVideos" as const,
    label: "Obstáculos que ha superado",
    placeholder: "Frustración, miedo al movimiento, hipervigilancia, impulsividad competitiva, creencias limitantes…",
  },
  {
    key: "achievements" as const,
    videosKey: "achievementsVideos" as const,
    label: "Qué ha conseguido",
    placeholder: "Recuperación objetiva (funcionalidad, cargas, competiciones) + subjetiva (cómo se siente, aprendizajes)…",
  },
];

type CaseState = {
  initialSituation: string;
  process: string;
  obstacles: string;
  achievements: string;
  initialSituationVideos: VideoRef[];
  processVideos: VideoRef[];
  obstaclesVideos: VideoRef[];
  achievementsVideos: VideoRef[];
  consentSigned: boolean;
  notes: string;
};

function ConvertToCaseModal({ patient, onClose, onCreated }: { patient: CasePatient; onClose: () => void; onCreated: () => void }) {
  const [pickerFor, setPickerFor] = useState<typeof APARTADOS[number] | null>(null);
  const [importingWhatsApp, setImportingWhatsApp] = useState(false);
  const [caseId, setCaseId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savedFeedback, setSavedFeedback] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [state, setState] = useState<CaseState>({
    initialSituation: "",
    process: "",
    obstacles: "",
    achievements: "",
    initialSituationVideos: [],
    processVideos: [],
    obstaclesVideos: [],
    achievementsVideos: [],
    consentSigned: false,
    notes: "",
  });

  // Crea (o recupera) el caso ligado a este paciente al abrir el modal.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/content/cases/from-patient", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ patientId: patient.id }),
        });
        if (!res.ok) { setError("No se pudo crear el caso"); return; }
        const data = await res.json();
        if (cancelled) return;
        setCaseId(data.caseId);

        // Carga el estado actual del caso (por si ya existía).
        const detail = await fetch(`/api/content/cases/${data.caseId}`).then((r) => r.ok ? r.json() : null);
        if (cancelled || !detail) return;
        setState({
          initialSituation: detail.initialSituation ?? "",
          process: detail.process ?? "",
          obstacles: detail.obstacles ?? "",
          achievements: detail.achievements ?? "",
          initialSituationVideos: (detail.initialSituationVideos ?? []).map((v: any) => ({ url: v.url, caption: v.caption ?? "", kind: v.kind })),
          processVideos: (detail.processVideos ?? []).map((v: any) => ({ url: v.url, caption: v.caption ?? "", kind: v.kind })),
          obstaclesVideos: (detail.obstaclesVideos ?? []).map((v: any) => ({ url: v.url, caption: v.caption ?? "", kind: v.kind })),
          achievementsVideos: (detail.achievementsVideos ?? []).map((v: any) => ({ url: v.url, caption: v.caption ?? "", kind: v.kind })),
          consentSigned: !!detail.consentSigned,
          notes: detail.notes ?? "",
        });
      } catch {
        if (!cancelled) setError("No se pudo cargar el caso. Cierra y vuelve a intentarlo.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [patient.id]);

  async function generateWithAi() {
    if (!caseId) return;
    setGenerating(true);
    setError(null);
    try {
      const res = await fetch(`/api/content/cases/${caseId}/ai-draft`, { method: "POST" });
      const text = await res.text();
      let d: any = {};
      try { d = JSON.parse(text); } catch { /* ignore */ }
      if (!res.ok || !d?.ok) {
        setError(d?.error || `Error ${res.status} generando con IA`);
        return;
      }
      setState((prev) => ({
        ...prev,
        initialSituation: d.initialSituation ?? prev.initialSituation,
        process: d.process ?? prev.process,
        obstacles: d.obstacles ?? prev.obstacles,
        achievements: d.achievements ?? prev.achievements,
      }));
      setSavedFeedback("Borrador generado ✅ — revisa y edita antes de guardar.");
    } catch (e: any) {
      setError(e?.message || "Error de red");
    } finally {
      setGenerating(false);
    }
  }

  async function save() {
    if (!caseId) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/content/cases/${caseId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          initialSituation: state.initialSituation,
          process: state.process,
          obstacles: state.obstacles,
          achievements: state.achievements,
          initialSituationVideos: state.initialSituationVideos,
          processVideos: state.processVideos,
          obstaclesVideos: state.obstaclesVideos,
          achievementsVideos: state.achievementsVideos,
          consentSigned: state.consentSigned,
          notes: state.notes,
        }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setError(d?.error || `Error ${res.status} guardando`);
        return;
      }
      setSavedFeedback("Caso guardado ✅");
      onCreated();
    } catch (e: any) {
      setError(e?.message || "Error de red");
    } finally {
      setSaving(false);
    }
  }

  function updateVideos(videosKey: keyof CaseState, next: VideoRef[]) {
    setState((prev) => ({ ...prev, [videosKey]: next } as CaseState));
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl w-full max-w-3xl max-h-[92vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="p-4 border-b sticky top-0 bg-white flex items-center justify-between z-10">
          <div>
            <h3 className="font-medium">🩺 Caso de éxito · {patient.fullName}</h3>
            <p className="text-[11px] text-neutral-500 mt-0.5">
              {patient.diagnosis || "Sin diagnóstico registrado"}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={generateWithAi}
              disabled={loading || generating || importingWhatsApp || !caseId}
              className="text-xs font-medium px-3 py-1.5 rounded-lg bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white disabled:opacity-40"
              title="La IA lee toda la info del paciente y rellena los 4 apartados"
            >
              {generating ? "Generando…" : "🧠 Generar con IA"}
            </button>
            <button onClick={onClose} className="text-neutral-400 text-xl px-2">✕</button>
          </div>
        </div>

        {pickerFor && <CaseMaterialPicker patientId={patient.id} sectionLabel={pickerFor.label}
          existing={state[pickerFor.videosKey]} onClose={() => setPickerFor(null)}
          onConfirm={chosen => {
            const key = pickerFor.videosKey;
            setState(prev => ({ ...prev, [key]: mergeCaseAttachments(prev[key], chosen) }));
            setPickerFor(null); setSavedFeedback("Material añadido al apartado. Guarda el caso para conservarlo.");
          }} />}
        <div className="p-4 space-y-5">
          {loading ? (
            <p className="text-sm text-neutral-400 italic text-center py-8">Cargando caso…</p>
          ) : (
            <>
              {savedFeedback && (
                <div className="bg-emerald-50 border border-emerald-200 rounded p-2 text-xs text-emerald-800">
                  {savedFeedback}
                </div>
              )}
              {error && (
                <div className="bg-red-50 border border-red-200 rounded p-2 text-xs text-red-700 whitespace-pre-wrap">
                  {error}
                </div>
              )}
              {generating && (
                <p className="text-[11px] text-neutral-500 italic">
                  Leyendo anamnesis, sesiones, sensaciones, resúmenes semanales… tarda 20-60s.
                </p>
              )}

              <CaseWhatsAppImport patientId={patient.id} disabled={generating} onBusyChange={setImportingWhatsApp} />
              {APARTADOS.map((ap) => (
                <ApartadoBlock
                  key={ap.key}
                  label={ap.label}
                  placeholder={ap.placeholder}
                  text={state[ap.key]}
                  onTextChange={(v) => setState((prev) => ({ ...prev, [ap.key]: v }))}
                  videos={state[ap.videosKey]}
                  onVideosChange={(next) => updateVideos(ap.videosKey, next)}
                  onImport={() => setPickerFor(ap)}
                />
              ))}

              <div>
                <label className="text-xs text-neutral-500 block mb-1">Notas internas (opcional)</label>
                <textarea
                  className="input text-sm w-full"
                  rows={2}
                  value={state.notes}
                  onChange={(e) => setState((prev) => ({ ...prev, notes: e.target.value }))}
                  placeholder="Cuándo usar este caso, ideas de hooks…"
                />
              </div>

              <label className="flex items-start gap-2 text-sm bg-amber-50 border border-amber-200 rounded p-2">
                <input
                  type="checkbox"
                  checked={state.consentSigned}
                  onChange={(e) => setState((prev) => ({ ...prev, consentSigned: e.target.checked }))}
                  className="mt-0.5"
                />
                <span className="text-amber-900">
                  El paciente ha firmado el permiso de uso de imagen y testimonio.
                  <span className="block text-[11px] text-amber-700 mt-0.5">
                    Sin esta confirmación el caso queda marcado como "⚠ Sin permiso" y no debe publicarse.
                  </span>
                </span>
              </label>

              <div className="flex justify-end gap-2 pt-2 border-t">
                <button onClick={onClose} className="text-sm text-neutral-500 px-3 py-2">Cancelar</button>
                <button onClick={save} disabled={saving || !caseId || generating || importingWhatsApp} className="btn btn-primary text-sm">
                  {saving ? "Guardando…" : "Guardar caso"}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function ApartadoBlock({
  label, placeholder, text, onTextChange, videos, onVideosChange, onImport,
}: {
  label: string;
  placeholder: string;
  text: string;
  onTextChange: (v: string) => void;
  videos: VideoRef[];
  onVideosChange: (next: VideoRef[]) => void;
  onImport: () => void;
}) {
  const [adding, setAdding] = useState(false);
  const [newUrl, setNewUrl] = useState("");
  const [newCaption, setNewCaption] = useState("");

  function addVideo() {
    const url = newUrl.trim();
    if (!url) return;
    onVideosChange([...videos, { url, caption: newCaption.trim() }]);
    setNewUrl("");
    setNewCaption("");
    setAdding(false);
  }

  function removeVideo(i: number) {
    const next = videos.slice();
    next.splice(i, 1);
    onVideosChange(next);
  }

  return (
    <div className="border border-neutral-200 rounded-lg p-3 bg-white">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-1.5">
        <label className="text-sm font-semibold text-neutral-800">{label}</label>
        <div className="flex flex-wrap gap-3">
        <button type="button" onClick={onImport} className="text-xs font-medium text-amber-700 hover:text-amber-900">📎 Material del cliente</button>
        <button
          onClick={() => setAdding((v) => !v)}
          className="text-[11px] font-medium text-emerald-700 hover:text-emerald-900"
        >
          + Añadir enlace
        </button></div>
      </div>

      <textarea
        className="input text-sm w-full"
        rows={6}
        value={text}
        onChange={(e) => onTextChange(e.target.value)}
        placeholder={placeholder}
      />

      {adding && (
        <div className="mt-2 p-2 bg-neutral-50 rounded border border-neutral-200 space-y-2">
          <input
            type="url"
            className="input text-xs w-full"
            value={newUrl}
            onChange={(e) => setNewUrl(e.target.value)}
            placeholder="URL del material (Drive, YouTube, etc)"
            autoFocus
          />
          <input
            type="text"
            className="input text-xs w-full"
            value={newCaption}
            onChange={(e) => setNewCaption(e.target.value)}
            placeholder="Descripción corta (ej. clean pesado, MU en anilla)"
          />
          <div className="flex justify-end gap-1.5">
            <button onClick={() => { setAdding(false); setNewUrl(""); setNewCaption(""); }} className="text-[11px] text-neutral-500 px-2 py-1">
              Cancelar
            </button>
            <button onClick={addVideo} disabled={!newUrl.trim()} className="text-[11px] font-medium px-2 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded disabled:opacity-40">
              + Añadir
            </button>
          </div>
        </div>
      )}

      {videos.length > 0 && (
        <ul className="mt-2 space-y-1">
          {videos.map((v, i) => (
            <li key={`${v.url}-${i}`} className="flex items-center gap-2 text-[11px] bg-neutral-50 rounded px-2 py-1">
              <span className="shrink-0">{v.kind === "image" ? "🖼️" : v.kind === "document" ? "📄" : "🎥"}</span>
              <a href={v.url} target="_blank" rel="noopener noreferrer" className="truncate text-blue-600 hover:underline flex-1" title={v.url}>
                {v.caption || v.url}
              </a>
              <button onClick={() => removeVideo(i)} className="text-neutral-400 hover:text-red-600 text-xs px-1" title="Eliminar">✕</button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
