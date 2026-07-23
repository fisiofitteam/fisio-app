import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { PatientNav } from "@/components/PatientNav";
import { PatientDailyLogToggle } from "@/components/PatientDailyLogToggle";
import { PatientDailyLogBackfill } from "@/components/PatientDailyLogBackfill";
import { PatientDailyLogHistoryList } from "@/components/PatientDailyLogHistoryList";
import { PatientMetricChart } from "@/components/PatientMetricChart";
import { todayForPatient } from "@/lib/patient-dates";

export const dynamic = "force-dynamic";

export default async function PatientMetricsPage({ params }: { params: { id: string } }) {
  const patient = await prisma.patient.findUnique({
    where: { id: params.id },
    select: { id: true, programType: true, timezone: true },
  });
  if (!patient) notFound();

  const isPrevention = patient.programType === "PREVENTION";
  const navVariant = isPrevention ? "prevention" : "advance";

  const today = todayForPatient(patient.timezone);

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

  // Días recientes (últimos 7) sin registro: banner de backfill. Excluimos
  // hoy porque para hoy ya está el propio toggle "Registrar métricas".
  const registeredSet = new Set(entries30.map((e) => e.recordedDate.toISOString().slice(0, 10)));
  const missingDays: Array<{ iso: string; label: string }> = [];
  for (let i = 1; i <= 7; i++) {
    const d = new Date(today);
    d.setUTCDate(today.getUTCDate() - i);
    const iso = d.toISOString().slice(0, 10);
    if (registeredSet.has(iso)) continue;
    // Etiqueta amigable: "Ayer" / "Hace N días · miércoles 12 may".
    const label = i === 1
      ? "Ayer"
      : `Hace ${i} días · ${d.toLocaleDateString("es-ES", { weekday: "long", day: "numeric", month: "short" })}`;
    missingDays.push({ iso, label });
  }

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

        {/* Explicación específica para Prevention: no hay fisio 1:1, así que
            el paciente debe entender para qué le sirven las métricas y cómo
            usarlas de forma autónoma para prevenir lesiones. */}
        {isPrevention && (
          <div
            className="rounded-2xl p-4 mb-5 text-xs leading-relaxed"
            style={{
              background: "var(--p-amber-bg)",
              border: "1px solid var(--p-amber-border)",
              color: "var(--p-amber-text)",
            }}
          >
            <div className="font-semibold mb-1">🛡 Para qué sirve este panel</div>
            <p style={{ color: "var(--p-text-dim)" }}>
              Aunque nuestro equipo no te está ayudando con tu programación,
              este apartado puede servirte para que veas qué tendencia sigue
              tu fatiga, sensación de esfuerzo en el entrenamiento y sueño y
              puedas ajustar tu entrenamiento para no pasarte y prevenir
              lesiones.
            </p>
          </div>
        )}

        {/* Banner de backfill — solo si hay días pendientes en los últimos 7. */}
        <PatientDailyLogBackfill missing={missingDays} />

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
              Ver histórico ({entriesAll.length} registros) · toca un día de las últimas 2 semanas para corregirlo
            </summary>
            <PatientDailyLogHistoryList
              entries={entriesAll.map((e) => ({
                id: e.id,
                recordedDate: e.recordedDate.toISOString(),
                fatigue: e.fatigue,
                rpe: e.rpe,
                sleep: e.sleep,
              }))}
            />
          </details>
        )}
      </div>

      <PatientNav patientId={patient.id} active="metricas" variant={navVariant} />
    </main>
  );
}
