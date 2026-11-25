import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { failure, json, rateLimit, readJson, requireOrigin, requireProfile } from "@/lib/public-wod/server";
export const dynamic = "force-dynamic";
export async function POST(req: NextRequest) {
  try {
    requireOrigin(req); const row = await requireProfile(); await rateLimit(req, "contact", 20, 3600, row.id);
    const data = z.object({ kind: z.enum(["question", "case"]) }).strict().parse(await readJson(req));
    await prisma.publicWodProfile.update({ where: { id: row.id }, data: { whatsappClickedAt: new Date(), ...(data.kind === "case" ? { helpRequestedAt: row.helpRequestedAt || new Date() } : { adaptationQuestionAt: row.adaptationQuestionAt || new Date() }) } });
    return json({ ok: true });
  } catch (e) { return failure(e); }
}
