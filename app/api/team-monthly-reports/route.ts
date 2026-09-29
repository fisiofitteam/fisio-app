/**
 * Reporte mensual del equipo.
 *
 *   GET  /api/team-monthly-reports
 *     - Sin params → devuelve el reporte del mes actual del usuario autenticado
 *       (o null si aún no lo ha enviado).
 *     - ?professionalId=xxx (solo CEO/head_success) → reporte del mes actual
 *       de ese profesional.
 *     - ?monthYear=YYYY-MM (solo CEO/head_success) → todos los reportes de
 *       ese mes con datos del profesional.
 *
 *   POST /api/team-monthly-reports
 *     - Upsert del reporte del mes actual del usuario autenticado. Body:
 *       cualquier subconjunto de los campos definidos en REPORT_FIELDS.
 *       Requiere que los 4 obligatorios (goodThings, patientHelp,
 *       nonRenewalReasons, successCases) estén no vacíos.
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getActiveProfessional } from "@/lib/session";
import { canReadTeamReports, monthKey, REPORT_FIELDS, REPORTING_ROLES, SCALE_FIELDS, shouldSubmitReport, type ReportFieldKey, type ScaleFieldKey } from "@/lib/team-monthly-reports";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const ALL_FIELDS = REPORT_FIELDS.map((f) => f.key) as ReadonlyArray<ReportFieldKey>;
const REQUIRED_FIELDS = REPORT_FIELDS.filter((f) => f.required).map((f) => f.key) as ReadonlyArray<ReportFieldKey>;
const SCALE_KEYS = SCALE_FIELDS.map((f) => f.key) as ReadonlyArray<ScaleFieldKey>;

export async function GET(req: NextRequest) {
  const user = await getActiveProfessional();
  if (!user) return NextResponse.json({ error: "Login requerido" }, { status: 401 });

  const url = req.nextUrl;
  const paramMonth = url.searchParams.get("monthYear");
  const paramProfessional = url.searchParams.get("professionalId");

  // Vista agregada por mes (CEO / head coach)
  if (paramMonth) {
    if (!canReadTeamReports(user.role)) {
      return NextResponse.json({ error: "Sin permiso" }, { status: 403 });
    }
    const reports = await prisma.teamMonthlyReport.findMany({
      where: { monthYear: paramMonth },
      include: {
        professional: { select: { id: true, fullName: true, role: true, photoUrl: true } },
      },
      orderBy: { submittedAt: "desc" },
    });
    // También devolvemos los profesionales pendientes (para pintar el estado
    // enviado/pendiente en la vista consolidada).
    const allActive = await prisma.professional.findMany({
      where: { active: true, role: { in: [...REPORTING_ROLES] } },
      select: { id: true, fullName: true, role: true, photoUrl: true },
      orderBy: { fullName: "asc" },
    });
    return NextResponse.json({ ok: true, monthYear: paramMonth, reports, allProfessionals: allActive });
  }

  // Reporte de un profesional concreto (CEO/head coach)
  if (paramProfessional) {
    if (!canReadTeamReports(user.role) && paramProfessional !== user.id) {
      return NextResponse.json({ error: "Sin permiso" }, { status: 403 });
    }
    const mk = monthKey();
    const report = await prisma.teamMonthlyReport.findUnique({
      where: { professionalId_monthYear: { professionalId: paramProfessional, monthYear: mk } },
    });
    return NextResponse.json({ ok: true, report, monthYear: mk });
  }

  // Default: mi reporte del mes actual
  const mk = monthKey();
  const report = await prisma.teamMonthlyReport.findUnique({
    where: { professionalId_monthYear: { professionalId: user.id, monthYear: mk } },
  });
  return NextResponse.json({ ok: true, report, monthYear: mk });
}

export async function POST(req: NextRequest) {
  const user = await getActiveProfessional();
  if (!user) return NextResponse.json({ error: "Login requerido" }, { status: 401 });
  if (!shouldSubmitReport(user.role)) {
    return NextResponse.json({ error: "Solo miembros del equipo pueden enviar el reporte" }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  // Sanitizamos: solo aceptamos los campos declarados; caps defensivos.
  const data: Record<string, string | null> = {};
  for (const key of ALL_FIELDS) {
    const raw = body?.[key];
    if (typeof raw !== "string") continue;
    const trimmed = raw.trim().slice(0, 5000);
    data[key] = trimmed.length > 0 ? trimmed : null;
  }
  // Escalas 0-10. Aceptamos number o string numérica; clampeamos al rango.
  // El 0 es un valor válido — "no rellenado" se representa con null.
  const scaleData: Record<string, number | null> = {};
  for (const key of SCALE_KEYS) {
    if (!(key in body)) continue;
    const raw = body[key];
    if (raw === null || raw === "" || raw === undefined) {
      scaleData[key] = null;
      continue;
    }
    const n = Number(raw);
    if (!Number.isFinite(n)) continue;
    const clamped = Math.max(0, Math.min(10, Math.round(n)));
    scaleData[key] = clamped;
  }

  // Chequeo de obligatorios: solo si el cliente marca "enviar definitivamente"
  // — para permitir guardar borradores incompletos. Al enviar (submit: true)
  // todos los required deben estar rellenos, incluidas las 8 escalas.
  const isSubmit = body?.submit === true;
  if (isSubmit) {
    const missingText = REQUIRED_FIELDS.filter((k) => !data[k]);
    // "No rellenada" = null. El 0 SÍ vale como respuesta (fatal absoluto).
    const missingScale = SCALE_KEYS.filter((k) => scaleData[k] === null || scaleData[k] === undefined);
    if (missingText.length > 0 || missingScale.length > 0) {
      return NextResponse.json(
        { ok: false, error: `Faltan campos obligatorios: ${[...missingText, ...missingScale].join(", ")}` },
        { status: 400 },
      );
    }
  }

  const mk = monthKey();
  try {
    // Prisma createMany-like upsert por unique (professionalId, monthYear).
    // Los campos required del schema deben tener default en create; usamos "".
    const createData: Record<string, string | number | null> = {
      professionalId: user.id,
      monthYear: mk,
      goodThings: data.goodThings ?? "",
      badThings: data.badThings ?? null,
      needHelp: data.needHelp ?? null,
      personalMood: data.personalMood ?? null,
      patientHelp: data.patientHelp ?? "",
      callToReview: data.callToReview ?? null,
      callLink: data.callLink ?? null,
      nonRenewalReasons: data.nonRenewalReasons ?? "",
      successCases: data.successCases ?? "",
      programIdeas: data.programIdeas ?? null,
    };
    // Escalas: solo se meten en create si el cliente las mandó, si no
    // quedan como null en la row nueva.
    for (const key of SCALE_KEYS) {
      if (key in scaleData) createData[key] = scaleData[key];
    }
    const updateData: Record<string, string | number | null> = {};
    for (const key of ALL_FIELDS) {
      if (key in data) updateData[key] = data[key];
    }
    for (const key of SCALE_KEYS) {
      if (key in scaleData) updateData[key] = scaleData[key];
    }
    const report = await prisma.teamMonthlyReport.upsert({
      where: { professionalId_monthYear: { professionalId: user.id, monthYear: mk } },
      update: updateData as any,
      create: createData as any,
    });
    return NextResponse.json({ ok: true, report });
  } catch (e: any) {
    const msg = String(e?.message ?? e);
    return NextResponse.json(
      {
        ok: false,
        error: msg,
        hint: /TeamMonthlyReport/i.test(msg) && /does not exist/i.test(msg)
          ? "La tabla no existe. Corre /api/admin/migrate-team-monthly-reports una vez."
          : undefined,
      },
      { status: 500 },
    );
  }
}
