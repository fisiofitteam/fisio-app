import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getActiveProfessional } from "@/lib/session";
import { generateSummaryForLead } from "@/lib/call-summaries";

/**
 * POST /api/leads/[id]/regenerate-summary
 *
 * Fuerza la generación del resumen IA del lead (llamada de anamnesis /
 * venta) para cuando el cron no lo ha hecho, ha fallado, o el fisio
 * quiere refrescarlo tras editar el meetingUrl.
 *
 * Accesible a CEO / head_success / closer / setter / fisio asignado al
 * paciente derivado del lead — el rol de "solo su fisio" es demasiado
 * estricto (head coach y closers también lo consultan).
 */
export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getActiveProfessional();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const lead = await prisma.lead.findUnique({
    where: { id: params.id },
    select: {
      id: true,
      meetingUrl: true,
      convertedPatient: { select: { assignedProfessionalId: true } },
    },
  });
  if (!lead) return NextResponse.json({ error: "Lead no encontrado" }, { status: 404 });

  const isManager = user.role === "ceo" || user.role === "head_success";
  const isSalesRole = user.role === "closer" || user.role === "setter";
  const isAssignedFisio = lead.convertedPatient?.assignedProfessionalId === user.id;
  if (!isManager && !isSalesRole && !isAssignedFisio) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  if (!lead.meetingUrl) {
    return NextResponse.json(
      { error: "El lead no tiene meetingUrl. Añádelo antes de regenerar el resumen." },
      { status: 400 },
    );
  }

  const result = await generateSummaryForLead(lead.id, { force: true });
  if (!result.ok) {
    // reason típico: no_meeting_url | no_google_conn | no_transcript | error
    return NextResponse.json(
      { ok: false, reason: result.reason, detail: (result as any).detail ?? null },
      { status: result.reason === "error" ? 500 : 200 },
    );
  }
  return NextResponse.json({ ok: true, callSummaryId: result.callSummaryId });
}
