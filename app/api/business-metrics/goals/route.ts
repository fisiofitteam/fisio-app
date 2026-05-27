import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getActiveProfessional } from "@/lib/session";

// PUT /api/business-metrics/goals — upsert (o borra si value vacío) de un
// objetivo trimestral. body: { year, quarter, metricKey, value }
export async function PUT(req: NextRequest) {
  const user = await getActiveProfessional();
  if (!user || user.role !== "ceo") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const b = await req.json().catch(() => ({}));
  const year = Number(b?.year);
  const quarter = Number(b?.quarter);
  const metricKey = typeof b?.metricKey === "string" ? b.metricKey : "";
  if (!Number.isInteger(year) || ![1, 2, 3, 4].includes(quarter) || !metricKey) {
    return NextResponse.json({ error: "Datos no válidos" }, { status: 400 });
  }

  const raw = b?.value;
  if (raw === "" || raw == null || isNaN(Number(raw))) {
    await prisma.businessQuarterlyGoal.deleteMany({ where: { year, quarter, metricKey } });
    return NextResponse.json({ ok: true, deleted: true });
  }
  const saved = await prisma.businessQuarterlyGoal.upsert({
    where: { year_quarter_metricKey: { year, quarter, metricKey } },
    create: { year, quarter, metricKey, value: Number(raw) },
    update: { value: Number(raw) },
  });
  return NextResponse.json(saved);
}
