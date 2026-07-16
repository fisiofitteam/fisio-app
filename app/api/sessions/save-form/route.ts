/**
 * Permite al paciente guardar la respuesta de un FORM AUNQUE la sesión ya
 * esté completada. Cubre el caso "marqué la sesión como completada sin
 * rellenar el formulario y ahora no puedo editarla" — el banner del home
 * seguía avisando pero el runner era readonly.
 *
 * NO cambia completedAt ni toca las respuestas de otros tasks — solo hace
 * merge en `responses[taskId]`. Si la sesión estaba sin completar aún,
 * también funciona (ideal para flujos futuros).
 *
 * POST body: { sessionId, taskId, response }
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(req: NextRequest) {
  const { sessionId, taskId, response } = await req.json().catch(() => ({}));
  if (!sessionId || !taskId) {
    return NextResponse.json({ error: "sessionId y taskId requeridos" }, { status: 400 });
  }

  const session = await prisma.programSession.findUnique({
    where: { id: sessionId },
    select: { id: true, responses: true },
  });
  if (!session) return NextResponse.json({ error: "Sesión no encontrada" }, { status: 404 });

  let responses: Record<string, any> = {};
  if (session.responses) {
    try { responses = JSON.parse(session.responses) || {}; } catch { responses = {}; }
  }
  responses[taskId] = response ?? {};

  await prisma.programSession.update({
    where: { id: sessionId },
    data: { responses: JSON.stringify(responses) },
  });

  return NextResponse.json({ ok: true });
}
