/**
 * PATCH  /api/admin/patient-banners/[id] — edita un banner.
 * DELETE /api/admin/patient-banners/[id] — borra un banner.
 * GET    /api/admin/patient-banners/[id] — devuelve el banner + detalle de
 *   pacientes que lo han descartado y los elegibles que aún no lo hicieron.
 *
 * Solo CEO / head_success.
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getActiveProfessional } from "@/lib/session";
import { activePatientCondition } from "@/lib/patient-active";

const VALID_VARIANTS = ["info", "warning", "success"] as const;
const VALID_PROGRAMS = ["RECUPERA", "CONSOLIDA", "ADVANCE", "PREVENTION"] as const;

async function requireManager() {
  const user = await getActiveProfessional();
  if (!user) return { error: "Unauthorized" as const, status: 401 };
  if (user.role !== "ceo" && user.role !== "head_success") return { error: "Forbidden" as const, status: 403 };
  return { user };
}

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const g = await requireManager();
  if ("error" in g) return NextResponse.json({ error: g.error }, { status: g.status });
  const banner = await (prisma as any).patientBanner.findUnique({
    where: { id: params.id },
    include: {
      dismissals: {
        include: { patient: { select: { id: true, fullName: true, programType: true } } },
        orderBy: { dismissedAt: "desc" },
      },
    },
  });
  if (!banner) return NextResponse.json({ error: "No encontrado" }, { status: 404 });

  // Pacientes elegibles: activos, isTest=false, con programType en el target
  // (si el target está vacío, todos los programas).
  let programs: string[] = [];
  try { programs = JSON.parse(banner.targetProgramTypes) || []; } catch {}
  const eligibleWhere: any = {
    isTest: false,
    ...activePatientCondition(),
  };
  if (programs.length > 0) eligibleWhere.programType = { in: programs };
  const eligible = await prisma.patient.findMany({
    where: eligibleWhere,
    select: { id: true, fullName: true, programType: true },
    orderBy: { fullName: "asc" },
  });
  const dismissedIds = new Set(banner.dismissals.map((d: any) => d.patientId));
  const pending = eligible.filter((p) => !dismissedIds.has(p.id));

  return NextResponse.json({
    banner,
    stats: {
      eligible: eligible.length,
      dismissed: banner.dismissals.length,
      pending: pending.length,
    },
    dismissedPatients: banner.dismissals.map((d: any) => ({
      patientId: d.patientId,
      fullName: d.patient?.fullName ?? "?",
      programType: d.patient?.programType ?? null,
      dismissedAt: d.dismissedAt,
    })),
    pendingPatients: pending,
  });
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const g = await requireManager();
  if ("error" in g) return NextResponse.json({ error: g.error }, { status: g.status });
  const b = await req.json().catch(() => ({}));
  const data: any = {};

  if (typeof b?.title === "string" && b.title.trim()) data.title = b.title.trim();
  if (typeof b?.body === "string" && b.body.trim()) data.body = b.body.trim();
  if (VALID_VARIANTS.includes(b?.variant)) data.variant = b.variant;
  if (Array.isArray(b?.targetProgramTypes)) {
    const clean = b.targetProgramTypes.filter((p: any) => VALID_PROGRAMS.includes(p));
    data.targetProgramTypes = JSON.stringify(clean);
  }
  if (b?.startsAt) {
    const d = new Date(b.startsAt);
    if (!isNaN(d.getTime())) data.startsAt = d;
  }
  if (b?.endsAt) {
    const d = new Date(b.endsAt);
    if (!isNaN(d.getTime())) data.endsAt = d;
  }
  if (typeof b?.dismissible === "boolean") data.dismissible = b.dismissible;

  const banner = await (prisma as any).patientBanner.update({
    where: { id: params.id },
    data,
  });
  return NextResponse.json({ banner });
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const g = await requireManager();
  if ("error" in g) return NextResponse.json({ error: g.error }, { status: g.status });
  await (prisma as any).patientBanner.delete({ where: { id: params.id } });
  return NextResponse.json({ ok: true });
}
