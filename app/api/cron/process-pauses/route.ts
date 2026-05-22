/**
 * Endpoint diseñado para ejecutarse desde un cron job diario.
 *
 * Se encarga de:
 *  1. Marcar como "active" las pausas "scheduled" cuyo startDate ya llegó
 *  2. Marcar como "ended" las pausas "active" cuyo endDate ya pasó
 *  3. Para las pausas que se acaban hoy, enviar email al paciente "vuelves a tu programa"
 *
 * IMPORTANTE: en producción debe protegerse con un secreto en header `x-cron-secret`
 * que coincida con la env CRON_SECRET. Si la env no existe, asumimos llamada local
 * de desarrollo y se permite.
 *
 * Configuración futura en Vercel:
 *   vercel.json → "crons": [{ "path": "/api/cron/process-pauses", "schedule": "0 7 * * *" }]
 *   Y env CRON_SECRET en Vercel + header x-cron-secret en la llamada.
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sendEmail } from "@/lib/email";

export async function POST(req: NextRequest) {
  // Protección con secreto si está configurado
  const expected = process.env.CRON_SECRET;
  if (expected) {
    const got = req.headers.get("x-cron-secret");
    if (got !== expected) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // 1) Activar pausas que empiezan hoy o antes
  const toActivate = await prisma.programPause.findMany({
    where: { status: "scheduled", startDate: { lte: today } },
  });
  for (const p of toActivate) {
    // Solo cambiar status. La extensión y el shift de sesiones ya se
    // aplicaron al crear la pausa (POST /api/program-pauses).
    await prisma.programPause.update({
      where: { id: p.id },
      data: { status: "active" },
    });
  }

  // 2) Cerrar pausas activas cuyo endDate ya pasó
  const toEnd = await prisma.programPause.findMany({
    where: { status: "active", endDate: { lte: today } },
    include: { patient: true },
  });
  const emailsSent: string[] = [];
  for (const p of toEnd) {
    await prisma.programPause.update({
      where: { id: p.id },
      data: { status: "ended" },
    });
    // Email "vuelves a tu programa" si tiene email y no se envió aún
    if (!p.reminderSent && p.patient.email) {
      try {
        await sendEmail({
          to: p.patient.email,
          subject: "¡Bienvenido de vuelta a tu programa!",
          html: `
            <div style="font-family: -apple-system, sans-serif; max-width: 480px; margin: 0 auto; padding: 24px;">
              <h2 style="font-weight: 600; letter-spacing: -0.02em;">¡Bienvenido de vuelta, ${p.patient.fullName.split(" ")[0]}!</h2>
              <p style="color: #525252; line-height: 1.5;">
                Tu programa se reanuda hoy. Entra a la app y continúa tu progreso.
              </p>
              <p style="margin-top: 24px;">
                <a href="${process.env.NEXT_PUBLIC_BASE_URL || ""}/paciente/login" style="display: inline-block; background: #0A0A0A; color: #FAFAFA; text-decoration: none; padding: 11px 18px; border-radius: 10px; font-weight: 500;">
                  Entrar a la app →
                </a>
              </p>
              <p style="color: #737373; font-size: 12px; margin-top: 32px;">
                Si tienes cualquier duda, habla con tu coach.
              </p>
            </div>
          `,
        });
        await prisma.programPause.update({
          where: { id: p.id },
          data: { reminderSent: true },
        });
        emailsSent.push(p.patient.email);
      } catch (e) {
        console.error("Email vuelta-pausa falló para", p.patient.email, e);
      }
    }
  }

  return NextResponse.json({
    ok: true,
    activated: toActivate.length,
    ended: toEnd.length,
    emailsSent: emailsSent.length,
  });
}

// Permitir también GET (algunos cron services como Vercel solo usan GET)
export async function GET(req: NextRequest) {
  return POST(req);
}
