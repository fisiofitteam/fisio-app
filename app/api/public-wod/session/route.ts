import { cookies } from "next/headers";
import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { COOKIE, PublicWodError, clearCookie, failure, hashToken, json, profileDTO, rateLimit, readJson, requireOrigin, requireProfile, setCookie, touchProfile } from "@/lib/public-wod/server";
export const dynamic = "force-dynamic";
export async function POST(req: NextRequest) {
  try {
    requireOrigin(req); await rateLimit(req, "session", 15, 3600);
    const data = z.discriminatedUnion("action", [z.object({ action: z.literal("restore"), key: z.string().regex(/^[A-Za-z0-9_-]{43}$/) }).strict(), z.object({ action: z.literal("recovery") }).strict(), z.object({ action: z.literal("logout") }).strict()]).parse(await readJson(req));
    if (data.action === "logout") { clearCookie(); return json({ ok: true }); }
    if (data.action === "recovery") { await requireProfile(); return json({ recoveryKey: cookies().get(COOKIE)!.value }); }
    const row = await prisma.publicWodProfile.findUnique({ where: { tokenHash: hashToken(data.key) } });
    if (!row || row.expiresAt <= new Date()) throw new PublicWodError(401, "El enlace no es válido o ha caducado.");
    setCookie(data.key); await touchProfile(row.id);
    return json(await profileDTO(row));
  } catch (e) { return failure(e); }
}
