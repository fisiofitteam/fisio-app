import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { PatientNav } from "@/components/PatientNav";
import { PatientDailyLogForm } from "@/components/PatientDailyLogForm";
import { todayMadridUtc } from "@/lib/program-pauses";

export const dynamic = "force-dynamic";

export default async function PatientMetricsPage({ params }: { params: { id: string } }) {
  const patient = await prisma.patient.findUnique({
    where: { id: params.id },
    select: { id: true },
  });
  if (!patient) notFound();

  const today = todayMadridUtc();
  const entries = await prisma.patientDailyLog.findMany({
    where: { patientId: patient.id },
    orderBy: { recordedDate: "desc" },
    take: 30,
  });
  const todayEntry = entries.find((e) => e.recordedDate.getTime() === today.getTime()) ?? null;

  // Para gráfico simple: últimas 14 entradas en orden cronológico
  const last14 = entries.slice(0, 14).reverse();
  const avgFatigue = avg(entries.slice(0, 7).map((e) => e.fatigue));
  const avgRpe = avg(entries.slice(0, 7).map((e) => e.rpe));
  const avgSleep = avg(entries.slice(0, 7).map((e) => e.sleep));

  return (
    <main className="min-h-screen" style={{ color: "var(--p-text)" }}>
      <div className="relative max-w-md mx-auto px-5 py-7 pb-28">
        <header className="mb-5">
          <Link href={`/paciente/${patient.id}`} className="text-xs" style={{ color: "var(--p-text-faint)" }}>← Inicio</Link>
          <h1 className="text-2xl font-bold mt-1" style={{ letterSpacing: "-0.025em" }}>📊 Mis métricas</h1>
          <p className="text-xs mt-1" style={{ color: "var(--p-text-dim)" }}>
            Registra cómo te ha ido tras cada entrenamiento. Te ayuda a ti y a tu coach a ajustar la carga.
          </p>
        </header>

        <section className="mb-5">
          <div className="text-[10px] font-bold tracking-wider uppercase mb-2" style={{ color: "var(--p-text-faint)" }}>
            Hoy
          </div>
          <PatientDailyLogForm
            initial={todayEntry ? { fatigue: todayEntry.fatigue, rpe: todayEntry.rpe, sleep: todayEntry.sleep } : null}
          />
        </section>

        {entries.length > 0 && (
          <section className="mb-5">
            <div className="text-[10px] font-bold tracking-wider uppercase mb-2" style={{ color: "var(--p-text-faint)" }}>
              Últimos 7 días · medias
            </div>
            <div className="grid grid-cols-3 gap-2">
              <Stat label="Fatiga" emoji="🪫" value={avgFatigue} />
              <Stat label="RPE" emoji="🔥" value={avgRpe} />
              <Stat label="Sueño" emoji="😴" value={avgSleep} />
            </div>
          </section>
        )}

        {last14.length >= 2 && (
          <section className="mb-5">
            <div className="text-[10px] font-bold tracking-wider uppercase mb-2" style={{ color: "var(--p-text-faint)" }}>
              Últimas 2 semanas
            </div>
            <Sparkline entries={last14} />
          </section>
        )}

        {entries.length > 0 && (
          <section>
            <div className="text-[10px] font-bold tracking-wider uppercase mb-2" style={{ color: "var(--p-text-faint)" }}>
              Histórico
            </div>
            <ul className="space-y-1">
              {entries.map((e) => (
                <li
                  key={e.id}
                  className="rounded-xl px-3 py-2.5 flex items-center justify-between gap-3 text-sm"
                  style={{ background: "var(--p-surface)", border: "1px solid var(--p-border)" }}
                >
                  <span className="text-xs" style={{ color: "var(--p-text-dim)" }}>
                    {new Date(e.recordedDate).toLocaleDateString("es-ES", { day: "numeric", month: "short", weekday: "short" })}
                  </span>
                  <div className="flex items-center gap-3 tabular-nums">
                    <span title="Fatiga">🪫 {e.fatigue}</span>
                    <span title="RPE">🔥 {e.rpe}</span>
                    <span title="Sueño">😴 {e.sleep}</span>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>

      <PatientNav patientId={patient.id} active="metricas" variant="advance" />
    </main>
  );
}

function avg(xs: number[]): number | null {
  if (xs.length === 0) return null;
  return Math.round((xs.reduce((a, b) => a + b, 0) / xs.length) * 10) / 10;
}

function Stat({ label, emoji, value }: { label: string; emoji: string; value: number | null }) {
  return (
    <div className="rounded-xl px-3 py-2.5" style={{ background: "var(--p-surface)", border: "1px solid var(--p-border)" }}>
      <div className="text-[10px]" style={{ color: "var(--p-text-faint)" }}>{emoji} {label}</div>
      <div className="text-xl font-bold tabular-nums" style={{ color: "var(--p-accent)", letterSpacing: "-0.02em" }}>
        {value === null ? "—" : value}
      </div>
    </div>
  );
}

function Sparkline({ entries }: { entries: { recordedDate: Date; fatigue: number; rpe: number; sleep: number }[] }) {
  const W = 320, H = 80, PAD = 4;
  const n = entries.length;
  const xs = entries.map((_, i) => PAD + (i * (W - PAD * 2)) / Math.max(1, n - 1));
  const ys = (vals: number[]) => vals.map((v) => H - PAD - (v / 10) * (H - PAD * 2));
  const path = (vals: number[]) =>
    ys(vals).map((y, i) => `${i === 0 ? "M" : "L"} ${xs[i].toFixed(1)} ${y.toFixed(1)}`).join(" ");

  return (
    <div className="rounded-xl p-3" style={{ background: "var(--p-surface)", border: "1px solid var(--p-border)" }}>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} preserveAspectRatio="none">
        {/* Líneas guía 0 y 10 */}
        <line x1={0} x2={W} y1={H - PAD} y2={H - PAD} stroke="var(--p-border)" />
        <line x1={0} x2={W} y1={PAD} y2={PAD} stroke="var(--p-border)" />
        <path d={path(entries.map((e) => e.fatigue))} stroke="#A78BFA" strokeWidth={1.5} fill="none" />
        <path d={path(entries.map((e) => e.rpe))} stroke="#F87171" strokeWidth={1.5} fill="none" />
        <path d={path(entries.map((e) => e.sleep))} stroke="#60A5FA" strokeWidth={1.5} fill="none" />
      </svg>
      <div className="flex justify-around text-[10px] mt-1" style={{ color: "var(--p-text-dim)" }}>
        <span><span style={{ color: "#A78BFA" }}>●</span> Fatiga</span>
        <span><span style={{ color: "#F87171" }}>●</span> RPE</span>
        <span><span style={{ color: "#60A5FA" }}>●</span> Sueño</span>
      </div>
    </div>
  );
}
