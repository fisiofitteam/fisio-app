import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { PatientNav } from "@/components/PatientNav";
import { PatientDailyLogToggle } from "@/components/PatientDailyLogToggle";
import { PatientMetricChart } from "@/components/PatientMetricChart";
import { todayMadridUtc } from "@/lib/program-pauses";

export const dynamic = "force-dynamic";

export default async function PatientMetricsPage({ params }: { params: { id: string } }) {
  const patient = await prisma.patient.findUnique({
    where: { id: params.id },
    select: { id: true, programType: true },
  });
  if (!patient) notFound();

  const navVariant = patient.programType === "PREVENTION" ? "prevention" : "advance";

  const today = todayMadridUtc();

  // Últimos 30 días para las gráficas
  const start30 = new Date(today);
  start30.setDate(start30.getDate() - 29);
  const entries30 = await prisma.patientDailyLog.findMany({
    where: { patientId: patient.id, recordedDate: { gte: start30 } },
    orderBy: { recordedDate: "asc" },
  });

  // Últimos 30 registros para el histórico plegado
  const entriesAll = await prisma.patientDailyLog.findMany({
    where: { patientId: patient.id },
    orderBy: { recordedDate: "desc" },
    take: 30,
  });
  const todayEntry = entriesAll.find((e) => e.recordedDate.getTime() === today.getTime()) ?? null;

  return (
    <main className="min-h-screen" style={{ color: "var(--p-text)" }}>
      <div className="relative max-w-md mx-auto px-5 py-7 pb-28">
        <header className="mb-5">
          <Link href={`/paciente/${patient.id}`} className="text-xs" style={{ color: "var(--p-text-faint)" }}>← Inicio</Link>
          <h1 className="text-2xl font-bold mt-1" style={{ letterSpacing: "-0.025em" }}>📊 Mis métricas</h1>
          <p className="text-xs mt-1" style={{ color: "var(--p-text-dim)" }}>
            Cómo va tu carga y descanso día a día. Registra desde la sesión o desde aquí.
          </p>
        </header>

        {/* Registro rápido — colapsado por defecto porque normalmente se hace
            desde la propia sesión de entrenamiento */}
        <div className="mb-5">
          <PatientDailyLogToggle
            initial={todayEntry ? { fatigue: todayEntry.fatigue, rpe: todayEntry.rpe, sleep: todayEntry.sleep } : null}
          />
        </div>

        {/* 3 gráficas de 30 días */}
        <div className="text-[10px] font-bold tracking-wider uppercase mb-2" style={{ color: "var(--p-text-faint)" }}>
          Últimos 30 días
        </div>
        <div className="space-y-3">
          <PatientMetricChart
            label="Fatiga"
            emoji="🪫"
            color="#A78BFA"
            entries={entries30.map((e) => ({ date: e.recordedDate, value: e.fatigue }))}
            hint="0 = fresco · 10 = agotado. Ideal mantenerse por debajo de 7."
          />
          <PatientMetricChart
            label="RPE"
            emoji="🔥"
            color="#F87171"
            entries={entries30.map((e) => ({ date: e.recordedDate, value: e.rpe }))}
            hint="0 = suave · 10 = máximo. Alternar días duros y suaves te da la mejor progresión."
          />
          <PatientMetricChart
            label="Sueño"
            emoji="😴"
            color="#60A5FA"
            entries={entries30.map((e) => ({ date: e.recordedDate, value: e.sleep }))}
            hint="0 = mal descanso · 10 = perfecto. Cuando baja varios días seguidos, avisa a tu coach."
          />
        </div>

        {entriesAll.length > 0 && (
          <details className="mt-6 rounded-2xl px-4 py-3" style={{ background: "var(--p-surface)", border: "1px solid var(--p-border)" }}>
            <summary className="cursor-pointer text-xs font-medium" style={{ color: "var(--p-text-dim)" }}>
              Ver histórico ({entriesAll.length} registros)
            </summary>
            <ul className="mt-3 space-y-1">
              {entriesAll.map((e) => (
                <li
                  key={e.id}
                  className="rounded-xl px-3 py-2 flex items-center justify-between gap-3 text-sm"
                  style={{ background: "var(--p-surface-2)", border: "1px solid var(--p-border)" }}
                >
                  <span className="text-xs" style={{ color: "var(--p-text-dim)" }}>
                    {new Date(e.recordedDate).toLocaleDateString("es-ES", { day: "numeric", month: "short", weekday: "short" })}
                  </span>
                  <div className="flex items-center gap-3 tabular-nums text-xs">
                    <span title="Fatiga">🪫 {e.fatigue}</span>
                    <span title="RPE">🔥 {e.rpe}</span>
                    <span title="Sueño">😴 {e.sleep}</span>
                  </div>
                </li>
              ))}
            </ul>
          </details>
        )}
      </div>

      <PatientNav patientId={patient.id} active="metricas" variant={navVariant} />
    </main>
  );
}
