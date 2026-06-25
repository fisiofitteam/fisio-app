/**
 * Diagnóstico: envía un email de prueba con Resend y devuelve el resultado
 * EXACTO (incluyendo errores). Útil para verificar:
 *  - Que RESEND_API_KEY está bien.
 *  - Que el FROM_EMAIL del dominio está verificado en Resend.
 *  - Que no estás en sandbox de Resend (en sandbox solo envía al email del owner).
 *
 * GET /api/admin/test-email?to=destino@correo.com
 *
 * Solo CEO.
 */
import { NextRequest, NextResponse } from "next/server";
import { getActiveProfessional } from "@/lib/session";
import { sendEmail } from "@/lib/email";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const user = await getActiveProfessional();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (user.role !== "ceo") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const to = req.nextUrl.searchParams.get("to");
  if (!to) return NextResponse.json({ error: "Falta ?to=email" }, { status: 400 });

  const fromEnv = process.env.EMAIL_FROM ?? "(no EMAIL_FROM env)";
  const apiKeyPresent = !!process.env.RESEND_API_KEY;
  const apiKeyPrefix = process.env.RESEND_API_KEY?.slice(0, 6) ?? "—";

  const result: any = await sendEmail({
    to,
    subject: "[FisioFit] Test de envío",
    html: "<p>Este es un email de diagnóstico de FisioFit App. Si lo recibes, Resend funciona.</p>",
    text: "Email de diagnóstico de FisioFit App. Si lo recibes, Resend funciona.",
  });

  return NextResponse.json({
    config: {
      EMAIL_FROM: fromEnv,
      RESEND_API_KEY_present: apiKeyPresent,
      RESEND_API_KEY_prefix: apiKeyPrefix,
    },
    to,
    sendResult: result,
  });
}
