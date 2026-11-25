import { createHash, randomUUID } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { findByPhone, findByIgUsername, skalexCredentials, SkalexError, type SkalexConversationDto } from "./client";
import { callIdentity, normalizePhone, normalizeInstagram, parseProviderInsights, readStoredContext, unavailableContext, type CallIdentity, type SkalexCallContext } from "./insights";

export const contextLeadSelect = { id: true, phone: true, instagram: true, contactType: true, contactValue: true, status: true, closerId: true } as const;
export function identityKey(lead: CallIdentity) { return createHash("sha256").update(JSON.stringify(callIdentity(lead))).digest("hex"); }
export function canReadCallContext(user: { id: string; role: string; extraRoles?: string[] }, lead: { closerId: string | null }) {
  // Same scope as the calls panel: CEO/setter can select a closer; secondary closers see their own calls.
  return user.role === "ceo" || user.role === "setter" || ([user.role, ...(user.extraRoles || [])].includes("closer") && lead.closerId === user.id);
}
export async function cachedCallContexts(leads: CallIdentity[]): Promise<Record<string, SkalexCallContext>> {
  if (!leads.length) return {};
  const keys = new Map(leads.map(lead => [lead.id, identityKey(lead)]));
  const rows = await prisma.skalexCallInsight.findMany({ where: { leadId: { in: leads.map(l => l.id) } } });
  const result: Record<string, SkalexCallContext> = {};
  for (const row of rows) { const value = readStoredContext(row.payload); if (value && row.identityKey === keys.get(row.leadId)) result[row.leadId] = value; }
  return result;
}
function exactMatches(dtos: SkalexConversationDto[], field: "phone" | "instagram", value: string) {
  return dtos.filter(dto => field === "phone"
    ? [dto.customerPhone, dto.customerContactPhone].some(phone => normalizePhone(phone) === value)
    : normalizeInstagram(dto.igUsername) === value);
}
export async function fetchCallContext(lead: CallIdentity): Promise<SkalexCallContext> {
  const identity = callIdentity(lead);
  if (!identity.phone && !identity.instagram) return unavailableContext("missing_identity");
  let matches: SkalexConversationDto[] = [];
  if (identity.phone) matches = exactMatches(await findByPhone(identity.phone), "phone", identity.phone);
  if (!matches.length && identity.instagram) matches = exactMatches(await findByIgUsername(identity.instagram), "instagram", identity.instagram);
  if (!matches.length) return unavailableContext("not_found");
  const ordered = [...matches].sort((a, b) => (Date.parse(b.lastMessageAt) || 0) - (Date.parse(a.lastMessageAt) || 0));
  // A lead can have several channels. Prefer the most recent available full summary.
  const parsed = ordered.map(dto => parseProviderInsights(dto.aiInsights));
  return parsed.find(value => value.status === "ready") || parsed[0];
}
export async function ensureCallContext(lead: CallIdentity & { status: string }): Promise<SkalexCallContext> {
  const now = new Date(), key = identityKey(lead), identity = callIdentity(lead);
  if (!identity.phone && !identity.instagram) return unavailableContext("missing_identity", now);
  let row = await prisma.skalexCallInsight.findUnique({ where: { leadId: lead.id } });
  const cached = row?.identityKey === key ? readStoredContext(row.payload) : null;
  if (cached && (cached.status === "ready" || (cached.retryAt && Date.parse(cached.retryAt) > now.getTime()))) return cached;
  if (lead.status !== "scheduled") return cached || { ...unavailableContext("not_requested", now), message: "El contexto se consulta cuando la llamada está agendada." };
  if (!skalexCredentials()) return unavailableContext("not_configured", now);
  if (!row) {
    try { row = await prisma.skalexCallInsight.create({ data: { leadId: lead.id, identityKey: key } }); }
    catch (error) { if ((error as { code?: string }).code !== "P2002") throw error; }
  }
  const token = randomUUID();
  const acquired = await prisma.skalexCallInsight.updateMany({
    where: { leadId: lead.id, OR: [{ leaseUntil: null }, { leaseUntil: { lte: now } }] },
    data: { identityKey: key, leaseToken: token, leaseUntil: new Date(now.getTime() + 100000), ...(row?.identityKey !== key ? { payload: null } : {}) },
  });
  if (!acquired.count) return unavailableContext("generating", now);
  let result: SkalexCallContext;
  try { result = await fetchCallContext(lead); }
  catch (error) {
    const name = (error as Error).name;
    result = unavailableContext(name === "TimeoutError" || name === "AbortError" ? "timeout" : error instanceof SkalexError && [401, 403].includes(error.status) ? "not_configured" : "connection_error");
  }
  // Lease ownership prevents a timed-out request from overwriting a later one.
  await prisma.skalexCallInsight.updateMany({ where: { leadId: lead.id, identityKey: key, leaseToken: token }, data: { payload: JSON.stringify(result), leaseToken: null, leaseUntil: null } });
  return result;
}

/** Existing 30-minute cron prepares upcoming calls without generating summaries for unbooked leads. */
export async function syncScheduledCallContexts() {
  const now = new Date(), from = new Date(now.getTime() - 86400000), to = new Date(now.getTime() + 30 * 86400000);
  const leads = await prisma.lead.findMany({ where: { status: "scheduled", inFollowUp: false, callScheduledAt: { gte: from, lte: to } }, select: contextLeadSelect, orderBy: { callScheduledAt: "asc" }, take: 300 });
  const cached = await cachedCallContexts(leads);
  const pending = leads.filter(lead => { const value = cached[lead.id]; return !value || (value.status !== "ready" && (!value.retryAt || Date.parse(value.retryAt) <= now.getTime())); }).slice(0, 4);
  let ready = 0;
  for (let i = 0; i < pending.length; i += 2) {
    const results = await Promise.allSettled(pending.slice(i, i + 2).map(ensureCallContext));
    ready += results.filter(result => result.status === "fulfilled" && result.value.status === "ready").length;
  }
  return { checked: pending.length, ready };
}
