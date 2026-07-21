/**
 * GET   /api/metric-alerts/patient/[id] → devuelve
 *   { config, override: boolean } — config es la efectiva (override||plantilla).
 *
 * PUT   /api/metric-alerts/patient/[id]
 *   body: { config }  → guarda override en Patient.metricAlertConfig.
 *
 * DELETE /api/metric-alerts/patient/[id] → limpia el override (vuelve
 *   a heredar de la plantilla global).
 */
import { NextRequest, NextResponse } from "next/server";
import { getActiveProfessional } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import {
  getEffectiveConfig,
  hasOverride,
  setPatientOverride,
  normalizeConfig,
} from "@/lib/metric-alerts";

export const dynamic = "force-dynamic";

function canManage(role: string): boolean {
  return role === "fisio" || role === "head_success" || role === "ceo";
}

async function assertAccess(user: any, patientId: string) {
  if (!user || !canManage(user.role)) return false;
  if (user.role !== "fisio") return true; // manager ve todos
  const p = await prisma.patient.findUnique({
    where: { id: patientId },
    select: { assignedProfessionalId: true },
  });
  return p?.assignedProfessionalId === user.id;
}

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getActiveProfessional();
  if (!(await assertAccess(user, params.id))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const [config, override] = await Promise.all([
    getEffectiveConfig(params.id),
    hasOverride(params.id),
  ]);
  return NextResponse.json({ config, override });
}

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getActiveProfessional();
  if (!(await assertAccess(user, params.id))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const body = await req.json().catch(() => ({}));
  const normalized = normalizeConfig(body?.config);
  await setPatientOverride(params.id, normalized);
  return NextResponse.json({ config: normalized, override: true });
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getActiveProfessional();
  if (!(await assertAccess(user, params.id))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  await setPatientOverride(params.id, null);
  const config = await getEffectiveConfig(params.id);
  return NextResponse.json({ config, override: false });
}
