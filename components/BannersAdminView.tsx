"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

type Banner = {
  id: string;
  title: string;
  body: string;
  variant: string;
  targetProgramTypes: string[];
  startsAt: string;
  endsAt: string;
  dismissible: boolean;
  dismissedCount: number;
  createdByName: string | null;
  createdAt: string;
};

const PROGRAMS = ["RECUPERA", "CONSOLIDA", "ADVANCE", "PREVENTION"] as const;
const VARIANT_META: Record<string, { label: string; color: string; bg: string }> = {
  info:    { label: "Info",     color: "#1E3A8A", bg: "#DBEAFE" },
  warning: { label: "Aviso",    color: "#78350F", bg: "#FEF3C7" },
  success: { label: "Buenas noticias", color: "#065F46", bg: "#DCFCE7" },
};

function toLocalInput(iso: string): string {
  const d = new Date(iso);
  const off = d.getTimezoneOffset();
  return new Date(d.getTime() - off * 60000).toISOString().slice(0, 16);
}

function fmtDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString("es-ES", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

function bannerStatus(startsAt: string, endsAt: string): "activo" | "programado" | "expirado" {
  const now = Date.now();
  const s = new Date(startsAt).getTime();
  const e = new Date(endsAt).getTime();
  if (now < s) return "programado";
  if (now > e) return "expirado";
  return "activo";
}

export function BannersAdminView({ initialBanners }: { initialBanners: Banner[] }) {
  const router = useRouter();
  const [banners, setBanners] = useState<Banner[]>(initialBanners);
  const [editing, setEditing] = useState<Banner | null>(null);
  const [creating, setCreating] = useState(false);
  const [detailFor, setDetailFor] = useState<string | null>(null);

  async function refresh() {
    const r = await fetch("/api/admin/patient-banners");
    if (r.ok) {
      const d = await r.json();
      setBanners(
        (d.banners || []).map((b: any) => ({
          id: b.id,
          title: b.title,
          body: b.body,
          variant: b.variant,
          targetProgramTypes: (() => { try { return JSON.parse(b.targetProgramTypes) || []; } catch { return []; } })(),
          startsAt: b.startsAt,
          endsAt: b.endsAt,
          dismissible: b.dismissible,
          dismissedCount: b._count?.dismissals ?? 0,
          createdByName: b.createdBy?.fullName ?? null,
          createdAt: b.createdAt,
        })),
      );
      router.refresh();
    }
  }

  async function deleteBanner(id: string) {
    if (!confirm("¿Eliminar este banner? Los pacientes que aún no lo hubieran cerrado dejarán de verlo.")) return;
    await fetch(`/api/admin/patient-banners/${id}`, { method: "DELETE" });
    refresh();
  }

  return (
    <>
      <div className="flex justify-end mb-3">
        <button
          onClick={() => setCreating(true)}
          className="text-xs font-medium px-3 py-2 rounded-lg"
          style={{ background: "#0A0A0A", color: "#FAFAFA" }}
        >
          + Nuevo aviso
        </button>
      </div>

      {banners.length === 0 ? (
        <div className="rounded-xl p-6 text-center text-sm text-neutral-500" style={{ background: "#FAFAFA", border: "1px dashed #D4D4D4" }}>
          Aún no hay avisos programados.
        </div>
      ) : (
        <div className="space-y-2">
          {banners.map((b) => {
            const status = bannerStatus(b.startsAt, b.endsAt);
            const meta = VARIANT_META[b.variant] ?? VARIANT_META.info;
            return (
              <div key={b.id} className="rounded-lg p-3 bg-white border border-neutral-200">
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <span
                        className="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded"
                        style={{ background: meta.bg, color: meta.color }}
                      >
                        {meta.label}
                      </span>
                      <span
                        className="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded"
                        style={{
                          background: status === "activo" ? "#DCFCE7" : status === "programado" ? "#DBEAFE" : "#F3F4F6",
                          color: status === "activo" ? "#065F46" : status === "programado" ? "#1E3A8A" : "#6B7280",
                        }}
                      >
                        {status.toUpperCase()}
                      </span>
                      {!b.dismissible && (
                        <span className="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded bg-red-100 text-red-800">
                          No descartable
                        </span>
                      )}
                    </div>
                    <div className="font-medium text-sm">{b.title}</div>
                    <div className="text-xs text-neutral-600 whitespace-pre-wrap mt-0.5 line-clamp-2">{b.body}</div>
                    <div className="text-[11px] text-neutral-500 mt-1.5">
                      {b.targetProgramTypes.length === 0 ? "Todos los programas" : b.targetProgramTypes.join(" · ")}
                      {" · "}
                      {fmtDate(b.startsAt)} → {fmtDate(b.endsAt)}
                    </div>
                  </div>
                  <div className="flex flex-col gap-1 items-end">
                    <button
                      onClick={() => setDetailFor(b.id)}
                      className="text-[11px] font-medium underline"
                      style={{ color: "#4C1D95" }}
                    >
                      👁 {b.dismissedCount} descartaron
                    </button>
                    <div className="flex gap-1">
                      <button onClick={() => setEditing(b)} className="text-[11px] text-neutral-500 hover:text-neutral-900 underline">
                        Editar
                      </button>
                      <span className="text-neutral-300">·</span>
                      <button onClick={() => deleteBanner(b.id)} className="text-[11px] text-red-600 hover:underline">
                        Eliminar
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {(creating || editing) && (
        <BannerEditor
          initial={editing}
          onClose={() => { setCreating(false); setEditing(null); }}
          onSaved={() => { setCreating(false); setEditing(null); refresh(); }}
        />
      )}

      {detailFor && (
        <BannerDetail bannerId={detailFor} onClose={() => setDetailFor(null)} />
      )}
    </>
  );
}

// ────────────────────────────────────────────────────────────────────────────

function BannerEditor({ initial, onClose, onSaved }: { initial: Banner | null; onClose: () => void; onSaved: () => void }) {
  const [title, setTitle] = useState(initial?.title ?? "");
  const [body, setBody] = useState(initial?.body ?? "");
  const [variant, setVariant] = useState<string>(initial?.variant ?? "info");
  const [programs, setPrograms] = useState<string[]>(initial?.targetProgramTypes ?? []);
  const [startsAt, setStartsAt] = useState<string>(() => {
    if (initial) return toLocalInput(initial.startsAt);
    const now = new Date();
    now.setSeconds(0, 0);
    return toLocalInput(now.toISOString());
  });
  const [endsAt, setEndsAt] = useState<string>(() => {
    if (initial) return toLocalInput(initial.endsAt);
    const in7 = new Date();
    in7.setDate(in7.getDate() + 7);
    in7.setSeconds(0, 0);
    return toLocalInput(in7.toISOString());
  });
  const [dismissible, setDismissible] = useState(initial?.dismissible ?? true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setError(null);
    setSaving(true);
    const method = initial ? "PATCH" : "POST";
    const url = initial ? `/api/admin/patient-banners/${initial.id}` : "/api/admin/patient-banners";
    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title,
        body,
        variant,
        targetProgramTypes: programs,
        startsAt: new Date(startsAt).toISOString(),
        endsAt: new Date(endsAt).toISOString(),
        dismissible,
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(data?.error ?? "Error al guardar");
      setSaving(false);
      return;
    }
    onSaved();
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-start justify-center z-50 p-4 overflow-y-auto" onClick={onClose}>
      <div className="bg-white rounded-2xl max-w-lg w-full p-4 my-6" onClick={(e) => e.stopPropagation()}>
        <div className="flex justify-between items-center mb-3">
          <h3 className="font-semibold">{initial ? "Editar aviso" : "Nuevo aviso"}</h3>
          <button onClick={onClose} className="text-neutral-400 text-xl">✕</button>
        </div>

        <div className="space-y-3">
          <div>
            <label className="text-xs text-neutral-500 block mb-1">Título</label>
            <input className="input text-sm w-full" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Ej: Cambio de horario esta semana" />
          </div>
          <div>
            <label className="text-xs text-neutral-500 block mb-1">Mensaje</label>
            <textarea className="input text-sm w-full" rows={4} value={body} onChange={(e) => setBody(e.target.value)} placeholder="Ej: El lunes 25 no habrá clase por festivo. Aprovecha para hacer la sesión el domingo." />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs text-neutral-500 block mb-1">Fecha de inicio</label>
              <input type="datetime-local" className="input text-sm w-full" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} />
            </div>
            <div>
              <label className="text-xs text-neutral-500 block mb-1">Fecha de fin</label>
              <input type="datetime-local" className="input text-sm w-full" value={endsAt} onChange={(e) => setEndsAt(e.target.value)} />
            </div>
          </div>
          <div>
            <label className="text-xs text-neutral-500 block mb-1">Estilo</label>
            <div className="flex gap-2">
              {Object.entries(VARIANT_META).map(([v, m]) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => setVariant(v)}
                  className="text-xs px-3 py-1.5 rounded-lg border transition"
                  style={{
                    background: variant === v ? m.color : "#FFFFFF",
                    color: variant === v ? "#FFFFFF" : m.color,
                    borderColor: variant === v ? m.color : m.bg,
                  }}
                >
                  {m.label}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="text-xs text-neutral-500 block mb-1">
              Programas destinatarios <span className="text-[10px]">(vacío = todos)</span>
            </label>
            <div className="flex gap-1.5 flex-wrap">
              {PROGRAMS.map((p) => {
                const active = programs.includes(p);
                return (
                  <button
                    key={p}
                    type="button"
                    onClick={() => setPrograms((prev) => prev.includes(p) ? prev.filter((x) => x !== p) : [...prev, p])}
                    className="text-xs px-2.5 py-1 rounded-full border transition"
                    style={{
                      background: active ? "#0A0A0A" : "#FFFFFF",
                      color: active ? "#FAFAFA" : "#0A0A0A",
                      borderColor: active ? "#0A0A0A" : "#E5E5E5",
                    }}
                  >
                    {p}
                  </button>
                );
              })}
            </div>
          </div>
          <label className="flex items-center gap-2 text-xs cursor-pointer">
            <input type="checkbox" checked={dismissible} onChange={(e) => setDismissible(e.target.checked)} className="w-4 h-4 accent-neutral-900" />
            <span>El paciente puede descartar el aviso con "OK" (recomendado)</span>
          </label>
          {!dismissible && (
            <div className="text-[11px] rounded px-2 py-1.5" style={{ background: "#FEE2E2", color: "#7F1D1D" }}>
              ⚠ Este aviso NO se puede descartar. Aparecerá hasta que termine la fecha de fin o lo elimines.
            </div>
          )}
          {error && (
            <div className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-md px-2 py-1.5">⚠ {error}</div>
          )}
          <div className="flex justify-end gap-2 pt-1">
            <button onClick={onClose} className="btn btn-ghost text-xs">Cancelar</button>
            <button onClick={save} disabled={saving || !title.trim() || !body.trim()} className="btn btn-primary text-xs disabled:opacity-40">
              {saving ? "Guardando…" : initial ? "Guardar cambios" : "Publicar aviso"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────

function BannerDetail({ bannerId, onClose }: { bannerId: string; onClose: () => void }) {
  const [data, setData] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/admin/patient-banners/${bannerId}`)
      .then((r) => r.json())
      .then((d) => { if (!cancelled) { setData(d); setLoading(false); } })
      .catch(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [bannerId]);

  return (
    <div className="fixed inset-0 bg-black/50 flex items-start justify-center z-50 p-4 overflow-y-auto" onClick={onClose}>
      <div className="bg-white rounded-2xl max-w-lg w-full p-4 my-6" onClick={(e) => e.stopPropagation()}>
        <div className="flex justify-between items-center mb-3">
          <h3 className="font-semibold">Detalle del aviso</h3>
          <button onClick={onClose} className="text-neutral-400 text-xl">✕</button>
        </div>
        {loading && <p className="text-sm text-neutral-500">Cargando…</p>}
        {!loading && data && (
          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-2 text-center">
              <div className="rounded-lg p-2" style={{ background: "#F9FAFB", border: "1px solid #E5E7EB" }}>
                <div className="text-[10px] uppercase tracking-wider text-neutral-500">Elegibles</div>
                <div className="text-lg font-semibold">{data.stats.eligible}</div>
              </div>
              <div className="rounded-lg p-2" style={{ background: "#DCFCE7", border: "1px solid #86EFAC" }}>
                <div className="text-[10px] uppercase tracking-wider" style={{ color: "#065F46" }}>Descartaron</div>
                <div className="text-lg font-semibold" style={{ color: "#065F46" }}>{data.stats.dismissed}</div>
              </div>
              <div className="rounded-lg p-2" style={{ background: "#FEF3C7", border: "1px solid #FCD34D" }}>
                <div className="text-[10px] uppercase tracking-wider" style={{ color: "#78350F" }}>Aún activo</div>
                <div className="text-lg font-semibold" style={{ color: "#78350F" }}>{data.stats.pending}</div>
              </div>
            </div>

            <div>
              <h4 className="text-xs font-semibold uppercase tracking-wider text-neutral-500 mb-1">Descartaron ({data.dismissedPatients.length})</h4>
              {data.dismissedPatients.length === 0 ? (
                <p className="text-xs text-neutral-400 italic">Aún nadie lo ha cerrado.</p>
              ) : (
                <ul className="text-xs space-y-1 max-h-40 overflow-y-auto">
                  {data.dismissedPatients.map((p: any) => (
                    <li key={p.patientId} className="flex justify-between gap-2">
                      <span>{p.fullName} <span className="text-neutral-400">· {p.programType ?? "?"}</span></span>
                      <span className="text-neutral-500 tabular-nums">{new Date(p.dismissedAt).toLocaleDateString("es-ES", { day: "numeric", month: "short" })}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div>
              <h4 className="text-xs font-semibold uppercase tracking-wider text-neutral-500 mb-1">Aún les aparece ({data.pendingPatients.length})</h4>
              {data.pendingPatients.length === 0 ? (
                <p className="text-xs text-neutral-400 italic">Todos los elegibles ya lo cerraron.</p>
              ) : (
                <ul className="text-xs space-y-1 max-h-40 overflow-y-auto">
                  {data.pendingPatients.map((p: any) => (
                    <li key={p.id}>{p.fullName} <span className="text-neutral-400">· {p.programType ?? "?"}</span></li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
