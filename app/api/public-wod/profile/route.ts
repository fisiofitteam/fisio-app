import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { CONSENT_VERSION, profileSchema, registrationSchema, selfTestSchema } from "@/lib/public-wod/contracts";
import { clearCookie, expiresAt, failure, hashToken, json, newToken, profileDTO, rateLimit, readJson, requireOrigin, requireProfile, setCookie, touchProfile } from "@/lib/public-wod/server";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export async function GET(req: NextRequest) {
  try {
    const profile = await requireProfile();
    const offset = z.coerce.number().int().min(0).max(10000).parse(req.nextUrl.searchParams.get("offset") || 0);
    return json(await profileDTO(profile, offset));
  } catch (e) { return failure(e); }
}
export async function POST(req: NextRequest) {
  try {
    requireOrigin(req); await rateLimit(req, "signup", 5, 3600);
    const input = registrationSchema.parse(await readJson(req));
    const token = newToken();
    // Never look up/merge by unverified phone: that would expose another person's health history.
    const row = await prisma.publicWodProfile.create({ data: { name: input.name, phone: input.phone, tokenHash: hashToken(token), expiresAt: expiresAt(), profileJson: JSON.stringify(input.profile),
      consentVersion: CONSENT_VERSION, marketingConsentAt: input.marketingConsent ? new Date() : null, sourceJson: JSON.stringify(input.source || {}),
      helpRequestedAt: input.profile.intent === "help" ? new Date() : null } });
    setCookie(token);
    return json({ profile: await profileDTO(row), recoveryKey: token }, 201);
  } catch (e) { return failure(e); }
}
const updateSchema = z.object({ profile: profileSchema.optional(), selfTest: selfTestSchema.nullable().optional(), marketingConsent: z.boolean().optional() }).strict();
export async function PATCH(req: NextRequest) {
  try {
    requireOrigin(req); const row = await requireProfile(); await rateLimit(req, "profile", 30, 3600, row.id);
    const data = updateSchema.parse(await readJson(req));
    const updated = await prisma.publicWodProfile.update({ where: { id: row.id }, data: {
      ...(data.profile ? { profileJson: JSON.stringify(data.profile), ...(data.profile.intent === "help" && !row.helpRequestedAt ? { helpRequestedAt: new Date() } : {}) } : {}),
      ...(data.selfTest !== undefined ? { selfTestJson: data.selfTest === null ? null : JSON.stringify(data.selfTest) } : {}),
      ...(data.marketingConsent !== undefined ? { marketingConsentAt: data.marketingConsent ? row.marketingConsentAt || new Date() : null } : {}),
    } });
    await touchProfile(row.id); return json(await profileDTO(updated));
  } catch (e) { return failure(e); }
}
export async function DELETE(req: NextRequest) {
  try { requireOrigin(req); const row = await requireProfile(); await prisma.publicWodProfile.delete({ where: { id: row.id } }); clearCookie(); return json({ ok: true }); }
  catch (e) { return failure(e); }
}
