import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getActiveProfessional } from "@/lib/session";
import { generatePaymentToken } from "@/lib/stripe";

// Días de validez del link de reserva. Es un token público, así que lo
// mantenemos corto: si el paciente no reserva en una semana el fisio
// regenera el link con una nota nueva.
const TOKEN_VALIDITY_DAYS = 7;
const CALL_TYPES = ["optimization", "renewal"] as const;

/**
 * GET /api/patients/[id]/call-link
 *
 * Lista los últimos links de llamada del paciente (pending/scheduled/completed).
 * Se usa para renderizar la card en la ficha (links activos + histórico corto).
 */
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getActiveProfessional();
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const patient = await prisma.patient.findUnique({
    where: { id: params.id },
    select: { assignedProfessionalId: true },
  });

  // Duraciones por defecto configuradas por el fisio asignado — si no hay
  // asignado o no tiene settings, devolvemos 45/45.
  let optimizationDurationMin = 45;
  let renewalDurationMin = 45;
  if (patient?.assignedProfessionalId) {
    const settings = await prisma.professionalCallSettings.findUnique({
      where: { professionalId: patient.assignedProfessionalId },
      select: { optimizationDurationMin: true, renewalDurationMin: true },
    });
    if (settings) {
      optimizationDurationMin = settings.optimizationDurationMin;
      renewalDurationMin = settings.renewalDurationMin;
    }
  }

  const calls = await prisma.patientCall.findMany({
    where: { patientId: params.id },
    orderBy: { createdAt: "desc" },
    take: 10,
    select: {
      id: true,
      type: true,
      status: true,
      bookingToken: true,
      tokenExpiresAt: true,
      scheduledAt: true,
      meetingUrl: true,
      fisioNote: true,
      createdAt: true,
      durationMin: true,
      callSummary: {
        select: {
          id: true,
          clinicalSummary: true,
          clinicalKeyPoints: true,
          coachingSummary: true,
          coachingKeyPoints: true,
          salesSummary: true,
          salesKeyPoints: true,
          outcome: true,
          noTranscript: true,
          errorMessage: true,
          transcriptCharCount: true,
          generatedAt: true,
          updatedAt: true,
        },
      },
    },
  });
  return NextResponse.json({
    calls,
    defaults: { optimizationDurationMin, renewalDurationMin },
  });
}

/**
 * POST /api/patients/[id]/call-link
 *
 * El fisio autenticado genera un link de reserva para uno de sus pacientes.
 * Solo el fisio asignado (o CEO/head_success) puede generarlo — cada llamada
 * queda ligada a la agenda personal del fisio (Google + plantilla horaria),
 * así que carece de sentido que otro fisio abra el link en nombre ajeno.
 *
 * body: { type: "optimization"|"renewal", fisioNote?: string }
 * respuesta: { token, url, expiresAt, callId }
 */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getActiveProfessional();
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const type = String(body?.type ?? "");
  const fisioNote = typeof body?.fisioNote === "string" ? body.fisioNote.trim().slice(0, 2000) : null;
  // Override opcional de duración desde el modal; si no viene o es inválido
  // se cae al default guardado en ProfessionalCallSettings.
  const durationOverride = Number.isFinite(Number(body?.durationMin))
    ? Math.round(Number(body.durationMin))
    : null;
  if (durationOverride !== null && (durationOverride < 5 || durationOverride > 240)) {
    return NextResponse.json({ error: "durationMin debe estar entre 5 y 240" }, { status: 400 });
  }

  if (!CALL_TYPES.includes(type as any)) {
    return NextResponse.json({ error: "type debe ser optimization o renewal" }, { status: 400 });
  }

  const patient = await prisma.patient.findUnique({
    where: { id: params.id },
    select: { id: true, assignedProfessionalId: true, fullName: true },
  });
  if (!patient) return NextResponse.json({ error: "Paciente no encontrado" }, { status: 404 });

  // Solo el fisio asignado — o CEO/head_success — puede generar el link.
  const isManager = user.role === "ceo" || user.role === "head_success";
  if (!isManager && patient.assignedProfessionalId !== user.id) {
    return NextResponse.json(
      { error: "Solo el fisio asignado a este paciente puede generar el link" },
      { status: 403 },
    );
  }

  // El link se genera contra el fisio asignado; si es CEO/head_success
  // generando link para un paciente ajeno, no forzamos reasignar — usamos
  // el fisio asignado como dueño de la agenda. Si no hay asignado, error.
  const professionalId = patient.assignedProfessionalId;
  if (!professionalId) {
    return NextResponse.json(
      { error: "El paciente no tiene fisio asignado. Asigna uno antes de generar el link." },
      { status: 400 },
    );
  }

  // Requisitos mínimos: el fisio debe tener Google conectado y al menos una
  // franja horaria configurada, si no el paciente entrará al link y no verá
  // huecos disponibles.
  const [googleConn, availabilityCount, settings] = await Promise.all([
    prisma.googleCalendarConnection.findUnique({ where: { professionalId }, select: { id: true } }),
    prisma.professionalCallAvailability.count({ where: { professionalId } }),
    prisma.professionalCallSettings.findUnique({
      where: { professionalId },
      select: { optimizationDurationMin: true, renewalDurationMin: true },
    }),
  ]);

  if (!googleConn) {
    return NextResponse.json(
      { error: "El fisio asignado no ha conectado su Google Calendar todavía." },
      { status: 400 },
    );
  }
  if (availabilityCount === 0) {
    return NextResponse.json(
      { error: "El fisio asignado no ha configurado franjas horarias en Mi agenda." },
      { status: 400 },
    );
  }

  const tokenExpiresAt = new Date();
  tokenExpiresAt.setDate(tokenExpiresAt.getDate() + TOKEN_VALIDITY_DAYS);

  const durationMin = durationOverride
    ?? (type === "optimization"
      ? settings?.optimizationDurationMin ?? 45
      : settings?.renewalDurationMin ?? 45);

  const call = await prisma.patientCall.create({
    data: {
      patientId: patient.id,
      professionalId,
      type,
      bookingToken: generatePaymentToken(),
      tokenExpiresAt,
      status: "pending",
      fisioNote,
      durationMin,
    },
    select: { id: true, bookingToken: true, tokenExpiresAt: true },
  });

  return NextResponse.json({
    callId: call.id,
    token: call.bookingToken,
    url: `/agendar-fisio/${call.bookingToken}`,
    expiresAt: call.tokenExpiresAt.toISOString(),
  });
}
