import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getActiveProfessional } from "@/lib/session";
import { getCompensation } from "@/lib/compensation";

// GET /api/compensation?professionalId=xxx — condiciones de un profesional. Solo CEO.
export async function GET(req: NextRequest) {
  const user = await getActiveProfessional();
  if (!user || user.role !== "ceo") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const professionalId = req.nextUrl.searchParams.get("professionalId");
  if (!professionalId) return NextResponse.json({ error: "professionalId requerido" }, { status: 400 });
  return NextResponse.json(await getCompensation(professionalId));
}

// PUT /api/compensation — guarda las condiciones. Solo CEO.
// body: { professionalId, baseSalary, perActivePatient, renewalCommissionPct, renewalScope, newSaleCommissionPct, newSaleScope, notes }
export async function PUT(req: NextRequest) {
  const user = await getActiveProfessional();
  if (!user || user.role !== "ceo") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const b = await req.json().catch(() => ({}));
  const professionalId = String(b?.professionalId || "");
  if (!professionalId) return NextResponse.json({ error: "professionalId requerido" }, { status: 400 });

  const pro = await prisma.professional.findUnique({ where: { id: professionalId }, select: { id: true } });
  if (!pro) return NextResponse.json({ error: "Profesional no encontrado" }, { status: 404 });

  const num = (v: unknown) => {
    const n = Number(v);
    return Number.isFinite(n) && n >= 0 ? n : 0;
  };
  const scope = (v: unknown) => (v === "all" ? "all" : "own");

  const data = {
    baseSalary: num(b.baseSalary),
    perActivePatient: num(b.perActivePatient),
    renewalCommissionPct: num(b.renewalCommissionPct),
    renewalScope: scope(b.renewalScope),
    newSaleCommissionPct: num(b.newSaleCommissionPct),
    newSaleScope: scope(b.newSaleScope),
    notes: typeof b.notes === "string" && b.notes.trim() ? b.notes.trim() : null,
    updatedById: user.id,
  };

  await prisma.compensation.upsert({
    where: { professionalId },
    create: { professionalId, ...data },
    update: data,
  });

  return NextResponse.json({ ok: true, ...(await getCompensation(professionalId)) });
}
