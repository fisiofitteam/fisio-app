import { NextRequest, NextResponse } from "next/server";
import { getActiveProfessional } from "@/lib/session";
import { computeMonthlySalary } from "@/lib/compensation";

// GET /api/my-salary?year=YYYY&month=0-11 — métricas y salario del propio
// profesional para el mes indicado (por defecto, mes en curso).
export async function GET(req: NextRequest) {
  const user = await getActiveProfessional();
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const now = new Date();
  const year = Number(req.nextUrl.searchParams.get("year")) || now.getUTCFullYear();
  const monthRaw = req.nextUrl.searchParams.get("month");
  const month = monthRaw != null && monthRaw !== "" ? Number(monthRaw) : now.getUTCMonth();

  const salary = await computeMonthlySalary(user.id, year, month);
  return NextResponse.json(JSON.parse(JSON.stringify(salary)));
}
