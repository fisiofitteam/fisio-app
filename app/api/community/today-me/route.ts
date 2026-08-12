/**
 * GET /api/community/today-me
 *
 * Devuelve el CommunityPost asignado al profesional actual para el día de
 * HOY (calendario Madrid) que aún no está marcado como publicado. Si no
 * hay ninguno, devuelve `{ post: null }`.
 *
 * Se usa desde el banner persistente del layout de /fisio para recordarle
 * al fisio que le toca publicar hoy, hasta que él mismo lo marque como
 * hecho.
 *
 * Cualquier profesional puede llamarlo — si no tiene post asignado hoy,
 * simplemente le sale null y no aparece el banner.
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getActiveProfessional } from "@/lib/session";
import { parseCategories, categoryMeta } from "@/lib/community";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** UTC midnight de HOY calendario Madrid. */
function todayMadridUtc(): Date {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Madrid",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const y = Number(parts.find((p) => p.type === "year")!.value);
  const m = Number(parts.find((p) => p.type === "month")!.value) - 1;
  const d = Number(parts.find((p) => p.type === "day")!.value);
  return new Date(Date.UTC(y, m, d));
}

export async function GET() {
  const user = await getActiveProfessional();
  if (!user) return NextResponse.json({ post: null });

  const today = todayMadridUtc();
  const post = await prisma.communityPost.findFirst({
    where: {
      date: today,
      assignedToId: user.id,
      done: false,
    },
    select: {
      id: true,
      categories: true,
      category: true,
      note: true,
      text: true,
    },
  });
  if (!post) return NextResponse.json({ post: null });

  const cats = parseCategories(post.categories || "[]");
  const labels = (cats.length > 0 ? cats : [post.category])
    .map((c) => categoryMeta(c).label)
    .join(" · ");

  return NextResponse.json({
    post: {
      id: post.id,
      categoriesLabel: labels,
      note: post.note?.trim() ?? null,
      text: post.text?.trim() ?? null,
    },
  });
}
