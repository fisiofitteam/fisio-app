/**
 * Cron diario que avisa a las 07:00 hora Madrid al profesional que tiene un
 * CommunityPost asignado para HOY, y en paralelo al CEO para que también lo
 * vea en su campanita.
 *
 * Se dispara desde Vercel Cron a las 05:00 UTC y 06:00 UTC (vercel.json) —
 * cubre 07:00 hora Madrid tanto en verano (UTC+2) como invierno (UTC+1) con
 * un solo handler que checkea la hora Madrid antes de disparar.
 *
 * Idempotencia: cada CommunityPost se marca con `notifiedAt` al enviar la
 * notificación. Si el cron corre dos veces el mismo día, el segundo intento
 * salta los posts ya notificados.
 *
 * Protección: `Authorization: Bearer ${CRON_SECRET}` (igual patrón que el
 * resto de crons del proyecto). ?test=1 permite dispararlo a mano en dev.
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { notifyProfessional } from "@/lib/notifications";
import { parseCategories, categoryMeta } from "@/lib/community";
import { getActiveProfessional } from "@/lib/session";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

function getMadridHour(d: Date = new Date()): number {
  try {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Europe/Madrid",
      hour: "2-digit",
      hour12: false,
    }).formatToParts(d);
    const h = Number(parts.find((p) => p.type === "hour")?.value);
    return Number.isFinite(h) ? h : -1;
  } catch {
    return -1;
  }
}

/** UTC midnight de HOY calendario Madrid. */
function todayMadridUtc(): Date {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Madrid",
    year: "numeric", month: "2-digit", day: "2-digit",
  });
  const parts = fmt.formatToParts(new Date());
  const y = Number(parts.find((p) => p.type === "year")!.value);
  const m = Number(parts.find((p) => p.type === "month")!.value) - 1;
  const d = Number(parts.find((p) => p.type === "day")!.value);
  return new Date(Date.UTC(y, m, d));
}

async function handler(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization") ?? "";
  const isTest = req.nextUrl.searchParams.get("test") === "1";
  const isLocal = process.env.NODE_ENV !== "production";
  const isManual = req.nextUrl.searchParams.get("manual") === "1";

  if (isManual) {
    // Disparo manual desde el navegador (CEO/head_success). Sin Bearer,
    // igual que patient-calls-scheduler y notify-patient-calls-week.
    const user = await getActiveProfessional();
    if (!user || (user.role !== "ceo" && user.role !== "head_success")) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  } else if (cronSecret && auth !== `Bearer ${cronSecret}` && !(isTest && isLocal)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // manual=1 implica force=1 (si un humano lo dispara es porque quiere
  // saltarse la guarda de hora).
  const force = isManual || req.nextUrl.searchParams.get("force") === "1";
  const madridHour = getMadridHour();
  if (!force && madridHour !== 7) {
    return NextResponse.json({ ok: true, skipped: true, madridHour });
  }

  const today = todayMadridUtc();

  // Diagnóstico: cuántos posts hay hoy con fisio asignado (independientemente
  // de si ya se notificaron). Sirve para saber por qué el cron no notifica
  // (no hay post asignado vs ya se notificó).
  const allTodayAssigned = await prisma.communityPost.count({
    where: { date: today, assignedToId: { not: null } },
  });

  // Cargamos posts de hoy con un fisio asignado y que aún no hayan sido
  // notificados.
  const posts = await prisma.communityPost.findMany({
    where: {
      date: today,
      assignedToId: { not: null },
      notifiedAt: null,
    },
    select: {
      id: true,
      assignedToId: true,
      category: true,
      categories: true,
      note: true,
      text: true,
    },
  });

  // CEOs activos: reciben una notificación paralela por cada post del día
  // (el CEO quiere ver en su campanita quién publica hoy). Si un CEO está
  // asignado él mismo al post, evitamos duplicarle.
  const ceos = await prisma.professional.findMany({
    where: { role: "ceo", active: true },
    select: { id: true, fullName: true },
  });

  const assigneeCache = new Map<string, string>();
  async function getAssigneeName(id: string): Promise<string> {
    const cached = assigneeCache.get(id);
    if (cached) return cached;
    const pro = await prisma.professional.findUnique({ where: { id }, select: { fullName: true } });
    const name = pro?.fullName ?? "un fisio";
    assigneeCache.set(id, name);
    return name;
  }

  const results: Array<{ postId: string; ok: boolean; error?: string }> = [];
  for (const p of posts) {
    try {
      const cats = parseCategories(p.categories || "[]");
      const labels = (cats.length > 0 ? cats : [p.category])
        .map((c) => categoryMeta(c).label)
        .join(" · ");
      const body = p.note?.trim()
        ? `Etiquetas: ${labels}. ${p.note.trim()}`
        : `Etiquetas: ${labels}. Abre el plan para revisar el brief y el banco de ideas.`;
      await notifyProfessional({
        professionalId: p.assignedToId!,
        type: "community_post_today",
        title: "📅 Hoy te toca publicar en la comunidad",
        body,
        actionUrl: "/fisio/comunidad/plan",
      });

      const assigneeName = await getAssigneeName(p.assignedToId!);
      const ceoBody = `Publica ${assigneeName}. Etiquetas: ${labels}.`;
      for (const ceo of ceos) {
        if (ceo.id === p.assignedToId) continue; // el CEO ya recibió el aviso como asignado
        await notifyProfessional({
          professionalId: ceo.id,
          type: "community_post_today_ceo",
          title: "📅 Post de comunidad de hoy",
          body: ceoBody,
          actionUrl: "/fisio/comunidad/plan",
        });
      }

      await prisma.communityPost.update({
        where: { id: p.id },
        data: { notifiedAt: new Date() },
      });
      results.push({ postId: p.id, ok: true });
    } catch (e: any) {
      results.push({ postId: p.id, ok: false, error: e?.message ?? "error" });
    }
  }

  return NextResponse.json({
    ok: true,
    today: today.toISOString().slice(0, 10),
    postsAssignedToday: allTodayAssigned,
    alreadyNotifiedBefore: allTodayAssigned - posts.length,
    notifiedNow: results.filter((r) => r.ok).length,
    results,
  });
}

export const GET = handler;
export const POST = handler;
