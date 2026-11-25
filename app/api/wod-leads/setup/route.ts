import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { hasRole } from "@/lib/auth";
import { PUBLIC_WOD_MIGRATION } from "@/lib/public-wod/migration";
import { failure, json, PublicWodError, requireOrigin, requireWodStaff } from "@/lib/public-wod/server";
export const dynamic = "force-dynamic";
export async function POST(req: NextRequest) {
  try {
    requireOrigin(req); const user = await requireWodStaff();
    if (!hasRole(user, "ceo")) throw new PublicWodError(403, "Solo dirección puede preparar la herramienta.");
    await prisma.$transaction(async tx => { for (const sql of PUBLIC_WOD_MIGRATION) await tx.$executeRawUnsafe(sql); });
    return json({ ok: true });
  } catch (e) { return failure(e); }
}
