import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getActiveProfessional } from "@/lib/session";
import { WeeklyTeamTasksBoard } from "@/components/WeeklyTeamTasksBoard";
import { CeoTeamTasksAudit } from "@/components/CeoTeamTasksAudit";
import { AdHocTasksManager } from "@/components/AdHocTasksManager";
import { buildWeeklyBoardForProfessional, DAY_NAMES } from "@/lib/weekly-team-tasks";
import { weekStartDate } from "@/lib/program-pauses";

export const dynamic = "force-dynamic";

// /fisio/tareas — CEO + head_success gestionan tareas del equipo.
//   - Tareas semanales: solo CEO crea/edita (board "Fisios" + board "Head Success").
//   - Tareas puntuales (mensual / rango): CEO crea para los dos roles; head_success
//     solo para fisios.
// Otros roles → redirect al panel.
export default async function TasksPage() {
  const user = await getActiveProfessional();
  if (!user) redirect("/login");
  if (user.role !== "ceo" && user.role !== "head_success") redirect("/fisio");
  const isCeo = user.role === "ceo";

  // Board "vista equipo" desde la perspectiva del propio CEO. Se usa
  // buildWeeklyBoardForProfessional con un id que nunca tendrá completaciones,
  // pero como CEO usaremos mode="ceo" → ignora completed=false del propio
  // CEO y solo muestra las definiciones.
  const [fisioBoard, headBoard] = await Promise.all([
    buildWeeklyBoardForProfessional(user.id, "fisio"),
    buildWeeklyBoardForProfessional(user.id, "head_success"),
  ]);

  // Auditoría: para la semana actual y la anterior, qué profesionales no han
  // marcado qué. Sólo CEO ve esto.
  const monday = weekStartDate(new Date());
  const prevMonday = new Date(monday);
  prevMonday.setUTCDate(prevMonday.getUTCDate() - 7);

  const adHocOrderBy = [
    { active: "desc" as const },
    { kind: "asc" as const },
    { startDate: "asc" as const },
    { dayOfMonth: "asc" as const },
    { createdAt: "asc" as const },
  ];

  const [allTasks, professionals, allCompletions, adHocFisio, adHocHead, adHocSetter, adHocCloser] = await Promise.all([
    prisma.weeklyTeamTask.findMany({
      where: { active: true, targetRole: { in: ["fisio", "head_success"] } },
      orderBy: [{ targetRole: "asc" }, { dayOfWeek: "asc" }, { order: "asc" }],
    }),
    prisma.professional.findMany({
      where: { role: { in: ["fisio", "head_success", "setter", "closer"] }, active: true },
      orderBy: [{ role: "asc" }, { fullName: "asc" }],
      select: { id: true, fullName: true, role: true },
    }),
    prisma.weeklyTeamTaskCompletion.findMany({
      where: { weekStartDate: { in: [monday, prevMonday] } },
      select: { taskId: true, professionalId: true, weekStartDate: true },
    }),
    prisma.teamTaskAdHoc.findMany({ where: { targetRole: "fisio" }, orderBy: adHocOrderBy }),
    prisma.teamTaskAdHoc.findMany({ where: { targetRole: "head_success" }, orderBy: adHocOrderBy }),
    prisma.teamTaskAdHoc.findMany({ where: { targetRole: "setter" }, orderBy: adHocOrderBy }),
    prisma.teamTaskAdHoc.findMany({ where: { targetRole: "closer" }, orderBy: adHocOrderBy }),
  ]);

  // Pickers de asignados por rol.
  const fisioPros = professionals
    .filter((p) => p.role === "fisio" || p.role === "head_success")
    .map((p) => ({ id: p.id, fullName: p.role === "head_success" ? `${p.fullName} ⭐` : p.fullName }));
  const headPros = professionals.filter((p) => p.role === "head_success").map((p) => ({ id: p.id, fullName: p.fullName }));
  const setterPros = professionals.filter((p) => p.role === "setter").map((p) => ({ id: p.id, fullName: p.fullName }));
  const closerPros = professionals.filter((p) => p.role === "closer").map((p) => ({ id: p.id, fullName: p.fullName }));

  function parseAssigneesJson(json: string | null | undefined): string[] {
    if (!json) return [];
    try { const a = JSON.parse(json); return Array.isArray(a) ? a.filter((x) => typeof x === "string") : []; }
    catch { return []; }
  }

  const serializeAdHoc = (arr: typeof adHocFisio) =>
    arr.map((t) => ({
      id: t.id,
      title: t.title,
      description: t.description ?? null,
      targetRole: t.targetRole,
      kind: t.kind as "monthly" | "monthly_weekday" | "range",
      dayOfMonth: t.dayOfMonth,
      nthWeek: t.nthWeek,
      dayOfWeek: t.dayOfWeek,
      startDate: t.startDate?.toISOString() ?? null,
      endDate: t.endDate?.toISOString() ?? null,
      assigneeIds: parseAssigneesJson(t.assigneesJson),
      active: t.active,
    }));

  // Para cada profesional × semana, qué tareas NO ha marcado.
  type AuditEntry = {
    professionalId: string;
    professionalName: string;
    role: string;
    weekStartIso: string;
    weekLabel: string;
    missingByDay: Array<{ dayOfWeek: number; dayLabel: string; tasks: string[] }>;
    missingTotal: number;
  };

  // Día actual en Madrid (1=L..5=V, 6=S, 7=D). Para la semana actual solo
  // contamos como "no marcadas" las tareas de días ya pasados; para la
  // semana anterior cuentan los 5 días enteros.
  const todayDow = (() => {
    const fmt = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Madrid", weekday: "short" });
    const wk = fmt.format(new Date());
    const map: Record<string, number> = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 };
    return map[wk] || 1;
  })();

  const audit: AuditEntry[] = [];
  for (const pro of professionals) {
    for (const wk of [monday, prevMonday]) {
      const isCurrentWeek = wk.getTime() === monday.getTime();
      const taskOfRole = allTasks.filter((t) => t.targetRole === pro.role);
      const doneSet = new Set(
        allCompletions
          .filter((c) => c.professionalId === pro.id && c.weekStartDate.getTime() === wk.getTime())
          .map((c) => c.taskId),
      );
      // Si es la semana actual, solo cuentan los días que YA pasaron
      // (dayOfWeek < hoy). El día de hoy no marca como "incumplida" todavía.
      const missing = taskOfRole.filter(
        (t) => !doneSet.has(t.id) && (!isCurrentWeek || t.dayOfWeek < todayDow),
      );
      const byDay = new Map<number, string[]>();
      for (const t of missing) {
        const arr = byDay.get(t.dayOfWeek) ?? [];
        arr.push(t.title);
        byDay.set(t.dayOfWeek, arr);
      }
      const missingByDay = [...byDay.entries()]
        .sort(([a], [b]) => a - b)
        .map(([dow, tasks]) => ({ dayOfWeek: dow, dayLabel: DAY_NAMES[dow], tasks }));
      audit.push({
        professionalId: pro.id,
        professionalName: pro.fullName,
        role: pro.role,
        weekStartIso: wk.toISOString(),
        weekLabel: wk.getTime() === monday.getTime() ? "Esta semana" : "Semana anterior",
        missingByDay,
        missingTotal: missing.length,
      });
    }
  }

  return (
    <main className="space-y-6">
      <header>
        <h1 className="text-xl font-semibold">Tareas del equipo</h1>
        <p className="text-xs text-neutral-500 mt-0.5">
          Edita aquí las tareas semanales que aparecen en el panel de fisios y head_success.
          Cada lunes 00:00 (Madrid) vuelven a salir como pendientes.
        </p>
      </header>

      <section className="space-y-3">
        <h2 className="text-sm font-medium text-neutral-700 px-1">🩺 Fisios</h2>
        {/* Tanto CEO como head_success pueden añadir/quitar tareas semanales
            del board de fisios. */}
        <WeeklyTeamTasksBoard
          board={fisioBoard}
          role="fisio"
          mode="ceo"
          title="Tareas semanales · Fisios"
          subtitle="Añade, edita o quita tareas por día"
        />
        <AdHocTasksManager role="fisio" initialTasks={serializeAdHoc(adHocFisio)} professionals={fisioPros} canCreateThisRole={true} />
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-medium text-neutral-700 px-1">⭐ Head Success</h2>
        {isCeo && (
          <WeeklyTeamTasksBoard
            board={headBoard}
            role="head_success"
            mode="ceo"
            title="Tareas semanales · Head Success"
            subtitle="Añade, edita o quita tareas por día"
          />
        )}
        <AdHocTasksManager role="head_success" initialTasks={serializeAdHoc(adHocHead)} professionals={headPros} canCreateThisRole={isCeo} />
      </section>

      {isCeo && (
        <section className="space-y-3">
          <h2 className="text-sm font-medium text-neutral-700 px-1">💼 Equipo comercial</h2>
          <AdHocTasksManager
            role="setter"
            initialTasks={serializeAdHoc(adHocSetter)}
            professionals={setterPros}
            canCreateThisRole={true}
          />
          <AdHocTasksManager
            role="closer"
            initialTasks={serializeAdHoc(adHocCloser)}
            professionals={closerPros}
            canCreateThisRole={true}
          />
        </section>
      )}

      {isCeo && <CeoTeamTasksAudit audit={audit} />}
    </main>
  );
}
