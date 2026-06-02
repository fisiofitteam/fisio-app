import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { PatientNav } from "@/components/PatientNav";

const DAY_NAMES = ["", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"];

const TYPE_ICONS: Record<string, string> = {
  WORKOUT: "🏋️",
  VIDEO: "🎥",
  FORM: "📝",
  EVOLUTION: "📊",
};

export default async function PatientWeekPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams: { view?: string };
}) {
  const patient = await prisma.patient.findUnique({ where: { id: params.id } });
  if (!patient) notFound();

  const view = searchParams.view === "prev" ? "prev" : "current";

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Calcular el LUNES de la semana actual
  // getDay() devuelve 0 para domingo, 1-6 lun-sáb
  const dow = today.getDay() === 0 ? 7 : today.getDay();
  const mondayThisWeek = new Date(today);
  mondayThisWeek.setDate(today.getDate() - (dow - 1));

  // A partir del VIERNES (dow >= 5), si estamos en la vista actual, también
  // adelantamos la semana siguiente para que puedan preparar el fin de semana
  // y la semana que viene.
  const showNextWeek = view === "current" && dow >= 5;

  // Rango según vista: SIEMPRE lunes 00:00 → domingo 23:59
  let rangeStart: Date, rangeEnd: Date;
  if (view === "prev") {
    // Lunes-domingo de la semana pasada
    rangeStart = new Date(mondayThisWeek);
    rangeStart.setDate(mondayThisWeek.getDate() - 7);
    rangeEnd = new Date(mondayThisWeek);
    rangeEnd.setDate(mondayThisWeek.getDate() - 1);
  } else {
    // Lunes-domingo de la semana actual (+ siguiente si dow >= viernes)
    rangeStart = new Date(mondayThisWeek);
    rangeEnd = new Date(mondayThisWeek);
    rangeEnd.setDate(mondayThisWeek.getDate() + (showNextWeek ? 13 : 6));
  }

  const rangeEndExclusive = new Date(rangeEnd);
  rangeEndExclusive.setDate(rangeEnd.getDate() + 1);

  const sessions = await prisma.programSession.findMany({
    where: {
      assignment: { patientId: patient.id, isActive: true },
      scheduledDate: { gte: rangeStart, lt: rangeEndExclusive },
    },
    orderBy: { scheduledDate: "asc" },
  });

  const sessionsByDay: Record<string, typeof sessions> = {};
  for (const s of sessions) {
    const key = s.scheduledDate.toISOString().split("T")[0];
    if (!sessionsByDay[key]) sessionsByDay[key] = [];
    sessionsByDay[key].push(s);
  }

  // Días de la semana ACTUAL (o anterior si view=prev)
  const days: { date: Date; key: string; sessions: typeof sessions }[] = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(rangeStart);
    d.setDate(rangeStart.getDate() + i);
    const key = d.toISOString().split("T")[0];
    days.push({ date: d, key, sessions: sessionsByDay[key] ?? [] });
  }

  // Días de la PRÓXIMA semana (solo si dow >= viernes en vista actual)
  const nextDays: { date: Date; key: string; sessions: typeof sessions }[] = [];
  if (showNextWeek) {
    for (let i = 7; i < 14; i++) {
      const d = new Date(rangeStart);
      d.setDate(rangeStart.getDate() + i);
      const key = d.toISOString().split("T")[0];
      nextDays.push({ date: d, key, sessions: sessionsByDay[key] ?? [] });
    }
  }

  return (
    <main className="max-w-md mx-auto px-4 py-6 pb-24">
      <header className="mb-4">
        <Link href={`/paciente/${patient.id}`} className="text-xs text-neutral-500">← Hoy</Link>
        <h1 className="text-xl font-semibold mt-1">Mi semana</h1>
        <p className="text-xs text-neutral-500">
          {view === "prev"
            ? "Semana anterior · lunes a domingo"
            : showNextWeek
            ? "Esta semana + próxima"
            : "Esta semana · lunes a domingo"}
        </p>
      </header>

      {/* Selector de semana */}
      <div className="flex bg-neutral-100 rounded-lg p-0.5 mb-4">
        <Link
          href={`/paciente/${patient.id}/semana?view=prev`}
          className={`flex-1 px-3 py-1.5 text-xs rounded-md text-center transition-colors ${
            view === "prev" ? "bg-white shadow-sm font-medium" : "text-neutral-600"
          }`}
        >
          ← Semana anterior
        </Link>
        <Link
          href={`/paciente/${patient.id}/semana`}
          className={`flex-1 px-3 py-1.5 text-xs rounded-md text-center transition-colors ${
            view === "current" ? "bg-white shadow-sm font-medium" : "text-neutral-600"
          }`}
        >
          Esta semana
        </Link>
      </div>

      {view === "prev" && (
        <p className="text-[11px] text-neutral-500 italic mb-3 text-center">
          Si te perdiste alguna sesión, aquí puedes revisarla.
        </p>
      )}

      <div className="space-y-3">
        {days.map((d) => <DayCard key={d.key} patientId={patient.id} day={d} />)}
      </div>

      {nextDays.length > 0 && (
        <>
          <div className="mt-6 mb-3 flex items-center gap-2">
            <div className="h-px flex-1 bg-neutral-200" />
            <span className="text-[10px] uppercase tracking-wider font-bold text-neutral-500">
              Próxima semana
            </span>
            <div className="h-px flex-1 bg-neutral-200" />
          </div>
          <p className="text-[11px] text-neutral-500 italic mb-3 text-center">
            Adelantamos tu siguiente semana para que la vayas viendo venir.
          </p>
          <div className="space-y-3">
            {nextDays.map((d) => <DayCard key={d.key} patientId={patient.id} day={d} />)}
          </div>
        </>
      )}

      <PatientNav patientId={patient.id} active="semana" />
    </main>
  );
}

function DayCard({
  patientId,
  day,
}: {
  patientId: string;
  day: { date: Date; key: string; sessions: { id: string; completedAt: Date | null; tasksSnapshot: string }[] };
}) {
  const { date, sessions: daySessions } = day;
  const dow = date.getDay() === 0 ? 7 : date.getDay();
  const isToday = date.toDateString() === new Date().toDateString();
  return (
    <div className={`card ${isToday ? "border-neutral-900" : ""}`}>
      <div className="flex justify-between items-baseline mb-2">
        <div className="font-medium text-sm">
          {DAY_NAMES[dow]}
          {isToday && <span className="text-xs text-neutral-500 ml-1">· hoy</span>}
        </div>
        <div className="text-xs text-neutral-500">
          {date.toLocaleDateString("es-ES", { day: "numeric", month: "short" })}
        </div>
      </div>

      {daySessions.length === 0 ? (
        <p className="text-xs text-neutral-400 italic">Día de descanso</p>
      ) : (
        <div className="space-y-2">
          {daySessions.map((s) => {
            const tasks = JSON.parse(s.tasksSnapshot) as any[];
            return (
              <Link
                key={s.id}
                href={`/paciente/${patientId}/sesion/${s.id}`}
                className="block p-3 bg-neutral-50 rounded-lg hover:bg-neutral-100"
              >
                <div className="flex justify-between items-start">
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium">
                      {tasks.length} tarea{tasks.length !== 1 && "s"}
                    </div>
                    <div className="text-xs text-neutral-500 mt-0.5 flex gap-1 flex-wrap">
                      {tasks.slice(0, 4).map((t, i) => (
                        <span key={i}>{TYPE_ICONS[t.type] ?? "•"} {t.title}</span>
                      ))}
                    </div>
                  </div>
                  {s.completedAt ? <span className="pill-ok">✓</span> : <span className="text-neutral-300">→</span>}
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
