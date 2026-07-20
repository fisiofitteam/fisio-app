"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { AlertTriangle, AlertCircle, Info, Check, X, User, Sparkles, TrendingUp } from "lucide-react";

type Alert = {
  id: string;
  kind: "notes_ai" | "metric_deviation";
  severity: "info" | "warn" | "high";
  summary: string;
  triggerData: string | null;
  sourceType: "session" | "daily_log";
  sourceId: string;
  seenAt: string | null;
  dismissedAt: string | null;
  createdAt: string;
  patient: {
    id: string;
    fullName: string;
    photoUrl: string | null;
    programType: string | null;
    assignedProfessional: { id: string; name: string } | null;
  };
};

export function AlertsInbox({ managerDefault }: { managerDefault: boolean }) {
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [loading, setLoading] = useState(true);
  const [scope, setScope] = useState<"mine" | "all">(managerDefault ? "all" : "mine");
  const [includeSeen, setIncludeSeen] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  async function fetchAlerts() {
    setLoading(true);
    const params = new URLSearchParams();
    params.set("scope", scope);
    if (includeSeen) params.set("includeSeen", "1");
    try {
      const r = await fetch(`/api/alerts?${params.toString()}`, { cache: "no-store" });
      if (r.ok) {
        const data = await r.json();
        setAlerts(data.alerts ?? []);
      }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchAlerts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scope, includeSeen]);

  async function act(id: string, action: "seen" | "dismiss") {
    setBusyId(id);
    try {
      await fetch(`/api/alerts/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      // Optimista: actualizamos en local sin refetch
      setAlerts((prev) =>
        action === "dismiss"
          ? prev.filter((a) => a.id !== id)
          : prev.map((a) => (a.id === id ? { ...a, seenAt: new Date().toISOString() } : a))
      );
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <button
          onClick={() => setScope("mine")}
          className={`px-3 py-1.5 rounded-lg font-medium ${scope === "mine" ? "bg-neutral-900 text-white" : "bg-white border border-neutral-200 text-neutral-700"}`}
        >
          Mis pacientes
        </button>
        <button
          onClick={() => setScope("all")}
          className={`px-3 py-1.5 rounded-lg font-medium ${scope === "all" ? "bg-neutral-900 text-white" : "bg-white border border-neutral-200 text-neutral-700"}`}
        >
          Todos
        </button>
        <div className="w-px h-5 bg-neutral-200 mx-1" />
        <label className="flex items-center gap-1.5 text-neutral-600 cursor-pointer">
          <input type="checkbox" checked={includeSeen} onChange={(e) => setIncludeSeen(e.target.checked)} />
          Incluir vistas
        </label>
      </div>

      {loading ? (
        <div className="text-sm text-neutral-500 italic">Cargando…</div>
      ) : alerts.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-neutral-200 bg-white p-10 text-center">
          <Sparkles size={22} className="mx-auto text-neutral-300 mb-2" />
          <div className="text-sm text-neutral-500">
            {includeSeen ? "No hay alertas en este momento." : "Ninguna alerta sin ver. Todo tranquilo."}
          </div>
        </div>
      ) : (
        <ul className="space-y-2">
          {alerts.map((a) => (
            <li key={a.id}>
              <AlertRow alert={a} onAct={act} busy={busyId === a.id} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function AlertRow({ alert, onAct, busy }: { alert: Alert; onAct: (id: string, action: "seen" | "dismiss") => void; busy: boolean }) {
  const seen = !!alert.seenAt;
  const style = severityStyle(alert.severity);
  const kindMeta = KIND_META[alert.kind];
  const created = new Date(alert.createdAt);
  const ago = timeAgo(created);
  const patientHref = `/fisio/paciente/${alert.patient.id}`;

  return (
    <div
      className={`rounded-xl border p-3 flex items-start gap-3 transition-colors ${seen ? "opacity-70" : ""}`}
      style={{ background: style.bg, borderColor: style.border }}
    >
      <div className="flex-shrink-0 mt-0.5" style={{ color: style.ink }}>
        {style.icon}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <Link href={patientHref} className="font-semibold text-sm hover:underline" style={{ color: style.ink }}>
            {alert.patient.fullName}
          </Link>
          {alert.patient.programType && (
            <span className="text-[10px] px-1.5 py-0.5 rounded font-semibold uppercase tracking-wider" style={{ background: "rgba(0,0,0,0.06)", color: style.ink }}>
              {alert.patient.programType}
            </span>
          )}
          <span className="text-[11px] flex items-center gap-1" style={{ color: style.ink, opacity: 0.7 }}>
            {kindMeta.icon} {kindMeta.label}
          </span>
          <span className="text-[11px]" style={{ color: style.ink, opacity: 0.6 }}>
            · {ago}
          </span>
          {alert.patient.assignedProfessional && (
            <span className="text-[11px] flex items-center gap-1" style={{ color: style.ink, opacity: 0.6 }}>
              <User size={11} /> {alert.patient.assignedProfessional.name}
            </span>
          )}
        </div>
        <p className="text-sm mt-1 whitespace-pre-wrap" style={{ color: style.ink }}>
          {alert.summary}
        </p>
        {alert.triggerData && <TriggerDetails raw={alert.triggerData} kind={alert.kind} />}
      </div>
      <div className="flex flex-col gap-1 flex-shrink-0">
        {!seen && (
          <button
            onClick={() => onAct(alert.id, "seen")}
            disabled={busy}
            className="text-[11px] font-medium px-2.5 py-1 rounded-lg border border-neutral-300 bg-white hover:bg-neutral-50 flex items-center gap-1 disabled:opacity-50"
            title="Marcar como vista"
          >
            <Check size={12} /> Vista
          </button>
        )}
        <button
          onClick={() => onAct(alert.id, "dismiss")}
          disabled={busy}
          className="text-[11px] font-medium px-2.5 py-1 rounded-lg border border-neutral-300 bg-white hover:bg-neutral-50 flex items-center gap-1 disabled:opacity-50"
          title="Archivar"
        >
          <X size={12} /> Archivar
        </button>
      </div>
    </div>
  );
}

function TriggerDetails({ raw, kind }: { raw: string; kind: Alert["kind"] }) {
  const [expanded, setExpanded] = useState(false);
  let data: any = null;
  try { data = JSON.parse(raw); } catch { return null; }
  if (!data) return null;

  if (kind === "notes_ai") {
    const note = typeof data.note === "string" ? data.note : "";
    const topics: string[] = Array.isArray(data.topics) ? data.topics : [];
    return (
      <div className="mt-2">
        {topics.length > 0 && (
          <div className="flex flex-wrap gap-1 mb-1.5">
            {topics.map((t) => (
              <span key={t} className="text-[10px] px-1.5 py-0.5 rounded font-medium bg-white/70 text-neutral-700">
                {t}
              </span>
            ))}
          </div>
        )}
        {note && (
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="text-[11px] text-neutral-600 underline decoration-dotted"
          >
            {expanded ? "Ocultar nota original" : "Ver nota original del paciente"}
          </button>
        )}
        {expanded && note && (
          <div className="mt-1.5 rounded-lg bg-white/80 border border-neutral-200 p-2 text-xs whitespace-pre-wrap text-neutral-700">
            {note}
          </div>
        )}
      </div>
    );
  }

  // metric_deviation (Fase A.2) — pintamos un mini resumen de la magnitud.
  return (
    <div className="mt-1 text-[11px] text-neutral-600">
      {JSON.stringify(data)}
    </div>
  );
}

function severityStyle(sev: Alert["severity"]) {
  if (sev === "high") {
    return {
      bg: "#FEF2F2",
      border: "#FCA5A5",
      ink: "#7F1D1D",
      icon: <AlertTriangle size={18} />,
    };
  }
  if (sev === "warn") {
    return {
      bg: "#FFFBEB",
      border: "#FCD34D",
      ink: "#78350F",
      icon: <AlertCircle size={18} />,
    };
  }
  return {
    bg: "#F0F9FF",
    border: "#93C5FD",
    ink: "#0C4A6E",
    icon: <Info size={18} />,
  };
}

const KIND_META: Record<Alert["kind"], { label: string; icon: React.ReactNode }> = {
  notes_ai: { label: "Sensacion", icon: <Sparkles size={11} /> },
  metric_deviation: { label: "Metrica", icon: <TrendingUp size={11} /> },
};

function timeAgo(d: Date): string {
  const s = Math.round((Date.now() - d.getTime()) / 1000);
  if (s < 60) return "ahora";
  const m = Math.round(s / 60);
  if (m < 60) return `hace ${m} min`;
  const h = Math.round(m / 60);
  if (h < 48) return `hace ${h} h`;
  const days = Math.round(h / 24);
  return `hace ${days} d`;
}
