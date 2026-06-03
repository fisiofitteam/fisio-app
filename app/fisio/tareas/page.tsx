import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getActiveProfessional } from "@/lib/session";
import { WeeklyTeamTasksBoard } from "@/components/WeeklyTeamTasksBoard";
import { CeoTeamTasksAudit } from "@/components/CeoTeamTasksAudit";
import { buildWeeklyBoardForProfessional, DAY_NAMES } from "@/lib/weekly-team-tasks";
import { weekStartDate } from "@/lib/program-pauses";

export const dynamic = "force-dynamic";

// /fisio/tareas — CEO gestiona las tareas semanales de fisios y head_success.
// Para los demás roles, redirige al panel principal (donde ya ven su board).
export default async function TasksPage() {
  const user = await getActiveProfessional();
  if (!user) redirect("/login");
  if (user.role !== "ceo") redirect("/fisio");

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

  const [allTasks, professionals, allCompletions] = await Promise.all([
    prisma.weeklyTeamTask.findMany({
      where: { active: true, targetRole: { in: ["fisio", "head_success"] } },
      orderBy: [{ targetRole: "asc" }, { dayOfWeek: "asc" }, { order: "asc" }],
    }),
    prisma.professional.findMany({
      where: { role: { in: ["fisio", "head_success"] }, active: true },
      orderBy: [{ role: "asc" }, { fullName: "asc" }],
      select: { id: true, fullName: true, role: true },
    }),
    prisma.weeklyTeamTaskCompletion.findMany({
      where: { weekStartDate: { in: [monday, prevMonday] } },
      select: { taskId: true, professionalId: true, weekStartDate: true },
    }),
  ]);

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

  const audit: AuditEntry[] = [];
  for (const pro of professionals) {
    for (const wk of [monday, prevMonday]) {
      const taskOfRole = allTasks.filter((t) => t.targetRole === pro.role);
      const doneSet = new Set(
        allCompletions
          .filter((c) => c.professionalId === pro.id && c.weekStartDate.getTime() === wk.getTime())
          .map((c) => c.taskId),
      );
      const missing = taskOfRole.filter((t) => !doneSet.has(t.id));
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

      <section className="space-y-2">
        <h2 className="text-sm font-medium text-neutral-700 px-1">🩺 Fisios</h2>
        <WeeklyTeamTasksBoard
          board={fisioBoard}
          role="fisio"
          mode="ceo"
          title="Tareas semanales · Fisios"
          subtitle="Añade, edita o quita tareas por día"
        />
      </section>

      <section className="space-y-2">
        <h2 className="text-sm font-medium text-neutral-700 px-1">⭐ Head Success</h2>
        <WeeklyTeamTasksBoard
          board={headBoard}
          role="head_success"
          mode="ceo"
          title="Tareas semanales · Head Success"
          subtitle="Añade, edita o quita tareas por día"
        />
      </section>

      <CeoTeamTasksAudit audit={audit} />
    </main>
  );
}
