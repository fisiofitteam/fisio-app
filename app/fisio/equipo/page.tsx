import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getActiveProfessional } from "@/lib/auth";
import { EquipoTabs } from "@/components/EquipoTabs";

export default async function EquipoPage({
  searchParams,
}: {
  searchParams: { tab?: string; actPeriod?: string };
}) {
  const user = await getActiveProfessional();
  if (!user) redirect("/login");

  // Tab activa. Por defecto: "calendario" para todos, "miembros" para CEO/Head_success.
  const isManager = user.role === "ceo" || user.role === "head_success";
  // Solo el CEO ve la pestaña "actividad" (head_success no).
  const canSeeActivity = user.role === "ceo";
  const validTabs = canSeeActivity
    ? ["miembros", "calendario", "llamadas", "actividad"]
    : ["miembros", "calendario", "llamadas"];
  const tab = searchParams.tab && validTabs.includes(searchParams.tab)
    ? searchParams.tab
    : (isManager ? "miembros" : "calendario");

  // Lista de miembros (solo necesaria si es manager o si está en cualquier tab)
  const pros = await prisma.professional.findMany({
    orderBy: [{ active: "desc" }, { fullName: "asc" }],
    select: {
      id: true, fullName: true, email: true, role: true, active: true,
      passwordHash: true, passwordResetToken: true, passwordResetExpires: true,
      lastLoginAt: true, workSchedule: true,
    },
  });

  const now = new Date();
  const team = pros.map((p) => ({
    id: p.id,
    fullName: p.fullName,
    email: p.email,
    role: p.role,
    active: p.active,
    hasPassword: !!p.passwordHash,
    pendingInvite: !p.passwordHash && !!p.passwordResetToken && !!p.passwordResetExpires && p.passwordResetExpires > now,
    lastLoginAt: p.lastLoginAt?.toISOString() ?? null,
    workSchedule: p.workSchedule,
  }));

  // Vacaciones próximas y pasadas (3 meses atrás y 6 adelante)
  const horizonStart = new Date();
  horizonStart.setMonth(horizonStart.getMonth() - 3);
  const horizonEnd = new Date();
  horizonEnd.setMonth(horizonEnd.getMonth() + 6);

  const leaves = await prisma.professionalLeave.findMany({
    where: {
      status: { in: ["scheduled", "applied"] },
      endDate: { gte: horizonStart },
      startDate: { lte: horizonEnd },
    },
    include: { professional: { select: { id: true, fullName: true, role: true } } },
    orderBy: { startDate: "asc" },
  });

  // ─── Agregados de actividad (solo managers) ───
  // Todo el calculo va en servidor. Si no tiene permiso, ni siquiera se
  // consultan las tablas — asi no filtramos datos a quien no debe verlos.
  let activityData: null | {
    activity: { id: string; fullName: string; role: string; seconds: number }[];
    period: string;
    periodDays: number;
    daily: { date: string; seconds: number }[];
    personDaily: Record<string, { date: string; seconds: number }[]>;
    personHourly: Record<string, number[]>;
  } = null;

  if (canSeeActivity) {
    // Ejes de tiempo (todo en UTC).
    const now = new Date();
    const todayStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    const dow = (todayStart.getUTCDay() + 6) % 7; // 0 = lunes
    const weekStart = new Date(todayStart.getTime() - dow * 86400000);
    const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));

    const actPeriod = ["hoy", "semana", "mes"].includes(searchParams.actPeriod ?? "")
      ? searchParams.actPeriod!
      : "semana";
    const actStart =
      actPeriod === "hoy" ? todayStart : actPeriod === "mes" ? monthStart : weekStart;

    // Leemos desde el menor inicio para cubrir todas las series con una query.
    const fetchStart = new Date(Math.min(weekStart.getTime(), monthStart.getTime()));

    // Personas de vacaciones hoy — se excluyen del listado.
    const onLeaveIds = new Set(
      (
        await prisma.professionalLeave.findMany({
          where: {
            status: { not: "cancelled" },
            startDate: { lte: now },
            endDate: { gte: todayStart },
          },
          select: { professionalId: true },
        })
      ).map((l) => l.professionalId),
    );

    const activityRows = await (prisma as any).dailyActivity.findMany({
      where: { date: { gte: fetchStart } },
      select: { professionalId: true, date: true, activeSeconds: true },
    });

    const actSec = new Map<string, number>();
    const daySec = new Map<string, number>();
    const personDay = new Map<string, Map<string, number>>();

    for (const a of activityRows as { professionalId: string; date: Date; activeSeconds: number }[]) {
      const t = a.date.getTime();
      if (t >= actStart.getTime()) {
        actSec.set(a.professionalId, (actSec.get(a.professionalId) ?? 0) + a.activeSeconds);
        const key = a.date.toISOString().slice(0, 10);
        daySec.set(key, (daySec.get(key) ?? 0) + a.activeSeconds);
        let pm = personDay.get(a.professionalId);
        if (!pm) { pm = new Map(); personDay.set(a.professionalId, pm); }
        pm.set(key, (pm.get(key) ?? 0) + a.activeSeconds);
      }
    }

    // Serie del equipo por dia — rellenamos huecos con 0.
    const daily: { date: string; seconds: number }[] = [];
    for (let t = actStart.getTime(); t <= todayStart.getTime(); t += 86400000) {
      const key = new Date(t).toISOString().slice(0, 10);
      daily.push({ date: key, seconds: daySec.get(key) ?? 0 });
    }

    const periodDays =
      actPeriod === "hoy"
        ? 1
        : Math.max(1, Math.round((todayStart.getTime() - actStart.getTime()) / 86400000) + 1);

    const activity = pros
      .filter((p) => p.active && !onLeaveIds.has(p.id))
      .map((p) => ({ id: p.id, fullName: p.fullName, role: p.role, seconds: actSec.get(p.id) ?? 0 }));

    const personDaily: Record<string, { date: string; seconds: number }[]> = {};
    for (const p of activity) {
      const pm = personDay.get(p.id);
      const arr: { date: string; seconds: number }[] = [];
      for (let t = actStart.getTime(); t <= todayStart.getTime(); t += 86400000) {
        const key = new Date(t).toISOString().slice(0, 10);
        arr.push({ date: key, seconds: pm?.get(key) ?? 0 });
      }
      personDaily[p.id] = arr;
    }

    // Agregado por hora (24 casillas por persona) para la franja horaria.
    const personHourly: Record<string, number[]> = {};
    if (activity.length > 0) {
      const ids = activity.map((p) => p.id);
      const todayEnd = new Date(todayStart.getTime() + 86399999);
      const hourlyRows = await (prisma as any).hourlyActivity.findMany({
        where: { professionalId: { in: ids }, date: { gte: actStart, lte: todayEnd } },
        select: { professionalId: true, hour: true, activeSeconds: true },
      });
      const hmap = new Map<string, number[]>();
      for (const p of activity) hmap.set(p.id, new Array(24).fill(0));
      for (const h of hourlyRows as { professionalId: string; hour: number; activeSeconds: number }[]) {
        const arr = hmap.get(h.professionalId);
        if (arr && h.hour >= 0 && h.hour < 24) arr[h.hour] += h.activeSeconds;
      }
      for (const p of activity) personHourly[p.id] = hmap.get(p.id) ?? new Array(24).fill(0);
    }

    activityData = { activity, period: actPeriod, periodDays, daily, personDaily, personHourly };
  }

  return (
    <main>
      <header className="mb-4">
        <h1 className="text-xl font-semibold">Equipo</h1>
        <p className="text-xs text-neutral-500 mt-0.5">
          {isManager ? "Gestiona el acceso del equipo y las vacaciones" : "Vacaciones y disponibilidad del equipo"}
        </p>
      </header>

      <EquipoTabs
        activeTab={tab}
        isManager={isManager}
        currentUserRole={user.role}
        currentUserId={user.id}
        team={team}
        leaves={leaves.map((l) => ({
          id: l.id,
          professionalId: l.professionalId,
          professionalName: l.professional.fullName,
          professionalRole: l.professional.role,
          startDate: l.startDate.toISOString(),
          endDate: l.endDate.toISOString(),
          status: l.status,
          daysApplied: l.daysApplied,
          affectedPatientsCount: l.affectedPatientsCount,
          notes: l.notes,
        }))}
        activityData={activityData}
      />
    </main>
  );
}
