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
import { applyLeaveBonus } from "@/app/api/professional-leaves/route";
import { getActiveProfessional } from "@/lib/session";

export async function POST(req: NextRequest) {
  // Protección: Bearer/x-cron-secret desde Vercel Cron, o ?manual=1 con
  // sesión CEO abierta (útil para disparar desde el navegador).
  const expected = process.env.CRON_SECRET;
  const url = new URL(req.url);
  const isManual = url.searchParams.get("manual") === "1";
  if (isManual) {
    const user = await getActiveProfessional();
    if (!user || user.role !== "ceo") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  } else if (expected) {
    const bearer = req.headers.get("authorization") ?? "";
    const legacy = req.headers.get("x-cron-secret") ?? "";
    const okBearer = bearer === `Bearer ${expected}`;
    const okLegacy = legacy === expected;
    if (!okBearer && !okLegacy) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
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

  // 3) Activar renovaciones "scheduled" cuyo startDate ya llegó
  // (renovaciones anticipadas que ya entran en vigor)
  const renewalsToActivate = await prisma.subscriptionRenewal.findMany({
    where: {
      status: "scheduled",
      startDate: { lte: today },
    },
    orderBy: { startDate: "asc" }, // procesar las más antiguas primero
  });
  for (const r of renewalsToActivate) {
    // Cerrar el periodo activo anterior del mismo paciente
    await prisma.subscriptionRenewal.updateMany({
      where: { patientId: r.patientId, status: "active", id: { not: r.id } },
      data: { status: "finished" },
    });
    // Activar este
    await prisma.subscriptionRenewal.update({
      where: { id: r.id },
      data: { status: "active" },
    });
    // Sincronizar paciente
    if (r.programType && r.startDate) {
      await prisma.patient.update({
        where: { id: r.patientId },
        data: {
          programType: r.programType,
          subscriptionStartDate: r.startDate,
          subscriptionPeriodMonths: r.periodMonths,
        },
      });
    }
  }

  // 4) Procesar vacaciones del equipo: aplicar bonus a las que llegan hoy
  const leavesToApply = await prisma.professionalLeave.findMany({
    where: {
      status: "scheduled",
      startDate: { lte: today },
    },
  });
  let leavesApplied = 0;
  for (const l of leavesToApply) {
    await applyLeaveBonus(l.id);
    leavesApplied++;
  }

  // 5) Limpieza de notificaciones caducadas del home del paciente:
  //    - Las que tienen expiresAt < now (ya se filtran en la query pero las
  //      marcamos como leídas para no revisar cada día).
  //    - Las leave_bonus antiguas sin expiresAt (backfill: creadas antes del
  //      deploy que introdujo expiresAt): si createdAt < now - 7d, damos por
  //      supuesto que la vacación ya acabó y las marcamos leídas.
  const dismissed = await prisma.patientNotification.updateMany({
    where: {
      readAt: null,
      OR: [
        { expiresAt: { lt: today } },
        {
          type: "leave_bonus",
          expiresAt: null,
          createdAt: { lt: new Date(today.getTime() - 7 * 86400000) },
        },
      ],
    },
    data: { readAt: today },
  });

  return NextResponse.json({
    ok: true,
    activated: toActivate.length,
    ended: toEnd.length,
    renewalsActivated: renewalsToActivate.length,
    leavesApplied,
    dismissedNotifications: dismissed.count,
    emailsSent: emailsSent.length,
  });
}

// Permitir también GET (algunos cron services como Vercel solo usan GET)
export async function GET(req: NextRequest) {
  return POST(req);
}
