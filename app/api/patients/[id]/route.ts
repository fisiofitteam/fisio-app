/**
 * DELETE /api/patients/[id]
 *
 * Borra un paciente y TODOS sus datos derivados de la BD. Solo CEO.
 *
 * Estrategia de borrado:
 *  - La mayoría de relaciones a Patient tienen onDelete: Cascade en el schema
 *    (sesiones, métricas, WODs, PRs, notificaciones, etc.) → se borran solas
 *    al borrar el Patient.
 *  - Sale.patientId NO tiene onDelete configurado (Restrict por defecto):
 *    las ventas son datos contables que NO queremos borrar. Las "desvinculamos"
 *    poniendo patientId = NULL antes del delete.
 *  - Lead.convertedPatientId tiene onDelete: SetNull (línea 318) → automático.
 *  - Transaction.patientId tiene onDelete: SetNull → automático.
 *
 * Todo en transacción única: si algo falla, rollback total.
 *
 * Body opcional: { confirm: string } — el cliente debe enviar el fullName
 * exacto del paciente como confirmación de seguridad. El endpoint lo
 * verifica antes de tocar nada.
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getActiveProfessional } from "@/lib/session";

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getActiveProfessional();
  if (!user || user.role !== "ceo") {
    return NextResponse.json({ error: "Solo el CEO puede borrar pacientes" }, { status: 403 });
  }

  // Body de confirmación: cliente debe pegar el nombre exacto del paciente.
  // Esto previene borrados accidentales por click en el botón equivocado.
  let confirm = "";
  try {
    const body = await _req.json();
    confirm = String(body?.confirm || "").trim();
  } catch {
    // Sin body es válido: lo permitimos por compat (ej. tests) pero igual
    // exigimos confirmación si el paciente existe — ver abajo.
  }

  const patient = await prisma.patient.findUnique({
    where: { id: params.id },
    select: { id: true, fullName: true, email: true },
  });
  if (!patient) {
    return NextResponse.json({ error: "Paciente no encontrado" }, { status: 404 });
  }

  // Confirmación de seguridad: el nombre tecleado debe coincidir exacto.
  if (!confirm || confirm !== patient.fullName.trim()) {
    return NextResponse.json(
      {
        error: `Para confirmar el borrado, envía { confirm: "${patient.fullName}" } en el body.`,
        expected: patient.fullName,
      },
      { status: 400 }
    );
  }

  // ─── Borrado en transacción ───
  try {
    await prisma.$transaction(async (tx) => {
      // 1) Desvincular Sales del paciente — son datos contables, NO se borran.
      //    El historial de ventas sigue existiendo, solo pierde el link al
      //    paciente (que ya no existe).
      await tx.sale.updateMany({
        where: { patientId: patient.id },
        data: { patientId: null },
      });

      // 2) Borrar el Patient. El resto de tablas con onDelete: Cascade caen
      //    automáticamente (ProgramAssignment, ProgramSession, WodLog,
      //    PatientMetric, MetricEntry, PatientPR, PatientDailyLog,
      //    PatientNotification, ProgramPause, ClinicalSessionCase,
      //    LoginCode, FisioTask, PatientAdaptation, CommunityFeedPost,
      //    CommunityComment, CommunityReaction, CommunityLessonProgress,
      //    MonthlyChallengeResult, ScheduledCall, SubscriptionRenewal,
      //    Session).
      await tx.patient.delete({ where: { id: patient.id } });
    });
  } catch (e: any) {
    console.error("[DELETE patient] error:", e);
    return NextResponse.json(
      { error: "No se pudo borrar el paciente. Revisa los logs.", detail: e?.message },
      { status: 500 }
    );
  }

  return NextResponse.json({
    ok: true,
    deleted: { id: patient.id, fullName: patient.fullName, email: patient.email },
  });
}
