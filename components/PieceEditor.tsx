"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  FORMAT_TEMPLATES,
  DAY_LABELS,
  PIECE_STATUS,
  type FormatKey,
} from "@/lib/content-templates";

type Block = { id: string; label: string; content: string; order: number };

type Story = {
  id: string;
  description: string;
  published: boolean;
  order: number;
};

type Piece = {
  id: string;
  weekId: string;
  dayOfWeek: number;
  format: string;
  title: string | null;
  goal: string;
  ctaType: string;
  dmKeyword: string | null;
  hook: string | null;
  blocks: Block[];
  caption: string | null;
  recordingLocation: string | null;
  recordingOutfit: string | null;
  recordingMaterial: string | null;
  consentSigned: boolean;
  finalFileUrl: string | null;
  editorNotes: string | null;
  status: string;
  scheduledAt: string | null;
  metricsReach: number | null;
  metricsSaves: number | null;
  metricsShares: number | null;
  metricsComments: number | null;
  metricsDmKeyword: number | null;
  metricsConversions: number | null;
  metricsFilledAt: string | null;
};

const STATUS_BADGE: Record<string, string> = {
  neutral: "bg-neutral-100 text-neutral-700 border-neutral-200",
  amber: "bg-amber-100 text-amber-800 border-amber-200",
  blue: "bg-blue-100 text-blue-800 border-blue-200",
  purple: "bg-purple-100 text-purple-800 border-purple-200",
  indigo: "bg-indigo-100 text-indigo-800 border-indigo-200",
  emerald: "bg-emerald-100 text-emerald-800 border-emerald-200",
};

const AUTOSAVE_DEBOUNCE_MS = 1500;

export function PieceEditor({
  piece: initialPiece,
  week,
  stories: initialStories,
  prevId,
  nextId,
}: {
  piece: Piece;
  week: { id: string; centralTheme: string; leadMagnetKeyword: string | null };
  stories: Story[];
  prevId: string | null;
  nextId: string | null;
}) {
  const router = useRouter();
  const [piece, setPiece] = useState(initialPiece);
  const [stories, setStories] = useState(initialStories);
  const [activeTab, setActiveTab] = useState<"feed" | "stories">("feed");
  const [recordingMode, setRecordingMode] = useState(false);
  const [saving, setSaving] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null);

  // Autosave: debounce
  const saveTimerRef = useRef<NodeJS.Timeout | null>(null);
  const pendingPayloadRef = useRef<Partial<Piece> | null>(null);

  const queueSave = useCallback((partial: Partial<Piece>) => {
    pendingPayloadRef.current = { ...pendingPayloadRef.current, ...partial };
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(async () => {
      const payload = pendingPayloadRef.current;
      pendingPayloadRef.current = null;
      if (!payload) return;
      setSaving("saving");
      try {
        const res = await fetch("/api/content/pieces", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: piece.id, ...payload }),
        });
        if (res.ok) {
          setSaving("saved");
          setLastSavedAt(new Date());
          setTimeout(() => setSaving((s) => (s === "saved" ? "idle" : s)), 1500);
        } else {
          setSaving("error");
        }
      } catch {
        setSaving("error");
      }
    }, AUTOSAVE_DEBOUNCE_MS);
  }, [piece.id]);

  // Helper: actualiza state local + cola guardado
  function update<K extends keyof Piece>(key: K, value: Piece[K]) {
    setPiece((p) => ({ ...p, [key]: value }));
    queueSave({ [key]: value } as Partial<Piece>);
  }

  function updateBlocks(newBlocks: Block[]) {
    setPiece((p) => ({ ...p, blocks: newBlocks }));
    queueSave({ blocks: newBlocks });
  }

  // Atajo de teclado: flechas izquierda/derecha (solo en modo grabación)
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (!recordingMode) return;
      if (e.key === "Escape") setRecordingMode(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [recordingMode]);

  // Forzar guardado pendiente al desmontar
  useEffect(() => {
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      if (pendingPayloadRef.current) {
        fetch("/api/content/pieces", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          keepalive: true,
          body: JSON.stringify({ id: piece.id, ...pendingPayloadRef.current }),
        });
      }
    };
  }, [piece.id]);

  const tpl = FORMAT_TEMPLATES[piece.format as FormatKey];
  const statusMeta = PIECE_STATUS.find((s) => s.value === piece.status);
  const dayLabel = DAY_LABELS[piece.dayOfWeek];

  // ===== MODO GRABACIÓN =====
  if (recordingMode) {
    return (
      <RecordingMode
        piece={piece}
        week={week}
        onExit={() => setRecordingMode(false)}
      />
    );
  }

  // ===== MODO EDICIÓN NORMAL =====
  return (
    <main>
      {/* Cabecera fija */}
      <header className="mb-4">
        <div className="flex items-center gap-3 mb-2 flex-wrap">
          <Link href="/fisio/contenido" className="text-xs text-neutral-500 hover:text-neutral-900">
            ← Esta semana
          </Link>
          <span className="text-xs text-neutral-300">·</span>
          <span className="text-xs text-neutral-500">{week.centralTheme || "Sin tema"}</span>
        </div>

        <div className="flex justify-between items-start gap-3 flex-wrap">
          <div>
            <div className="flex items-baseline gap-3 flex-wrap">
              <input
                type="text"
                className="text-xl font-semibold bg-transparent border-0 outline-none focus:bg-neutral-50 rounded px-1 -mx-1 min-w-0 flex-shrink"
                style={{ width: `${Math.max((piece.title || tpl?.label || piece.format || "Sin título").length, 10)}ch` }}
                value={piece.title ?? ""}
                placeholder={tpl?.label ?? piece.format}
                onChange={(e) => update("title", e.target.value)}
                onBlur={(e) => {
                  // Si se queda vacío, lo guardamos como null (volverá al fallback)
                  if (e.target.value.trim() === "" && piece.title !== null) {
                    update("title", null);
                  }
                }}
              />
              <span className="text-xs text-neutral-400 italic">({tpl?.label ?? piece.format})</span>
              <span className="text-sm text-neutral-500">{dayLabel}</span>
              {statusMeta && (
                <span className={`text-[10px] uppercase font-medium px-2 py-0.5 rounded-full border ${STATUS_BADGE[statusMeta.color]}`}>
                  {statusMeta.label}
                </span>
              )}
            </div>
            <p className="text-xs text-neutral-500 mt-1">
              Objetivo: {piece.goal} · CTA: {piece.ctaType}
            </p>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <SaveIndicator saving={saving} lastSavedAt={lastSavedAt} />

            <select
              className="input text-xs w-auto"
              value={piece.status}
              onChange={(e) => update("status", e.target.value)}
            >
              {PIECE_STATUS.map((s) => (
                <option key={s.value} value={s.value}>{s.label}</option>
              ))}
            </select>

            <button
              onClick={() => setRecordingMode(true)}
              className="btn btn-accent text-xs"
              title="Modo grabación: tipografía grande, solo el guion"
            >
              🎬 Modo grabación
            </button>

            {/* Navegación entre piezas */}
            <div className="flex gap-1">
              {prevId ? (
                <Link href={`/fisio/contenido/pieza/${prevId}`} className="px-2 py-1.5 border border-neutral-200 rounded text-xs hover:bg-neutral-50">
                  ←
                </Link>
              ) : (
                <span className="px-2 py-1.5 border border-neutral-100 rounded text-xs text-neutral-300">←</span>
              )}
              {nextId ? (
                <Link href={`/fisio/contenido/pieza/${nextId}`} className="px-2 py-1.5 border border-neutral-200 rounded text-xs hover:bg-neutral-50">
                  →
                </Link>
              ) : (
                <span className="px-2 py-1.5 border border-neutral-100 rounded text-xs text-neutral-300">→</span>
              )}
            </div>
          </div>
        </div>

        {/* Fecha publicación + DM keyword */}
        <div className="flex gap-4 items-center mt-3 text-xs text-neutral-600">
          <div className="flex items-center gap-2">
            <span className="text-neutral-500">📅</span>
            <input
              type="datetime-local"
              className="input text-xs w-auto"
              value={piece.scheduledAt ? new Date(piece.scheduledAt).toISOString().slice(0, 16) : ""}
              onChange={(e) => update("scheduledAt", e.target.value || null)}
            />
          </div>
          {(piece.dmKeyword || tpl?.defaultDmKeyword) && (
            <div className="flex items-center gap-2">
              <span className="text-neutral-500">🔑 Palabra clave DM:</span>
              <input
                className="input text-xs w-auto font-mono uppercase"
                value={piece.dmKeyword ?? ""}
                onChange={(e) => update("dmKeyword", e.target.value.toUpperCase())}
                placeholder={tpl?.defaultDmKeyword ?? ""}
              />
            </div>
          )}
        </div>
      </header>

      {/* Tabs Feed / Stories */}
      <div className="flex gap-1 mb-4 border-b border-neutral-200">
        <button
          onClick={() => setActiveTab("feed")}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
            activeTab === "feed" ? "border-neutral-900 text-neutral-900" : "border-transparent text-neutral-500 hover:text-neutral-900"
          }`}
        >
          📰 Feed
        </button>
        <button
          onClick={() => setActiveTab("stories")}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors flex items-center gap-2 ${
            activeTab === "stories" ? "border-neutral-900 text-neutral-900" : "border-transparent text-neutral-500 hover:text-neutral-900"
          }`}
        >
          📲 Stories
          <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${activeTab === "stories" ? "bg-neutral-900 text-white" : "bg-neutral-100 text-neutral-600"}`}>
            {stories.filter((s) => s.published).length}/{stories.length}
          </span>
        </button>
      </div>

      {activeTab === "stories" ? (
        <StoriesPanel pieceId={piece.id} stories={stories} setStories={setStories} />
      ) : (
      /* Layout 2 columnas */
      <div className="grid grid-cols-1 lg:grid-cols-[60%_40%] gap-4">
        {/* COLUMNA IZQUIERDA: guion editable */}
        <section className="space-y-3">
          {/* Hook */}
          <div className="border-2 border-amber-200 rounded-lg p-3 bg-amber-50/40">
            <label className="text-[10px] uppercase text-amber-700 font-semibold tracking-wide mb-1 block">
              ⚡ Hook principal
            </label>
            <textarea
              className="w-full bg-transparent border-0 outline-none text-base font-medium resize-none"
              rows={2}
              value={piece.hook ?? ""}
              onChange={(e) => update("hook", e.target.value)}
              placeholder="El gancho que para el scroll. Frase corta, directa, provocadora."
            />
          </div>

          {/* Bloques de la estructura */}
          <BlocksEditor blocks={piece.blocks} onChange={updateBlocks} />

          {/* Caption */}
          <div className="bg-neutral-50 border border-neutral-200 rounded-lg p-3">
            <label className="text-[10px] uppercase text-neutral-500 font-semibold tracking-wide mb-1 block">
              ✍️ Caption
            </label>
            <textarea
              className="w-full bg-transparent border-0 outline-none text-sm resize-none"
              rows={6}
              value={piece.caption ?? ""}
              onChange={(e) => update("caption", e.target.value)}
              placeholder="Texto del post. Hook al inicio. CTA al final."
            />
          </div>
        </section>

        {/* COLUMNA DERECHA: panel de producción */}
        <aside className="space-y-3">
          {/* Para el editor */}
          <ProductionBlock title="👤 Para el editor">
            <textarea
              className="input text-xs"
              rows={3}
              value={piece.editorNotes ?? ""}
              onChange={(e) => update("editorNotes", e.target.value)}
              placeholder="Cortes, ritmo, transiciones, música..."
            />
            <div className="mt-2">
              <label className="text-[10px] uppercase text-neutral-500 block mb-1">URL del archivo final</label>
              <input
                className="input text-xs"
                value={piece.finalFileUrl ?? ""}
                onChange={(e) => update("finalFileUrl", e.target.value)}
                placeholder="https://drive.google.com/..."
              />
              {piece.finalFileUrl && (
                <a href={piece.finalFileUrl} target="_blank" rel="noopener noreferrer" className="text-[11px] text-blue-600 hover:underline mt-1 inline-block">
                  → Abrir archivo
                </a>
              )}
            </div>
          </ProductionBlock>

          {/* Métricas (desbloqueadas solo si status = published) */}
          <ProductionBlock title="📈 Métricas">
            <MetricsForm
              piece={piece}
              update={update}
              disabled={piece.status !== "published"}
            />
          </ProductionBlock>
        </aside>
      </div>
      )}
    </main>
  );
}

// ============================================================================
// Indicador de guardado
// ============================================================================

function SaveIndicator({ saving, lastSavedAt }: { saving: string; lastSavedAt: Date | null }) {
  if (saving === "saving") return <span className="text-xs text-neutral-500">💾 Guardando...</span>;
  if (saving === "saved") return <span className="text-xs text-emerald-700">✓ Guardado</span>;
  if (saving === "error") return <span className="text-xs text-red-600">⚠ Error al guardar</span>;
  if (lastSavedAt) return <span className="text-xs text-neutral-400">✓ Guardado</span>;
  return null;
}

// ============================================================================
// Editor de bloques: añadir / quitar / reordenar / editar título y contenido
// ============================================================================

function BlocksEditor({ blocks, onChange }: { blocks: Block[]; onChange: (b: Block[]) => void }) {
  function updateBlock(index: number, field: "label" | "content", value: string) {
    const newBlocks = blocks.map((b, i) => (i === index ? { ...b, [field]: value } : b));
    onChange(newBlocks);
  }
  function addBlock(afterIndex: number) {
    const newId = `b_${Date.now()}`;
    const newBlocks = [...blocks];
    newBlocks.splice(afterIndex + 1, 0, { id: newId, label: "Nuevo bloque", content: "", order: 0 });
    onChange(newBlocks.map((b, i) => ({ ...b, order: i })));
  }
  function removeBlock(index: number) {
    if (!confirm("¿Eliminar este bloque?")) return;
    const newBlocks = blocks.filter((_, i) => i !== index).map((b, i) => ({ ...b, order: i }));
    onChange(newBlocks);
  }
  function moveBlock(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= blocks.length) return;
    const newBlocks = [...blocks];
    [newBlocks[index], newBlocks[target]] = [newBlocks[target], newBlocks[index]];
    onChange(newBlocks.map((b, i) => ({ ...b, order: i })));
  }

  return (
    <div className="space-y-2">
      {blocks.map((b, i) => (
        <div key={b.id} className="border border-neutral-200 rounded-lg p-3 hover:border-neutral-300 group">
          <div className="flex items-center gap-2 mb-2">
            <input
              className="flex-1 text-xs font-semibold text-neutral-700 bg-neutral-50 border border-neutral-200 rounded px-2 py-1 outline-none focus:border-neutral-400 focus:bg-white"
              value={b.label}
              onChange={(e) => updateBlock(i, "label", e.target.value)}
              placeholder="Título del bloque (ej: Slide 4 · Desmonte, o tu nota de cómo grabarlo)"
            />
            <div className="flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
              <button onClick={() => moveBlock(i, -1)} disabled={i === 0} className="text-xs text-neutral-400 hover:text-neutral-900 disabled:opacity-30 px-1.5 py-1" title="Subir">↑</button>
              <button onClick={() => moveBlock(i, 1)} disabled={i === blocks.length - 1} className="text-xs text-neutral-400 hover:text-neutral-900 disabled:opacity-30 px-1.5 py-1" title="Bajar">↓</button>
              <button onClick={() => removeBlock(i)} className="text-xs text-neutral-400 hover:text-red-600 px-1.5 py-1" title="Eliminar">✕</button>
            </div>
          </div>
          <textarea
            className="w-full bg-transparent border-0 outline-none text-sm resize-none"
            rows={Math.max(2, Math.ceil((b.content?.length ?? 0) / 80))}
            value={b.content}
            onChange={(e) => updateBlock(i, "content", e.target.value)}
            placeholder="Contenido del bloque..."
          />
          {/* Botón insertar bloque después */}
          <button
            onClick={() => addBlock(i)}
            className="text-[10px] text-neutral-400 hover:text-neutral-900 mt-1 opacity-0 group-hover:opacity-100 transition-opacity"
          >
            + Añadir bloque debajo
          </button>
        </div>
      ))}

      {blocks.length === 0 && (
        <button onClick={() => addBlock(-1)} className="w-full border-2 border-dashed border-neutral-300 rounded-lg p-4 text-sm text-neutral-500 hover:bg-neutral-50">
          + Añadir primer bloque
        </button>
      )}
    </div>
  );
}

// ============================================================================
// Bloque de panel derecho
// ============================================================================

function ProductionBlock({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="card">
      <h3 className="text-xs uppercase text-neutral-500 font-medium tracking-wide mb-3">{title}</h3>
      <div className="space-y-2">{children}</div>
    </div>
  );
}

function Field({ label, value, onChange, placeholder }: { label: string; value: string | null; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <div>
      <label className="text-[10px] uppercase text-neutral-500 block mb-1">{label}</label>
      <input
        className="input text-xs"
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
      />
    </div>
  );
}

// ============================================================================
// Stories de apoyo: panel dedicado (tab Stories)
// ============================================================================

function StoriesPanel({
  pieceId,
  stories,
  setStories,
}: {
  pieceId: string;
  stories: Story[];
  setStories: (s: Story[]) => void;
}) {
  async function togglePublished(s: Story) {
    setStories(stories.map((x) => (x.id === s.id ? { ...x, published: !x.published } : x)));
    await fetch("/api/content/stories", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: s.id, published: !s.published }),
    });
  }

  async function updateDescription(s: Story, newDesc: string) {
    setStories(stories.map((x) => (x.id === s.id ? { ...x, description: newDesc } : x)));
    await fetch("/api/content/stories", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: s.id, description: newDesc }),
    });
  }

  async function addStory() {
    const res = await fetch("/api/content/stories", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pieceId, description: "" }),
    });
    if (res.ok) {
      const data = await res.json();
      setStories([...stories, data]);
    }
  }

  async function removeStory(s: Story) {
    if (!confirm("¿Eliminar esta story?")) return;
    setStories(stories.filter((x) => x.id !== s.id));
    await fetch(`/api/content/stories?id=${s.id}`, { method: "DELETE" });
  }

  const done = stories.filter((s) => s.published).length;

  return (
    <section className="max-w-2xl">
      <div className="mb-4">
        <p className="text-sm text-neutral-600">
          Stories que acompañan a esta pieza. Marca cada una cuando la publiques.
        </p>
        <p className="text-xs text-neutral-500 mt-1">
          {done}/{stories.length} publicadas
        </p>
      </div>

      <div className="card">
        {stories.length === 0 ? (
          <p className="text-sm text-neutral-400 text-center py-6 italic">
            Aún no hay stories de apoyo. Pulsa "+ Añadir story" para empezar.
          </p>
        ) : (
          <div className="space-y-2">
            {stories.map((s) => (
              <div key={s.id} className="flex items-start gap-3 p-2 -mx-2 rounded hover:bg-neutral-50 group">
                <input
                  type="checkbox"
                  checked={s.published}
                  onChange={() => togglePublished(s)}
                  className="w-5 h-5 accent-emerald-600 flex-shrink-0 mt-0.5"
                />
                <textarea
                  className={`flex-1 text-sm bg-transparent border-0 outline-none resize-none ${s.published ? "line-through text-neutral-400" : ""}`}
                  rows={1}
                  value={s.description}
                  onChange={(e) => updateDescription(s, e.target.value)}
                  placeholder="Describe esta story..."
                  onInput={(e) => {
                    const t = e.currentTarget;
                    t.style.height = "auto";
                    t.style.height = t.scrollHeight + "px";
                  }}
                />
                <button
                  onClick={() => removeStory(s)}
                  className="text-xs text-neutral-300 hover:text-red-600 opacity-0 group-hover:opacity-100 flex-shrink-0 mt-1"
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        )}

        <button
          onClick={addStory}
          className="mt-3 text-sm text-blue-600 hover:underline"
        >
          + Añadir story
        </button>
      </div>
    </section>
  );
}

// ============================================================================
// Formulario de métricas
// ============================================================================

function MetricsForm({
  piece,
  update,
  disabled,
}: {
  piece: Piece;
  update: <K extends keyof Piece>(k: K, v: Piece[K]) => void;
  disabled: boolean;
}) {
  if (disabled) {
    return (
      <p className="text-xs text-neutral-400 italic">
        Se desbloquea cuando marques la pieza como Publicada. Te avisamos cuando llegue el momento de rellenar las métricas.
      </p>
    );
  }

  function MetricInput({ label, field, hint }: { label: string; field: keyof Piece; hint?: string }) {
    return (
      <div>
        <label className="text-[10px] uppercase text-neutral-500 block mb-1">
          {label} {hint && <span className="text-neutral-400 normal-case">({hint})</span>}
        </label>
        <input
          type="number"
          min="0"
          className="input text-xs"
          value={(piece[field] as number | null) ?? ""}
          onChange={(e) => update(field, e.target.value === "" ? null : (Number(e.target.value) as any))}
          placeholder="0"
        />
      </div>
    );
  }

  return (
    <>
      <div className="grid grid-cols-2 gap-2">
        <MetricInput label="Alcance" field="metricsReach" />
        <MetricInput label="Guardados" field="metricsSaves" />
        <MetricInput label="Compartidos" field="metricsShares" />
        <MetricInput label="Comentarios" field="metricsComments" />
        <MetricInput label="DMs palabra clave" field="metricsDmKeyword" />
        <MetricInput label="Conversiones" field="metricsConversions" hint="ventas" />
      </div>
      {piece.metricsFilledAt && (
        <p className="text-[10px] text-neutral-400 mt-2 italic">
          Última actualización: {new Date(piece.metricsFilledAt).toLocaleString("es-ES", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
        </p>
      )}
    </>
  );
}

// ============================================================================
// MODO GRABACIÓN: solo guion, tipografía grande, pensado para pantalla amplia
// ============================================================================

function RecordingMode({
  piece,
  week,
  onExit,
}: {
  piece: Piece;
  week: { centralTheme: string; leadMagnetKeyword: string | null };
  onExit: () => void;
}) {
  const tpl = FORMAT_TEMPLATES[piece.format as FormatKey];
  const dayLabel = DAY_LABELS[piece.dayOfWeek];

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto" style={{ background: "#FFFFFF", color: "#0A0A0A" }}>
      {/* Barra superior minimalista */}
      <div className="sticky top-0 z-10 flex justify-between items-center px-6 py-3" style={{ background: "rgba(255,255,255,0.95)", borderBottom: "1px solid #E5E5E5", backdropFilter: "blur(8px)" }}>
        <div>
          <div className="text-xs uppercase tracking-wide" style={{ color: "#737373" }}>
            {dayLabel} · {tpl?.label}
          </div>
          <div className="text-sm" style={{ color: "#0A0A0A" }}>
            {week.centralTheme}
          </div>
        </div>
        <button
          onClick={onExit}
          className="text-sm px-4 py-2 rounded-lg"
          style={{ background: "#0A0A0A", color: "#FAFAFA" }}
          title="Esc para salir"
        >
          ✕ Salir del modo grabación
        </button>
      </div>

      {/* Guion en grande */}
      <div className="max-w-3xl mx-auto px-6 py-8 pb-32">
        {piece.hook && (
          <div className="mb-10 pb-6 border-b-2" style={{ borderColor: "#F59E0B" }}>
            <div className="text-xs uppercase tracking-wider mb-2 font-semibold" style={{ color: "#F59E0B" }}>
              ⚡ Hook
            </div>
            <p className="text-3xl font-semibold leading-tight" style={{ color: "#0A0A0A", letterSpacing: "-0.015em" }}>
              {piece.hook}
            </p>
          </div>
        )}

        <div className="space-y-8">
          {piece.blocks.map((b) => (
            <div key={b.id}>
              <div className="text-sm uppercase tracking-wider mb-3 font-semibold" style={{ color: "#F59E0B" }}>
                {b.label}
              </div>
              {b.content ? (
                <p className="text-2xl leading-relaxed whitespace-pre-wrap" style={{ color: "#0A0A0A", letterSpacing: "-0.01em" }}>
                  {b.content}
                </p>
              ) : (
                <p className="text-xl italic" style={{ color: "#D4D4D4" }}>
                  (vacío)
                </p>
              )}
            </div>
          ))}
        </div>

        {piece.caption && (
          <div className="mt-12 pt-6 border-t" style={{ borderColor: "#E5E5E5" }}>
            <div className="text-sm uppercase tracking-wider mb-3 font-medium" style={{ color: "#737373" }}>
              ✍️ Caption
            </div>
            <p className="text-lg leading-relaxed whitespace-pre-wrap" style={{ color: "#404040" }}>
              {piece.caption}
            </p>
          </div>
        )}
      </div>

      <div className="fixed bottom-4 left-1/2 -translate-x-1/2 text-xs" style={{ color: "#A3A3A3" }}>
        Pulsa Esc para salir
      </div>
    </div>
  );
}
