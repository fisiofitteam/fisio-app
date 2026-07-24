/**
 * PATCH /api/patients/[id]/test-mode
 *   body: { isTest: boolean }
 *   Marca / desmarca al paciente como fantasma (test). Solo CEO.
 *
 * Un paciente con isTest=true queda fuera de: KPIs del panel, ventas,
 * alertas del buzón, resumenes semanales (individual + card global
 * ADVANCE), cron de llamadas de optimizacion/renovacion, metricas de
 * team/prevention. Sigue visible en el listado /fisio/pacientes con
 * badge distintivo.
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getActiveProfessional } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getActiveProfessional();
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (user.role !== "ceo") return NextResponse.json({ error: "Solo CEO" }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const isTest = !!body?.isTest;

  const updated = await (prisma.patient as any).update({
    where: { id: params.id },
    data: { isTest },
    select: { id: true, isTest: true, fullName: true },
  });
  return NextResponse.json({ ok: true, patient: updated });
}
