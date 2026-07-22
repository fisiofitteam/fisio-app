/**
 * GET /api/weekly-reports
 *   ?week=YYYY-MM-DD (opcional, default: semana pasada)
 *   ?scope=mine|all  (default: mine para fisio, all para manager)
 *   ?patientId=...   (para el tab wods del paciente)
 *   ?includeDismissed=1
 *
 * Devuelve { reports: [...] } ordenados por fullName asc.
 */
import { NextRequest, NextResponse } from "next/server";
import { getActiveProfessional } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { weekStartUtc } from "@/lib/weekly-reports";

export const dynamic = "force-dynamic";

function canAccess(role: string): boolean {
  return role === "fisio" || role === "head_success" || role === "ceo";
}

export async function GET(req: NextRequest) {
  const user = await getActiveProfessional();
  if (!user || !canAccess(user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const sp = req.nextUrl.searchParams;
  const isManager = user.role === "ceo" || user.role === "head_success";
  // Los fisios normales no ven resumenes de pacientes de otros: aunque
  // manden ?scope=all se ignora. Solo CEO/head_success ven "all".
  const scopeParam = sp.get("scope");
  const scope: "mine" | "all" = !isManager
    ? "mine"
    : scopeParam === "mine"
      ? "mine"
      : "all";

  // Semana solicitada o la anterior a la actual (la que estamos resumiendo).
  const weekParam = sp.get("week");
  let monday: Date;
  if (weekParam && /^\d{4}-\d{2}-\d{2}$/.test(weekParam)) {
    monday = weekStartUtc(new Date(weekParam + "T12:00:00.000Z"));
  } else {
    const currentMonday = weekStartUtc(new Date());
    monday = new Date(currentMonday);
    monday.setUTCDate(monday.getUTCDate() - 7);
  }

  const patientId = sp.get("patientId");
  const includeDismissed = sp.get("includeDismissed") === "1";
  // Cuando el consumidor consulta un paciente concreto (por ejemplo la
  // ficha wods), NO filtramos ADVANCE — se muestran todos sus reports.
  // Solo excluimos ADVANCE en las vistas de feed general (donde los
  // fisios no deben ver individuales y los managers ven el card global).
  const isFeedView = !patientId;

  const where: any = { weekStartDate: monday };
  if (patientId) where.patientId = patientId;
  if (!includeDismissed) where.dismissedAt = null;
  if (scope === "mine") where.patient = { assignedProfessionalId: user.id };
  if (isFeedView) {
    where.patient = { ...(where.patient ?? {}), NOT: { programType: "ADVANCE" } };
  }

  // Modo contador: solo pintar el badge de la sidebar sin traer todos los
  // datos. Filtra por scope+dismissed igual que la lista.
  if (sp.get("count") === "1") {
    const [reportsCount, advanceGlobal] = await Promise.all([
      (prisma as any).patientWeeklyReport.count({ where }),
      // El card global ADVANCE cuenta como 1 para el badge, solo para managers.
      isManager
        ? (prisma as any).advanceWeeklySummary.count({
            where: { weekStartDate: monday, dismissedAt: null },
          })
        : Promise.resolve(0),
    ]);
    return NextResponse.json({ week: monday.toISOString(), count: reportsCount + advanceGlobal });
  }

  const reports = await (prisma as any).patientWeeklyReport.findMany({
    where,
    orderBy: [{ generatedAt: "desc" }],
    include: {
      patient: {
        select: {
          id: true,
          fullName: true,
          programType: true,
          photoUrl: true,
          assignedProfessional: { select: { id: true, fullName: true } },
        },
      },
    },
  });

  return NextResponse.json({ week: monday.toISOString(), reports });
}
