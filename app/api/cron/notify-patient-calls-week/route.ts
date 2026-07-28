/**
 * Cron LUNES por la mañana (07:00 hora Madrid) que avisa por campanita a
 * cada fisio de las ScheduledCall que tiene esta semana (lunes 00:00 →
 * lunes siguiente 00:00, ambos UTC-medianoche). El CEO recibe además un
 * resumen del equipo entero.
 *
 * Sirve como recordatorio semanal de las llamadas de optimización (semana
 * 5 del paciente, avisamos en su semana 4) y de renovación (2 semanas
 * antes de que se acabe el ciclo del paciente). El scheduler diario ya
 * crea el ScheduledCall en el momento correcto; este cron solo empuja el
 * aviso a la campanita el primer día de la semana.
 *
 * Se dispara desde Vercel Cron a las 05:00 UTC y 06:00 UTC de los LUNES
 * (vercel.json). El handler filtra por hora Madrid == 7 antes de correr.
 *
 * Idempotencia por semana: guardamos la marca con la refKey
 * "patient_calls_week:{YYYY-MM-DD del lunes}:{professionalId}" — si ya
 * hay una notificación con esa refKey no volvemos a crearla. Con eso
 * evitamos duplicar si el cron pasa dos veces el mismo lunes (verano+
 * invierno, retry, etc).
 *
 * Protección: Bearer CRON_SECRET. ?test=1 en dev y ?force=1 para saltar
 * la guarda de hora al testear en producción.
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { notifyProfessional } from "@/lib/notifications";
import { getActiveProfessional } from "@/lib/session";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

function getMadridParts(d: Date = new Date()) {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Madrid",
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", weekday: "short", hour12: false,
  });
  const parts = fmt.formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return {
    y: Number(get("year")),
    m: Number(get("month")) - 1,
    d: Number(get("day")),
    hour: Number(get("hour")),
    weekday: get("weekday"), // "Mon", "Tue", ...
  };
}

/** UTC midnight del lunes de la semana en la que estamos ahora en Madrid. */
function mondayMadridUtc(now: Date = new Date()): Date {
  const p = getMadridParts(now);
  const base = new Date(Date.UTC(p.y, p.m, p.d));
  // getUTCDay: 0=Dom, 1=Lun, ... 6=Sab. Restamos hasta caer en lunes.
  const daysBackToMonday = (base.getUTCDay() + 6) % 7;
  base.setUTCDate(base.getUTCDate() - daysBackToMonday);
  return base;
}

function typeLabel(t: string): string {
  if (t === "optimizacion") return "optimización";
  if (t === "renovacion") return "renovación";
  return t;
}

async function handler(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization") ?? "";
  const isTest = req.nextUrl.searchParams.get("test") === "1";
  const isLocal = process.env.NODE_ENV !== "production";
  const isManual = req.nextUrl.searchParams.get("manual") === "1";

  if (isManual) {
    // Disparo manual desde el navegador (CEO/head_success). Cuando el
    // fisio pega la URL en la barra de direcciones no envía Bearer.
    const user = await getActiveProfessional();
    if (!user || (user.role !== "ceo" && user.role !== "head_success")) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  } else if (cronSecret && auth !== `Bearer ${cronSecret}` && !(isTest && isLocal)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // manual=1 implica force=1 (si un humano lo dispara es que quiere
  // saltarse la guarda de día/hora).
  const force = isManual || req.nextUrl.searchParams.get("force") === "1";
  const madrid = getMadridParts();
  if (!force && (madrid.weekday !== "Mon" || madrid.hour !== 7)) {
    return NextResponse.json({ ok: true, skipped: true, madrid });
  }

  const monday = mondayMadridUtc();
  const nextMonday = new Date(monday);
  nextMonday.setUTCDate(nextMonday.getUTCDate() + 7);
  const weekKey = monday.toISOString().slice(0, 10);

  const calls = await prisma.scheduledCall.findMany({
    where: {
      scheduledAt: { gte: monday, lt: nextMonday },
      completedAt: null,
      patient: { isTest: false },
    },
    include: {
      patient: {
        select: { id: true, fullName: true, assignedProfessionalId: true },
      },
    },
    orderBy: { scheduledAt: "asc" },
  });

  // Agrupamos por fisio asignado del paciente. Si un paciente no tiene
  // fisio (raro pero posible durante alta), lo agrupamos en la clave
  // vacía y solo aparece en el resumen del CEO.
  const byFisio = new Map<string, typeof calls>();
  for (const c of calls) {
    const key = c.patient.assignedProfessionalId ?? "__unassigned__";
    if (!byFisio.has(key)) byFisio.set(key, []);
    byFisio.get(key)!.push(c);
  }

  const ceos = await prisma.professional.findMany({
    where: { role: "ceo", active: true },
    select: { id: true, fullName: true },
  });

  const perFisioResults: Array<{ professionalId: string; count: number; skipped?: boolean }> = [];

  for (const [professionalId, list] of byFisio.entries()) {
    if (professionalId === "__unassigned__") continue;
    const refKey = `patient_calls_week:${weekKey}:${professionalId}`;
    const existing = await prisma.teamNotification.findFirst({
      where: { refKey },
      select: { id: true },
    });
    if (existing) {
      perFisioResults.push({ professionalId, count: list.length, skipped: true });
      continue;
    }
    const optCount = list.filter((c) => c.type === "optimizacion").length;
    const renCount = list.filter((c) => c.type === "renovacion").length;
    const detail = list
      .map((c) => `${typeLabel(c.type)}: ${c.patient.fullName}`)
      .join(" · ");
    const parts: string[] = [];
    if (optCount) parts.push(`${optCount} de optimización`);
    if (renCount) parts.push(`${renCount} de renovación`);
    const summary = parts.join(" y ");
    await notifyProfessional({
      professionalId,
      type: "patient_calls_week",
      title: `📞 Esta semana: ${list.length} llamada${list.length === 1 ? "" : "s"}`,
      body: `${summary}. ${detail}.`,
      actionUrl: "/fisio/llamadas",
      refKey,
    });
    perFisioResults.push({ professionalId, count: list.length });
  }

  // Resumen para cada CEO: todas las llamadas del equipo esta semana.
  // Idempotencia con refKey también.
  for (const ceo of ceos) {
    const refKey = `patient_calls_week_ceo:${weekKey}:${ceo.id}`;
    const existing = await prisma.teamNotification.findFirst({
      where: { refKey },
      select: { id: true },
    });
    if (existing) continue;
    if (calls.length === 0) continue;
    const optCount = calls.filter((c) => c.type === "optimizacion").length;
    const renCount = calls.filter((c) => c.type === "renovacion").length;
    const parts: string[] = [];
    if (optCount) parts.push(`${optCount} optimización`);
    if (renCount) parts.push(`${renCount} renovación`);
    await notifyProfessional({
      professionalId: ceo.id,
      type: "patient_calls_week_ceo",
      title: `📞 Llamadas del equipo esta semana (${calls.length})`,
      body: `${parts.join(" · ")}. Ver detalle en /fisio/llamadas.`,
      actionUrl: "/fisio/llamadas",
      refKey,
    });
  }

  return NextResponse.json({
    ok: true,
    weekMonday: weekKey,
    totalCalls: calls.length,
    fisios: perFisioResults,
  });
}

export const GET = handler;
export const POST = handler;
