/**
 * /api/patient-rolling-overrides
 *
 * GET     ?patientId=X → lista de overrides de ese paciente.
 * POST    { patientId, taskId, hidden?, title?, bodyText?, videoId? }
 *           Upsert por (patientId, taskId). null en un campo = usa el original.
 * DELETE  ?patientId=X&taskId=Y   → borra el override (vuelve al original).
 *
 * Auth: cualquier profesional autenticado (ceo, head_success, fisio,
 * setter/closer no aplica). El fisio del paciente puede modificar sus
 * propios pacientes; managers pueden todos.
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getActiveProfessional } from "@/lib/session";

export const runtime = "nodejs";

function canManage(role: string): boolean {
  return role === "ceo" || role === "head_success" || role === "fisio";
}

export async function GET(req: NextRequest) {
  const user = await getActiveProfessional();
  if (!user || !canManage(user.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const patientId = req.nextUrl.searchParams.get("patientId");
  if (!patientId) return NextResponse.json({ error: "patientId requerido" }, { status: 400 });

  const list = await (prisma as any).patientRollingTaskOverride.findMany({ where: { patientId } });
  return NextResponse.json({ ok: true, overrides: list });
}

export async function POST(req: NextRequest) {
  const user = await getActiveProfessional();
  if (!user || !canManage(user.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const b = await req.json().catch(() => ({}));
  const patientId = typeof b?.patientId === "string" ? b.patientId : "";
  const taskId = typeof b?.taskId === "string" ? b.taskId : "";
  if (!patientId || !taskId) return NextResponse.json({ error: "patientId y taskId requeridos" }, { status: 400 });

  const data = {
    hidden: !!b?.hidden,
    title: typeof b?.title === "string" && b.title.trim() ? b.title.trim() : null,
    bodyText: typeof b?.bodyText === "string" && b.bodyText.trim() ? b.bodyText.trim() : null,
    videoId: typeof b?.videoId === "string" && b.videoId ? b.videoId : null,
    createdById: user.id,
  };

  const saved = await (prisma as any).patientRollingTaskOverride.upsert({
    where: { patientId_taskId: { patientId, taskId } },
    create: { patientId, taskId, ...data },
    update: data,
  });
  return NextResponse.json({ ok: true, override: saved });
}

export async function DELETE(req: NextRequest) {
  const user = await getActiveProfessional();
  if (!user || !canManage(user.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const patientId = req.nextUrl.searchParams.get("patientId");
  const taskId = req.nextUrl.searchParams.get("taskId");
  if (!patientId || !taskId) return NextResponse.json({ error: "params requeridos" }, { status: 400 });

  await (prisma as any).patientRollingTaskOverride
    .delete({ where: { patientId_taskId: { patientId, taskId } } })
    .catch(() => {});
  return NextResponse.json({ ok: true });
}
