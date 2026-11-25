import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { hasRole } from "@/lib/auth";
import { canReadWodHealth, entryDTO, failure, json, PublicWodError, readJson, requireOrigin, requireWodStaff } from "@/lib/public-wod/server";
export const dynamic = "force-dynamic";
const statuses = ["NEW", "CONTACTED", "FOLLOW_UP", "CALL_BOOKED", "WON", "CLOSED"] as const;
export async function GET(req: NextRequest) {
  try {
    const user = await requireWodStaff();
    const id = req.nextUrl.searchParams.get("id");
    if (id) {
      if (!canReadWodHealth(user)) throw new PublicWodError(403, "El detalle clínico está reservado al equipo sanitario y dirección.");
      const offset = z.coerce.number().int().min(0).max(10000).parse(req.nextUrl.searchParams.get("offset") || 0);
      const row = await prisma.publicWodProfile.findUnique({ where: { id }, select: { id: true, name: true, profileJson: true, selfTestJson: true, entries: { orderBy: [{ createdAt: "desc" }, { id: "desc" }], skip: offset, take: 21 } } });
      if (!row) throw new PublicWodError(404, "No se encuentra este perfil.");
      return json({ id: row.id, name: row.name, profile: JSON.parse(row.profileJson), selfTest: row.selfTestJson ? JSON.parse(row.selfTestJson) : null, entries: row.entries.slice(0, 20).map(entryDTO), hasMore: row.entries.length > 20 });
    }
    const search = (req.nextUrl.searchParams.get("q") || "").trim().slice(0, 100);
    const page = z.coerce.number().int().min(0).max(10000).parse(req.nextUrl.searchParams.get("page") || 0);
    const status = req.nextUrl.searchParams.get("status");
    const where = { ...(search ? { OR: [{ name: { contains: search, mode: "insensitive" as const } }, { phone: { contains: search } }] } : {}), ...(status && statuses.includes(status as typeof statuses[number]) ? { followUpStatus: status } : {}) };
    const from = new Date(Date.now() - 30 * 86400000);
    const [rows, total, registrations, active, requests, clicks, calls, won, repeats] = await Promise.all([
      prisma.publicWodProfile.findMany({ where, orderBy: [{ createdAt: "desc" }, { id: "desc" }], skip: page * 50, take: 50,
        select: { id: true, name: true, phone: true, createdAt: true, lastUsedAt: true, marketingConsentAt: true, helpRequestedAt: true, adaptationQuestionAt: true, whatsappClickedAt: true, followUpStatus: true, sourceJson: true, _count: { select: { entries: true } } } }),
      prisma.publicWodProfile.count({ where }),
      prisma.publicWodProfile.count({ where: { createdAt: { gte: from } } }),
      prisma.publicWodProfile.count({ where: { entries: { some: { createdAt: { gte: from } } } } }),
      prisma.publicWodProfile.count({ where: { helpRequestedAt: { gte: from } } }),
      prisma.publicWodProfile.count({ where: { whatsappClickedAt: { gte: from } } }),
      prisma.publicWodProfile.count({ where: { createdAt: { gte: from }, followUpStatus: "CALL_BOOKED" } }),
      prisma.publicWodProfile.count({ where: { createdAt: { gte: from }, followUpStatus: "WON" } }),
      prisma.publicWodEntry.groupBy({ by: ["profileId"], where: { createdAt: { gte: from } }, _count: { id: true }, having: { id: { _count: { gte: 2 } } } }),
    ]);
    return json({ rows: rows.map(row => ({ ...row, phone: canReadWodHealth(user) || row.marketingConsentAt || row.helpRequestedAt || row.adaptationQuestionAt ? row.phone : null, source: JSON.parse(row.sourceJson), sourceJson: undefined, wodCount: row._count.entries, _count: undefined })), total, page,
      canReadHealth: canReadWodHealth(user), canDelete: hasRole(user, "ceo"), kpis: { registrations, active, requests, clicks, calls, won, repeats: repeats.length } });
  } catch (e) { return failure(e); }
}
export async function PATCH(req: NextRequest) {
  try {
    requireOrigin(req); const user = await requireWodStaff();
    const input = z.object({ id: z.string().min(10).max(80), status: z.enum(statuses) }).strict().parse(await readJson(req));
    const row = await prisma.publicWodProfile.findUnique({ where: { id: input.id }, select: { id: true } });
    if (!row) throw new PublicWodError(404, "No se encuentra este perfil.");
    await prisma.publicWodProfile.update({ where: { id: row.id }, data: { followUpStatus: input.status, managedById: user.id } });
    return json({ ok: true });
  } catch (e) { return failure(e); }
}
export async function DELETE(req: NextRequest) {
  try {
    requireOrigin(req); const user = await requireWodStaff();
    if (!hasRole(user, "ceo")) throw new PublicWodError(403, "Solo dirección puede borrar registros.");
    const input = z.object({ id: z.string().min(10).max(80) }).strict().parse(await readJson(req));
    await prisma.publicWodProfile.delete({ where: { id: input.id } }); return json({ ok: true });
  } catch (e) { return failure(e); }
}
