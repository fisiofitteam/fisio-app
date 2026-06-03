/**
 * POST /api/leads/[id]/reschedule-link
 *
 * Genera (o reutiliza) el token de re-agenda de un lead y devuelve la URL
 * pública para que el equipo comercial se la mande al lead por WhatsApp/email.
 *
 * Permisos: CEO, closer y setter — los mismos que ven y editan leads.
 *
 * Política del token:
 *  - Una vez generado, se reutiliza para siempre (no rota). Si el lead lo
 *    pierde, el equipo simplemente vuelve a pulsar el botón y se reusa.
 *  - Solo se permite generar enlace para leads en estado "scheduled" (es decir,
 *    aún tienen llamada por delante). Para won/lost/cancelled/no_show no tiene
 *    sentido — devolvemos 400 con un mensaje claro.
 */
import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { getActiveProfessional } from "@/lib/session";

function makeToken(): string {
  // 24 bytes → 32 chars en base64url, suficiente entropía y URL-safe.
  return randomBytes(24).toString("base64url");
}

export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getActiveProfessional();
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (!["ceo", "closer", "setter"].includes(user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const lead = await prisma.lead.findUnique({
    where: { id: params.id },
    select: { id: true, status: true, rescheduleToken: true },
  });
  if (!lead) return NextResponse.json({ error: "Lead no encontrado" }, { status: 404 });

  if (lead.status !== "scheduled") {
    return NextResponse.json(
      { error: "Solo se puede re-agendar un lead con llamada agendada (no en won/lost/cancelled/no_show)." },
      { status: 400 }
    );
  }

  let token = lead.rescheduleToken;
  if (!token) {
    token = makeToken();
    await prisma.lead.update({
      where: { id: lead.id },
      data: { rescheduleToken: token, rescheduleTokenAt: new Date() },
    });
  }

  // Construimos URL absoluta. Si NEXT_PUBLIC_APP_URL no está, caemos al host
  // del request (vale en dev y en serverless). En prod siempre debería estar.
  const origin =
    process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ||
    _req.headers.get("origin") ||
    `https://${_req.headers.get("host") || "localhost:3000"}`;
  const url = `${origin}/agenda/reagendar/${token}`;

  return NextResponse.json({ ok: true, url, token });
}
