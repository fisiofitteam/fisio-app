import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getActiveProfessional } from "@/lib/session";

// PUT /api/business-metrics/inputs — upsert de datos manuales de un mes.
// body: { year, month, newFollowers?, adsSpend?, totalFollowers? }
export async function PUT(req: NextRequest) {
  const user = await getActiveProfessional();
  if (!user || user.role !== "ceo") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const b = await req.json().catch(() => ({}));
  const year = Number(b?.year);
  const month = Number(b?.month);
  if (!Number.isInteger(year) || !Number.isInteger(month) || month < 0 || month > 11) {
    return NextResponse.json({ error: "year/month no válidos" }, { status: 400 });
  }
  const num = (v: unknown) => (v === "" || v == null || isNaN(Number(v)) ? null : Number(v));
  const data: any = {};
  if ("newFollowers" in b) data.newFollowers = num(b.newFollowers);
  if ("adsSpend" in b) data.adsSpend = num(b.adsSpend);
  if ("totalFollowers" in b) data.totalFollowers = num(b.totalFollowers);

  const saved = await prisma.businessMonthlyInput.upsert({
    where: { year_month: { year, month } },
    create: { year, month, ...data },
    update: data,
  });
  return NextResponse.json(saved);
}
