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
  const scopeParam = sp.get("scope");
  const scope: "mine" | "all" =
    scopeParam === "all" ? "all"
    : scopeParam === "mine" ? "mine"
    : isManager ? "all" : "mine";

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

  const where: any = { weekStartDate: monday };
  if (patientId) where.patientId = patientId;
  if (!includeDismissed) where.dismissedAt = null;
  if (scope === "mine") where.patient = { assignedProfessionalId: user.id };

  // Modo contador: solo pintar el badge de la sidebar sin traer todos los
  // datos. Filtra por scope+dismissed igual que la lista.
  if (sp.get("count") === "1") {
    const count = await (prisma as any).patientWeeklyReport.count({ where });
    return NextResponse.json({ week: monday.toISOString(), count });
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
