"use client";

import { useMemo, useState } from "react";
import Link from "next/link";

type Athlete = {
  id: string;
  fullName: string;
  photoUrl: string | null;
  sport: string;
  phone: string | null;
  fisio: { id: string; fullName: string } | null;
  rpeAvg: number | null;
  fatigueAvg: number | null;
  entries7d: number;
  lastEntryAt: string | null;
};

type SortKey = "name" | "fatigue" | "rpe" | "entries";

/**
 * Lista de atletas ADVANCE con foco en su estado interno (RPE / fatiga media
 * 7 días) en vez de datos de suscripción/cumplimiento.
 */
export function AdvanceAthletesList({ athletes }: { athletes: Athlete[] }) {
  const [sortKey, setSortKey] = useState<SortKey>("name");

  const sorted = useMemo(() => {
    const copy = [...athletes];
    copy.sort((a, b) => {
      if (sortKey === "name") return a.fullName.localeCompare(b.fullName);
      if (sortKey === "fatigue") {
        // Los que no han logueado se van al final
        if (a.fatigueAvg == null && b.fatigueAvg == null) return 0;
        if (a.fatigueAvg == null) return 1;
        if (b.fatigueAvg == null) return -1;
        return b.fatigueAvg - a.fatigueAvg;
      }
      if (sortKey === "rpe") {
        if (a.rpeAvg == null && b.rpeAvg == null) return 0;
        if (a.rpeAvg == null) return 1;
        if (b.rpeAvg == null) return -1;
        return b.rpeAvg - a.rpeAvg;
      }
      // entries desc, luego alfabético como tiebreaker
      if (b.entries7d !== a.entries7d) return b.entries7d - a.entries7d;
      return a.fullName.localeCompare(b.fullName);
    });
    return copy;
  }, [athletes, sortKey]);

  const activeLoggers = athletes.filter((a) => a.entries7d > 0).length;

  return (
    <section className="space-y-4">
      <header>
        <h2 className="text-base font-semibold">🏋 Atletas ADVANCE</h2>
        <p className="text-xs text-neutral-500 mt-0.5">
          RPE y fatiga media de los últimos 7 días. {athletes.length} atletas rolling · {activeLoggers} han logueado esta semana.
        </p>
      </header>

      {/* Sort */}
      <div className="flex gap-1 overflow-x-auto pb-1">
        <SortChip active={sortKey === "name"} onClick={() => setSortKey("name")}>A-Z</SortChip>
        <SortChip active={sortKey === "fatigue"} onClick={() => setSortKey("fatigue")}>🪫 Fatiga ↓</SortChip>
        <SortChip active={sortKey === "rpe"} onClick={() => setSortKey("rpe")}>🔥 RPE ↓</SortChip>
        <SortChip active={sortKey === "entries"} onClick={() => setSortKey("entries")}>Logs 7d ↓</SortChip>
      </div>

      {athletes.length === 0 ? (
        <section className="card">
          <p className="text-sm text-neutral-400 text-center py-12 italic">
            No hay atletas ADVANCE rolling asignados.
          </p>
        </section>
      ) : (
        <section className="card">
          <div className="divide-y divide-neutral-100">
            {sorted.map((a) => (
              <AthleteRow key={a.id} athlete={a} />
            ))}
          </div>
        </section>
      )}
    </section>
  );
}

function AthleteRow({ athlete }: { athlete: Athlete }) {
  const initials = athlete.fullName
    .split(" ")
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();

  const noLogs = athlete.entries7d === 0;
  const [waBusy, setWaBusy] = useState(false);
  const [waError, setWaError] = useState<string | null>(null);

  async function openWhatsApp(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (!athlete.phone) {
      setWaError("Sin WhatsApp en la ficha");
      setTimeout(() => setWaError(null), 3000);
      return;
    }
    setWaBusy(true);
    setWaError(null);
    try {
      const res = await fetch(`/api/patients/${athlete.id}/whatsapp-link`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) {
        setWaError(data.error || "No se pudo generar el link");
        setTimeout(() => setWaError(null), 3000);
        return;
      }
      const cleanPhone = data.phone.replace(/\D/g, "");
      window.open(
        `https://wa.me/${cleanPhone}?text=${encodeURIComponent(data.waText)}`,
        "_blank",
        "noopener,noreferrer",
      );
    } catch (e: any) {
      setWaError(e?.message || "Error de red");
      setTimeout(() => setWaError(null), 3000);
    } finally {
      setWaBusy(false);
    }
  }

  return (
    <Link
      href={`/fisio/paciente/${athlete.id}`}
      className="flex items-center gap-3 py-3 px-2 -mx-2 hover:bg-neutral-50 rounded transition-colors"
    >
      {/* Avatar */}
      <div className="shrink-0 w-10 h-10 rounded-full bg-neutral-100 flex items-center justify-center text-xs font-semibold text-neutral-500 overflow-hidden">
        {athlete.photoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={athlete.photoUrl} alt={athlete.fullName} className="w-full h-full object-cover" />
        ) : (
          <span>{initials}</span>
        )}
      </div>

      {/* Nombre + fisio */}
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium truncate">{athlete.fullName}</div>
        <div className="text-[11px] text-neutral-500 truncate">
          {athlete.fisio ? `🩺 ${athlete.fisio.fullName}` : "Sin fisio asignado"}
        </div>
        {waError && (
          <div className="text-[10px] text-red-600 mt-0.5">✗ {waError}</div>
        )}
      </div>

      {/* Métricas */}
      <div className="flex items-center gap-2 shrink-0">
        <Metric label="Fatiga" emoji="🪫" value={athlete.fatigueAvg} scale="fatigue" />
        <Metric label="RPE" emoji="🔥" value={athlete.rpeAvg} scale="rpe" />
        <div className="text-center px-2">
          <div className={`text-sm font-semibold tabular-nums ${noLogs ? "text-neutral-300" : "text-neutral-700"}`}>
            {athlete.entries7d}/7
          </div>
          <div className="text-[9px] text-neutral-400 uppercase tracking-wider">logs</div>
        </div>
        {/* Botón WhatsApp con magic link */}
        <button
          onClick={openWhatsApp}
          disabled={waBusy || !athlete.phone}
          title={athlete.phone ? "Abrir WhatsApp con el magic link" : "Sin WhatsApp en la ficha"}
          className="text-[11px] font-medium px-2.5 py-1.5 rounded-md border border-emerald-200 text-emerald-800 bg-emerald-50 hover:bg-emerald-100 hover:border-emerald-300 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {waBusy ? "…" : "💬 WA"}
        </button>
      </div>
    </Link>
  );
}

function Metric({
  label,
  emoji,
  value,
  scale,
}: {
  label: string;
  emoji: string;
  value: number | null;
  scale: "fatigue" | "rpe";
}) {
  const color = value == null ? "#9CA3AF" : scale === "fatigue" ? fatigueColor(value) : rpeColor(value);
  return (
    <div className="text-center min-w-[52px]">
      <div
        className="text-sm font-semibold tabular-nums"
        style={{ color: value == null ? "#D1D5DB" : color }}
        title={label}
      >
        {value == null ? "—" : value.toFixed(1)}
      </div>
      <div className="text-[9px] text-neutral-400 uppercase tracking-wider">
        <span aria-hidden>{emoji}</span> {label}
      </div>
    </div>
  );
}

function SortChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-colors ${
        active
          ? "bg-neutral-900 text-white"
          : "bg-white border border-neutral-200 text-neutral-600 hover:bg-neutral-50"
      }`}
    >
      {children}
    </button>
  );
}

// Escala de fatiga: bajo = verde, alto = rojo. 0-10.
function fatigueColor(v: number): string {
  if (v <= 3) return "#16A34A"; // verde
  if (v <= 5) return "#CA8A04"; // ámbar
  if (v <= 7) return "#EA580C"; // naranja
  return "#DC2626"; // rojo
}

// Escala de RPE: bajo = azul (poca carga), medio = verde (dosis buena),
// alto = ámbar/rojo (mucho estrés). 0-10.
function rpeColor(v: number): string {
  if (v <= 3) return "#2563EB"; // azul (por debajo del umbral útil)
  if (v <= 6) return "#16A34A"; // verde (dosis óptima)
  if (v <= 8) return "#CA8A04"; // ámbar
  return "#DC2626"; // rojo (sobrecarga)
}
