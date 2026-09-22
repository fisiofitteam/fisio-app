"use client";

import { useEffect, useState } from "react";

/**
 * Drawer lateral con el detalle de una respuesta del Semáforo:
 * respuestas legibles, motivos del color, notas editables, marcar
 * como gestionado, botones a WhatsApp e Instagram, y eliminar (CEO).
 */

type Detail = {
  id: string;
  createdAt: string;
  updatedAt: string;
  instagram: string | null;
  nombre: string | null;
  telefono: string | null;
  campana: string | null;
  estado: "EN_CURSO" | "COMPLETADO" | "ALARMA";
  ultimoPaso: number;
  color: "VERDE" | "AMBAR" | "ROJO" | null;
  colorCopy: { verdict: string; title: string; waLine: string } | null;
  why: { sev: number; k: "neg" | "mid" | "pos"; t: string }[];
  banderas: string[];
  banderasDecoded: string[];
  movimientos: Record<string, string>;
  movimientosLegibles: { family: string; value: string | null; color: string; advice: string }[];
  respuestasLegibles: { questionId: string; title: string; section: string; value: string | null }[];
  whatsappClickAt: string | null;
  consentimientoAt: string;
  consentimientoVersion: string;
  gestionado: boolean;
  gestionadoPor: string | null;
  notas: string | null;
};

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleString("es-ES", { dateStyle: "medium", timeStyle: "short" });
}

const COLORS = {
  VERDE: { bg: "#DCFCE7", fg: "#166534" },
  AMBAR: { bg: "#FEF3C7", fg: "#92400E" },
  ROJO: { bg: "#FEE2E2", fg: "#991B1B" },
} as const;

export function SemaforoDetailDrawer({
  id, canDelete, onClose, onChanged,
}: {
  id: string;
  canDelete: boolean;
  onClose: () => void;
  onChanged: () => void;
}) {
  const [data, setData] = useState<Detail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notas, setNotas] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetch(`/api/semaforo/admin/${id}`)
      .then((r) => r.json().then((d) => ({ ok: r.ok, d })))
      .then(({ ok, d }) => {
        if (cancelled) return;
        if (!ok) { setError(d?.error ?? "Error"); return; }
        setData(d);
        setNotas(d.notas ?? "");
      })
      .catch((e) => { if (!cancelled) setError(e?.message ?? "Error"); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [id]);

  async function toggleGestionado() {
    if (!data) return;
    setSaving(true);
    await fetch(`/api/semaforo/admin/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ gestionado: !data.gestionado }),
    });
    setSaving(false);
    // Recargar detalle y notificar al padre.
    const r = await fetch(`/api/semaforo/admin/${id}`).then((r) => r.json()).catch(() => null);
    if (r) setData(r);
    onChanged();
  }

  async function saveNotas() {
    setSaving(true);
    await fetch(`/api/semaforo/admin/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ notas }),
    });
    setSaving(false);
    onChanged();
  }

  async function eliminar() {
    if (!confirm("¿Eliminar este registro? No se puede deshacer. Solo hazlo si el usuario lo ha solicitado (RGPD).")) return;
    setSaving(true);
    const r = await fetch(`/api/semaforo/admin/${id}`, { method: "DELETE" });
    setSaving(false);
    if (r.ok) { onChanged(); onClose(); }
    else { alert("No se pudo eliminar"); }
  }

  // WhatsApp del usuario si dio teléfono, o mensaje pre-hecho al CEO.
  function waHref(): string | null {
    if (!data) return null;
    if (data.telefono) {
      const clean = data.telefono.replace(/[^0-9]/g, "");
      return clean ? `https://wa.me/${clean}` : null;
    }
    // Sin teléfono, no podemos abrir chat con el paciente.
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 flex" onClick={onClose}>
      <div className="flex-1 bg-black/50" />
      <aside
        className="w-full max-w-2xl h-full overflow-y-auto bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="sticky top-0 bg-white border-b border-neutral-200 px-5 py-3 flex items-center justify-between z-10">
          <div>
            <div className="text-[11px] uppercase tracking-wide text-neutral-500">Semáforo del Hombro</div>
            <div className="font-semibold text-sm">{data?.nombre || (data?.instagram ? `@${data.instagram}` : id.slice(0, 8))}</div>
          </div>
          <button onClick={onClose} className="text-neutral-400 text-2xl leading-none">×</button>
        </header>

        {loading && <p className="p-6 text-sm text-neutral-500 italic">Cargando…</p>}
        {error && <p className="p-6 text-sm text-red-600">{error}</p>}

        {data && (
          <div className="p-5 space-y-5">
            {/* Cabecera de estado */}
            <section className="flex flex-wrap items-center gap-2">
              {data.estado === "ALARMA" ? (
                <span className="text-xs font-medium px-2 py-1 rounded-full bg-neutral-900 text-red-200">🚨 ALARMA</span>
              ) : data.color ? (
                <span className="text-xs font-medium px-2 py-1 rounded-full"
                  style={{ background: COLORS[data.color].bg, color: COLORS[data.color].fg }}>
                  {data.colorCopy?.verdict ?? data.color}
                </span>
              ) : (
                <span className="text-xs font-medium px-2 py-1 rounded-full bg-neutral-200 text-neutral-700">
                  En curso (paso {data.ultimoPaso + 1})
                </span>
              )}
              {data.whatsappClickAt && (
                <span className="text-xs px-2 py-1 rounded-full bg-emerald-100 text-emerald-800">
                  ✅ Click WhatsApp · {fmtDate(data.whatsappClickAt)}
                </span>
              )}
              {data.campana && (
                <span className="text-xs px-2 py-1 rounded-full bg-blue-100 text-blue-900">
                  🎯 {data.campana}
                </span>
              )}
              <span className="text-xs text-neutral-500 ml-auto">
                {fmtDate(data.createdAt)}
              </span>
            </section>

            {/* Datos contacto + acciones */}
            <section className="grid grid-cols-2 gap-3 rounded-lg p-3" style={{ background: "#FAFAFA", border: "1px solid #E5E5E5" }}>
              <div>
                <div className="text-[11px] text-neutral-500">Instagram</div>
                <div className="font-medium">
                  {data.instagram
                    ? <a href={`https://instagram.com/${data.instagram}`} target="_blank" rel="noopener" className="text-blue-700 hover:underline">@{data.instagram}</a>
                    : <span className="text-neutral-400">—</span>}
                </div>
              </div>
              <div>
                <div className="text-[11px] text-neutral-500">Teléfono</div>
                <div className="font-medium">{data.telefono || <span className="text-neutral-400">—</span>}</div>
              </div>
            </section>

            <div className="flex gap-2 flex-wrap">
              {waHref() && (
                <a href={waHref()!} target="_blank" rel="noopener"
                   className="text-xs font-medium px-3 py-1.5 rounded-lg"
                   style={{ background: "#1FA855", color: "#fff" }}>
                  💬 Abrir WhatsApp
                </a>
              )}
              {data.instagram && (
                <a href={`https://instagram.com/${data.instagram}`} target="_blank" rel="noopener"
                   className="text-xs font-medium px-3 py-1.5 rounded-lg"
                   style={{ background: "#E4405F", color: "#fff" }}>
                  📷 Abrir Instagram
                </a>
              )}
              <button
                onClick={toggleGestionado}
                disabled={saving}
                className="text-xs font-medium px-3 py-1.5 rounded-lg"
                style={{
                  background: data.gestionado ? "#F5F5F5" : "#0A0A0A",
                  color: data.gestionado ? "#171717" : "#FAFAFA",
                  border: "1px solid #E5E5E5",
                }}
              >
                {data.gestionado
                  ? `↩ Desmarcar (gestionado por ${data.gestionadoPor ?? "—"})`
                  : "✔ Marcar como gestionado"}
              </button>
            </div>

            {/* Alarma / banderas */}
            {data.banderas.length > 0 && (
              <section className="rounded-lg p-3" style={{ background: "#FEE2E2", border: "2px solid #DC2626" }}>
                <div className="text-xs font-semibold text-red-900 mb-1">🚩 Banderas rojas marcadas</div>
                <ul className="list-disc pl-5 text-sm text-red-900">
                  {data.banderasDecoded.map((b, i) => <li key={i}>{b}</li>)}
                </ul>
              </section>
            )}

            {/* Motivos del color */}
            {data.why.length > 0 && (
              <section>
                <h3 className="text-sm font-semibold mb-2">Por qué le salió este color</h3>
                <ul className="space-y-2">
                  {data.why.map((w, i) => (
                    <li key={i}
                        className="text-sm rounded p-2.5"
                        style={{
                          background: "#FAFAFA",
                          borderLeft: `4px solid ${w.k === "neg" ? "#DC2626" : w.k === "mid" ? "#B45309" : "#059669"}`,
                        }}>
                      {w.t}
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {/* Mapa de movimientos */}
            {data.movimientosLegibles.some((m) => m.value) && (
              <section>
                <h3 className="text-sm font-semibold mb-2">Mapa de movimientos</h3>
                <div className="space-y-1.5">
                  {data.movimientosLegibles.map((m) => (
                    <div key={m.family} className="flex items-start gap-2 text-sm rounded p-2.5"
                         style={{ background: "#FAFAFA" }}>
                      <span
                        className="inline-block w-3 h-3 rounded-full mt-1 flex-shrink-0"
                        style={{ background: m.color === "g" ? "#059669" : m.color === "a" ? "#B45309" : m.color === "r" ? "#DC2626" : "#9AA2AC" }}
                      />
                      <div>
                        <div className="font-medium">{m.family}</div>
                        <div className="text-[13px] text-neutral-600">{m.advice}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {/* Todas las respuestas */}
            <section>
              <h3 className="text-sm font-semibold mb-2">Respuestas</h3>
              <div className="space-y-2">
                {data.respuestasLegibles.map((r) => (
                  <div key={r.questionId} className="text-sm">
                    <div className="text-[11px] text-neutral-500 uppercase tracking-wide">{r.section}</div>
                    <div className="font-medium">{r.title}</div>
                    <div className="text-neutral-700">{r.value ?? <span className="text-neutral-400 italic">Sin responder</span>}</div>
                  </div>
                ))}
              </div>
            </section>

            {/* Notas internas */}
            <section>
              <h3 className="text-sm font-semibold mb-2">Notas internas</h3>
              <textarea
                value={notas}
                onChange={(e) => setNotas(e.target.value)}
                onBlur={saveNotas}
                rows={4}
                className="w-full text-sm p-2 rounded-lg border"
                style={{ borderColor: "#E5E5E5" }}
                placeholder="Contexto adicional, cómo fue el WhatsApp, próximos pasos…"
              />
              <p className="text-[10px] text-neutral-500 mt-1">Se guardan al salir del campo.</p>
            </section>

            {/* Consentimiento */}
            <section className="rounded-lg p-3 text-[11px] text-neutral-600" style={{ background: "#FAFAFA", border: "1px solid #E5E5E5" }}>
              <div><b>Consentimiento:</b> {fmtDate(data.consentimientoAt)} · versión <code>{data.consentimientoVersion}</code></div>
              <div><b>Última actualización:</b> {fmtDate(data.updatedAt)}</div>
            </section>

            {canDelete && (
              <section className="pt-3 border-t border-neutral-200">
                <button
                  onClick={eliminar}
                  disabled={saving}
                  className="text-xs font-medium px-3 py-1.5 rounded-lg text-red-700 border border-red-300 hover:bg-red-50"
                >
                  🗑 Eliminar registro (RGPD)
                </button>
                <p className="text-[10px] text-neutral-500 mt-1">Solo el CEO puede eliminar. Usar solo para solicitudes de supresión.</p>
              </section>
            )}
          </div>
        )}
      </aside>
    </div>
  );
}
