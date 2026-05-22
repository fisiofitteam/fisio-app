/**
 * GET /api/cron/generate-call-reminders
 *
 * Cron diario (configurar a las 09:00 hora Madrid).
 * Para cada lead con callScheduledAt en el día SIGUIENTE y aún no recordatorio
 * marcado como enviado, crea una notificación in-app al closer asignado.
 *
 * Vercel cron: añadir entrada en vercel.json con schedule "0 8 * * *" (08:00 UTC = 09:00 Madrid invierno).
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { notifyProfessional } from "@/lib/notifications";

export async function GET(req: NextRequest) {
  // Cálculo del rango "mañana 00:00 → mañana 23:59"
  const now = new Date();
  const tomorrowStart = new Date(now);
  tomorrowStart.setDate(tomorrowStart.getDate() + 1);
  tomorrowStart.setHours(0, 0, 0, 0);
  const tomorrowEnd = new Date(tomorrowStart);
  tomorrowEnd.setHours(23, 59, 59, 999);

  // Leads con cita mañana, status scheduled, sin recordatorio aún
  const leads = await prisma.lead.findMany({
    where: {
      status: "scheduled",
      callScheduledAt: { gte: tomorrowStart, lte: tomorrowEnd },
      reminderSentAt: null,
      closerId: { not: null },
    },
  });

  let generated = 0;
  for (const l of leads) {
    if (!l.closerId) continue;
    const dateLabel = l.callScheduledAt.toLocaleDateString("es-ES", {
      weekday: "short",
      day: "numeric",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    });
    await notifyProfessional({
      professionalId: l.closerId,
      type: "call_reminder",
      title: `Recordatorio · llamada con ${l.fullName} mañana`,
      body: `Llamada el ${dateLabel}. Envíale por WhatsApp el recordatorio + vídeo pre-llamada.`,
      leadId: l.id,
      actionUrl: "/fisio/llamadas-venta",
    });
    generated++;
  }

  return NextResponse.json({ ok: true, generated });
}

export async function POST(req: NextRequest) {
  return GET(req);
}
