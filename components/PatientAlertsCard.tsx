"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { AlertTriangle, AlertCircle, Sparkles, TrendingUp, ChevronRight } from "lucide-react";

type Alert = {
  id: string;
  kind: "notes_ai" | "metric_deviation";
  severity: "info" | "warn" | "high";
  summary: string;
  seenAt: string | null;
  createdAt: string;
};

/**
 * Panel compacto de las ultimas alertas del paciente, visible en la ficha
 * (dentro del layout). Solo mostramos warn+ y sin dismiss; para la
 * gestion completa, el fisio va al buzon /fisio/alertas.
 */
export function PatientAlertsCard({ patientId }: { patientId: string }) {
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/alerts?scope=all&patientId=${patientId}&limit=5`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : { alerts: [] }))
      .then((data) => {
        if (cancelled) return;
        setAlerts(data.alerts ?? []);
        setLoaded(true);
      })
      .catch(() => setLoaded(true));
    return () => { cancelled = true; };
  }, [patientId]);

  if (!loaded || alerts.length === 0) return null;

  const highest = alerts.some((a) => a.severity === "high")
    ? "high"
    : alerts.some((a) => a.severity === "warn")
      ? "warn"
      : "info";
  const s = severityStyle(highest as Alert["severity"]);

  return (
    <section
      className="rounded-xl border p-3 mb-4"
      style={{ background: s.bg, borderColor: s.border }}
    >
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2 font-semibold text-sm" style={{ color: s.ink }}>
          <span>{s.icon}</span>
          <span>Alertas recientes ({alerts.length})</span>
        </div>
        <Link
          href="/fisio/alertas"
          className="text-[11px] font-medium flex items-center gap-0.5"
          style={{ color: s.ink }}
        >
          Ir al buzon <ChevronRight size={12} />
        </Link>
      </div>
      <ul className="space-y-1.5">
        {alerts.map((a) => {
          const meta = KIND_META[a.kind];
          const st = severityStyle(a.severity);
          return (
            <li key={a.id} className="flex items-start gap-2 text-xs">
              <span className="flex-shrink-0 mt-0.5" style={{ color: st.ink }}>
                {meta.icon}
              </span>
              <div className="flex-1 min-w-0">
                <span className="font-medium" style={{ color: st.ink }}>{a.summary}</span>
                <span className="text-neutral-500 ml-1">· {timeAgo(new Date(a.createdAt))}</span>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function severityStyle(sev: Alert["severity"]) {
  if (sev === "high") return { bg: "#FEF2F2", border: "#FCA5A5", ink: "#7F1D1D", icon: <AlertTriangle size={16} /> };
  if (sev === "warn") return { bg: "#FFFBEB", border: "#FCD34D", ink: "#78350F", icon: <AlertCircle size={16} /> };
  return { bg: "#F0F9FF", border: "#93C5FD", ink: "#0C4A6E", icon: <AlertCircle size={16} /> };
}

const KIND_META: Record<Alert["kind"], { icon: React.ReactNode }> = {
  notes_ai: { icon: <Sparkles size={12} /> },
  metric_deviation: { icon: <TrendingUp size={12} /> },
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
