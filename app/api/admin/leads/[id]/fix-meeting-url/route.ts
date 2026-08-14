/**
 * POST/GET /api/admin/leads/[id]/fix-meeting-url?url=…
 *
 * Cambia el meetingUrl de un Lead y regenera su CallSummary. Útil cuando
 * el paciente agendó dos veces y el Meet real tuvo lugar en el otro link;
 * el Sale/Lead que quedó ganado apunta al Meet vacío y el generador ha
 * marcado el CallSummary como noTranscript.
 *
 * Solo CEO.
 *
 * Efectos:
 *   1) Actualiza Lead.meetingUrl.
 *   2) Resetea el CallSummary (borra noTranscript, errorMessage, salesSummary…)
 *      para que el generador vuelva a intentar con el nuevo URL.
 *   3) Ejecuta generateSummaryForLead con force=true al vuelo. La respuesta
 *      incluye el resultado (ok/error/no_transcript).
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getActiveProfessional } from "@/lib/session";
import { generateSummaryForLead } from "@/lib/call-summaries";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
// Meet API + Claude Sonnet: ventana amplia para no chocar con Vercel 504 que
// devolvería HTML en lugar de JSON y el cliente no sabría interpretarlo.
export const maxDuration = 300;

async function handler(req: NextRequest, { params }: { params: { id: string } }) {
  // Un try/catch global garantiza que SIEMPRE devolvemos JSON. Sin esto,
  // cualquier excepción (Meet API 500, Claude timeout, etc.) hacía que Next
  // sirviera HTML de error y el frontend lo interpretaba como "not valid JSON".
  try {
    const user = await getActiveProfessional();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (user.role !== "ceo") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const url = new URL(req.url);
    const newMeetingUrl = url.searchParams.get("url") ?? (await req.json().catch(() => ({})))?.url ?? "";
    if (!newMeetingUrl || !newMeetingUrl.includes("meet.google.com")) {
      return NextResponse.json(
        { error: "Falta ?url= con un link válido de meet.google.com" },
        { status: 400 },
      );
    }

    const lead = await prisma.lead.findUnique({
      where: { id: params.id },
      select: { id: true, fullName: true, meetingUrl: true },
    });
    if (!lead) return NextResponse.json({ error: "Lead no encontrado" }, { status: 404 });

    await prisma.lead.update({
      where: { id: lead.id },
      data: { meetingUrl: newMeetingUrl },
    });

    // Reseteamos el summary por si estaba como noTranscript: así generate lo
    // reintenta contra el nuevo URL en lugar de saltarlo.
    await prisma.callSummary.updateMany({
      where: { leadId: lead.id },
      data: {
        noTranscript: false,
        errorMessage: null,
        salesSummary: null,
        salesKeyPoints: null,
        clinicalSummary: null,
        clinicalKeyPoints: null,
        coachingSummary: null,
        coachingKeyPoints: null,
      },
    });

    let result;
    try {
      result = await generateSummaryForLead(lead.id, { force: true });
    } catch (err: any) {
      result = { ok: false, reason: "error" as const, detail: err?.message ?? String(err) };
    }

    return NextResponse.json({
      ok: true,
      leadId: lead.id,
      fullName: lead.fullName,
      previousMeetingUrl: lead.meetingUrl,
      newMeetingUrl,
      regenerated: result,
    });
  } catch (err: any) {
    console.error("[fix-meeting-url] fallo global", err);
    return NextResponse.json(
      { error: err?.message ?? String(err) },
      { status: 500 },
    );
  }
}

export { handler as GET, handler as POST };
