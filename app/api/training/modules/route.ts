import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getActiveProfessional } from "@/lib/session";
import { canManageTraining, moduleVisibleFor } from "@/lib/training";
import { parseTargetRoles, ROLE_ORDER, type ResourceRole } from "@/lib/resource-roles";

function normalizeTargetRoles(input: unknown): string {
  if (!Array.isArray(input)) return JSON.stringify(["ceo"]);
  const filtered = input.filter(
    (r): r is string => typeof r === "string" && (ROLE_ORDER as readonly string[]).includes(r),
  );
  return JSON.stringify(filtered.length ? Array.from(new Set(filtered)) : ["ceo"]);
}

/** GET — lista módulos visibles para el usuario, con sumario de secciones/lecciones. */
export async function GET() {
  const user = await getActiveProfessional();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const canManage = canManageTraining(user.role);
  const userRole = user.role as ResourceRole;

  const modules = await prisma.trainingModule.findMany({
    orderBy: [{ order: "asc" }, { createdAt: "asc" }],
    include: {
      sections: { select: { id: true, lessons: { select: { id: true } } } },
    },
  });

  const visible = modules
    .filter((m) => moduleVisibleFor(m.targetRoles, m.published, userRole, canManage))
    .map((m) => ({
      id: m.id,
      title: m.title,
      description: m.description,
      coverUrl: m.coverUrl,
      order: m.order,
      published: m.published,
      targetRoles: parseTargetRoles(m.targetRoles),
      sectionsCount: m.sections.length,
      lessonsCount: m.sections.reduce((acc, s) => acc + s.lessons.length, 0),
    }));

  return NextResponse.json({ modules: visible, canManage });
}

export async function POST(req: NextRequest) {
  const user = await getActiveProfessional();
  if (!user || !canManageTraining(user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const data = await req.json().catch(() => ({}));
  const title = typeof data?.title === "string" ? data.title.trim() : "";
  if (!title) return NextResponse.json({ error: "Título obligatorio" }, { status: 400 });

  const lastOrder = await prisma.trainingModule.findFirst({
    orderBy: { order: "desc" },
    select: { order: true },
  });

  const created = await prisma.trainingModule.create({
    data: {
      title,
      description: typeof data?.description === "string" ? data.description.trim() || null : null,
      coverUrl: typeof data?.coverUrl === "string" ? data.coverUrl.trim() || null : null,
      targetRoles: normalizeTargetRoles(data?.targetRoles),
      order: (lastOrder?.order ?? 0) + 1,
      published: data?.published !== false,
      createdById: user.id,
    },
  });
  return NextResponse.json({ id: created.id });
}

export async function PATCH(req: NextRequest) {
  const user = await getActiveProfessional();
  if (!user || !canManageTraining(user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const data = await req.json().catch(() => ({}));
  const id = typeof data?.id === "string" ? data.id : "";
  if (!id) return NextResponse.json({ error: "id requerido" }, { status: 400 });

  const update: any = {};
  if (data.title !== undefined) update.title = String(data.title).trim();
  if (data.description !== undefined) update.description = String(data.description).trim() || null;
  if (data.coverUrl !== undefined) update.coverUrl = String(data.coverUrl).trim() || null;
  if (data.published !== undefined) update.published = !!data.published;
  if (data.order !== undefined && Number.isFinite(Number(data.order))) update.order = Number(data.order);
  if (data.targetRoles !== undefined) update.targetRoles = normalizeTargetRoles(data.targetRoles);

  await prisma.trainingModule.update({ where: { id }, data: update });
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  const user = await getActiveProfessional();
  if (!user || !canManageTraining(user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id requerido" }, { status: 400 });
  await prisma.trainingModule.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
