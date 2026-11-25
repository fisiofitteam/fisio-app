import { timingSafeEqual } from "crypto";
import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { json, failure } from "@/lib/public-wod/server";
export const dynamic = "force-dynamic";
export async function GET(req: NextRequest) {
  const expected = process.env.CRON_SECRET ? Buffer.from(`Bearer ${process.env.CRON_SECRET}`) : null;
  const actual = Buffer.from(req.headers.get("authorization") || "");
  if (!expected || expected.length !== actual.length || !timingSafeEqual(expected, actual)) return json({ error: "Unauthorized" }, 401);
  try {
    const [profiles, counters] = await prisma.$transaction([
      prisma.publicWodProfile.deleteMany({ where: { expiresAt: { lt: new Date() } } }),
      prisma.publicWodRateLimit.deleteMany({ where: { expiresAt: { lt: new Date() } } }),
    ]);
    return json({ removedProfiles: profiles.count, removedCounters: counters.count });
  } catch (e) { return failure(e); }
}
