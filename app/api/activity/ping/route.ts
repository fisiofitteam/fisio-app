/**
 * POST /api/activity/ping
 *
 * Recibe un latido de actividad del cliente (ActivityHeartbeat) y suma
 * segundos a los contadores diarios y horarios del profesional.
 *
 * Body: { seconds?: number, hour?: number }
 *   - seconds: por defecto 60. Cap en servidor a 120 (anti-abuso).
 *   - hour: 0-23, hora local del navegador. Fallback: hora UTC del servidor.
 *
 * Idempotente por (persona, dia[, hora]) gracias al upsert incremental.
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getActiveProfessional } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const user = await getActiveProfessional();
  if (!user) return NextResponse.json({ ok: false }, { status: 401 });

  const b = await req.json().catch(() => ({}));

  // Anti-abuso: cap 120s/latido. Nadie sube mas de 2 min por ping.
  let seconds = Number(b?.seconds);
  if (!Number.isFinite(seconds) || seconds <= 0) seconds = 60;
  seconds = Math.min(Math.round(seconds), 120);

  const now = new Date();
  let hour = Number(b?.hour);
  if (!Number.isInteger(hour) || hour < 0 || hour > 23) hour = now.getUTCHours();

  // Dia a medianoche UTC — clave de agrupado determinista para todo el equipo.
  const date = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));

  await (prisma as any).dailyActivity.upsert({
    where:  { professionalId_date: { professionalId: user.id, date } },
    create: { professionalId: user.id, date, activeSeconds: seconds },
    update: { activeSeconds: { increment: seconds } },
  });

  await (prisma as any).hourlyActivity.upsert({
    where:  { professionalId_date_hour: { professionalId: user.id, date, hour } },
    create: { professionalId: user.id, date, hour, activeSeconds: seconds },
    update: { activeSeconds: { increment: seconds } },
  });

  return NextResponse.json({ ok: true });
}
