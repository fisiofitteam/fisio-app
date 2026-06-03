import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getActiveProfessional } from "@/lib/session";
import { isManagerForCategory, type MeetingCategory } from "@/lib/team-meetings";

const VALID = ["head_success", "comercial", "other"];

// GET /api/team-meetings?category=head_success → lista reuniones de la
// categoría. Filtra por permisos en el server (ver page.tsx).
export async function GET(req: NextRequest) {
  const user = await getActiveProfessional();
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const category = (req.nextUrl.searchParams.get("category") || "") as MeetingCategory;
  if (!VALID.includes(category)) return NextResponse.json({ error: "category inválida" }, { status: 400 });

  const meetings = await prisma.teamMeeting.findMany({
    where: { category },
    orderBy: [{ scheduledAt: "desc" }, { createdAt: "desc" }],
  });
  return NextResponse.json(meetings);
}

// POST /api/team-meetings → crea reunión. Solo managers de esa categoría.
// body: { category, title, scheduledAt?, preparation?, summary?, attendeeIds? }
export async function POST(req: NextRequest) {
  const user = await getActiveProfessional();
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const b = await req.json().catch(() => ({}));
  const category = String(b?.category || "") as MeetingCategory;
  if (!VALID.includes(category)) return NextResponse.json({ error: "category inválida" }, { status: 400 });
  if (!isManagerForCategory(user.role, category)) {
    return NextResponse.json({ error: "Sin permiso para crear reuniones de esta categoría" }, { status: 403 });
  }

  const title = typeof b?.title === "string" ? b.title.trim() : "";
  if (!title) return NextResponse.json({ error: "Título obligatorio" }, { status: 400 });

  const scheduledAt = b?.scheduledAt ? new Date(b.scheduledAt) : null;
  const attendeeIds = Array.isArray(b?.attendeeIds)
    ? b.attendeeIds.filter((x: unknown) => typeof x === "string")
    : [];

  const created = await prisma.teamMeeting.create({
    data: {
      category,
      title,
      scheduledAt: scheduledAt && !isNaN(scheduledAt.getTime()) ? scheduledAt : null,
      preparation: typeof b?.preparation === "string" && b.preparation.trim() ? b.preparation : null,
      summary: typeof b?.summary === "string" && b.summary.trim() ? b.summary : null,
      status: "upcoming",
      createdById: user.id,
      attendeeIds: JSON.stringify(attendeeIds),
    },
  });
  return NextResponse.json(created);
}
