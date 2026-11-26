import { prisma } from "@/lib/prisma";
import type { ActiveProfessional } from "@/lib/session";
import type { z } from "zod";
import { chatSchema, ticketSchema, updateTicketSchema, type ChatDTO, type SupportAnswer, type TicketDTO } from "./contracts";
import { buildSupportContext } from "./context";
import { answerSupport } from "./answer";
import { managesSupport } from "./guide";
import { SupportError } from "./errors";
import { claimSupportFiles, supportFileDTO } from "./materials";
export { SupportError } from "./errors";

const fail = (status: number, message: string): never => { throw new SupportError(status, message); };
const parse = <T,>(raw: string | null, fallback: T): T => { try { return raw ? JSON.parse(raw) : fallback; } catch { return fallback; } };

async function conversation(actor: ActiveProfessional) {
  return prisma.supportConversation.upsert({ where: { professionalId: actor.id }, create: { professionalId: actor.id }, update: {} });
}
export async function readSupportChat(actor: ActiveProfessional): Promise<ChatDTO> {
  const thread = await conversation(actor);
  const messages = await prisma.supportMessage.findMany({ where: { conversationId: thread.id }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: 60 });
  return { id: thread.id, version: thread.version, busy: !!thread.busyUntil && thread.busyUntil > new Date(),
    messages: messages.reverse().map(m => ({ id: m.id, role: m.role, text: m.text, createdAt: m.createdAt.toISOString(), answer: parse<SupportAnswer | null>(m.answerJson, null) })) };
}

export async function sendSupportChat(actor: ActiveProfessional, input: z.infer<typeof chatSchema>) {
  const thread = await conversation(actor);
  const duplicate = await prisma.supportMessage.findUnique({ where: { requestId: input.requestId } });
  if (duplicate) {
    if (duplicate.conversationId !== thread.id || duplicate.text !== input.text) fail(409, "Esta consulta ya se ha utilizado. Actualiza la conversación.");
    return readSupportChat(actor);
  }
  const count = await prisma.supportMessage.count({ where: { conversationId: thread.id, role: "user", createdAt: { gte: new Date(Date.now() - 600000) } } });
  if (count >= 20) fail(429, "Has enviado muchas consultas seguidas. Espera unos minutos antes de continuar.");
  const context = await buildSupportContext(actor, input.path);
  await prisma.$transaction(async tx => {
    const lock = await tx.supportConversation.updateMany({ where: { id: thread.id, professionalId: actor.id, version: input.version,
      OR: [{ busyUntil: null }, { busyUntil: { lt: new Date() } }] }, data: { busyUntil: new Date(Date.now() + 90000), version: { increment: 1 } } });
    if (lock.count !== 1) fail(409, "Hay otra consulta en curso o la conversación ha cambiado. Actualiza antes de enviar.");
    await tx.supportMessage.create({ data: { conversationId: thread.id, requestId: input.requestId, role: "user", text: input.text } });
  });
  const history = await prisma.supportMessage.findMany({ where: { conversationId: thread.id }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: 16 });
  const answer = await answerSupport(actor, context, history.reverse());
  await prisma.$transaction(async tx => {
    const lock = await tx.supportConversation.updateMany({ where: { id: thread.id, professionalId: actor.id, version: input.version + 1 },
      data: { version: { increment: 1 }, busyUntil: null } });
    if (lock.count !== 1) fail(409, "La conversación ha cambiado. Actualiza para ver las últimas respuestas.");
    await tx.supportMessage.create({ data: { conversationId: thread.id, requestId: "reply:" + input.requestId, role: "assistant", text: answer.answer, answerJson: JSON.stringify(answer) } });
  });
  return readSupportChat(actor);
}

function ticketScope(actor: ActiveProfessional) { return managesSupport(actor) ? {} : { reporterId: actor.id }; }
export async function listSupportTickets(actor: ActiveProfessional, filters: { status?: string; kind?: string; priority?: string; page?: number } = {}) {
  const scope = ticketScope(actor);
  const where = { ...scope, ...(filters.status ? { status: filters.status } : {}), ...(filters.kind ? { kind: filters.kind } : {}), ...(filters.priority ? { priority: filters.priority } : {}) };
  const [rows, total, counts] = await Promise.all([
    prisma.supportTicket.findMany({ where, orderBy: [{ updatedAt: "desc" }, { id: "desc" }], skip: ((filters.page ?? 1) - 1) * 30, take: 30,
      select: { id: true, title: true, reporterId: true, status: true, kind: true, priority: true, createdAt: true, updatedAt: true } }),
    prisma.supportTicket.count({ where }), prisma.supportTicket.groupBy({ by: ["status"], where: scope, _count: true }),
  ]);
  const people = await prisma.professional.findMany({ where: { id: { in: [...new Set(rows.map(r => r.reporterId))] } }, select: { id: true, fullName: true } });
  return { manager: managesSupport(actor), total, page: filters.page ?? 1,
    counts: Object.fromEntries(counts.map(c => [c.status, c._count])),
    tickets: rows.map(r => ({ ...r, reporter: people.find(p => p.id === r.reporterId)?.fullName ?? "Profesional", createdAt: r.createdAt.toISOString(), updatedAt: r.updatedAt.toISOString() })) };
}

export async function readSupportTicket(actor: ActiveProfessional, id: string): Promise<TicketDTO> {
  const row = await prisma.supportTicket.findFirst({ where: { id, ...ticketScope(actor) }, include: { attachments: { where: { eventId: null, status: "ready" }, orderBy: { createdAt: "asc" } }, events: { orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: 200, include: { attachments: { where: { status: "ready" }, orderBy: { createdAt: "asc" } } } }, _count: { select: { events: true } } } });
  if (!row) return fail(404, "Aviso no disponible.");
  const people = await prisma.professional.findMany({ where: { id: { in: [...new Set([row.reporterId, ...row.events.map(e => e.authorId)])] } }, select: { id: true, fullName: true } });
  const name = (id: string) => people.find(p => p.id === id)?.fullName ?? "Profesional";
  return { id: row.id, title: row.title, description: row.description, path: row.path, reporterId: row.reporterId, version: row.version,
    kind: row.kind as TicketDTO["kind"], status: row.status as TicketDTO["status"], priority: row.priority as TicketDTO["priority"],
    reporter: name(row.reporterId), context: parse(row.contextJson, {} as TicketDTO["context"]), conversation: parse(row.conversationJson, []),
    createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString(),
    eventCount: row._count.events,
    attachments: row.attachments.map(supportFileDTO), links: parse(row.linksJson, []),
    events: row.events.reverse().map(e => ({ id: e.id, body: e.body, author: name(e.authorId), createdAt: e.createdAt.toISOString(), status: e.status as TicketDTO["status"] | null, priority: e.priority as TicketDTO["priority"] | null, attachments: e.attachments.map(supportFileDTO), links: parse(e.linksJson, []) })) };
}

async function ceoIds() {
  return (await prisma.professional.findMany({ where: { active: true, OR: [{ role: "ceo" }, { extraRoles: { has: "ceo" } }] }, select: { id: true } })).map(p => p.id);
}
export async function createSupportTicket(actor: ActiveProfessional, input: z.infer<typeof ticketSchema>) {
  const duplicate = await prisma.supportTicket.findUnique({ where: { requestId: input.requestId } });
  if (duplicate) {
    if (duplicate.reporterId !== actor.id) fail(409, "Referencia de aviso ya utilizada.");
    return readSupportTicket(actor, duplicate.id);
  }
  const count = await prisma.supportTicket.count({ where: { reporterId: actor.id, createdAt: { gte: new Date(Date.now() - 3600000) } } });
  if (count >= 10) fail(429, "Has enviado varios avisos seguidos. Revisa los existentes antes de crear otro.");
  const context = await buildSupportContext(actor, input.path);
  // Sharing is a snapshot, never a live link to this professional's private chat.
  const history = input.includeConversation ? (await readSupportChat(actor)).messages.slice(-8).map(m => ({ role: m.role, text: m.text.slice(0, 7000) })) : [];
  const recipients = await ceoIds();
  const ticket = await prisma.$transaction(async tx => {
    const row = await tx.supportTicket.create({ data: {
      requestId: input.requestId, reporterId: actor.id, kind: input.kind, title: input.title, description: input.description,
      priority: input.priority, path: input.path, contextJson: JSON.stringify(context), conversationJson: JSON.stringify(history), linksJson: JSON.stringify(input.links ?? []),
    } });
    await claimSupportFiles(tx, actor, input.attachmentIds ?? [], row.id, null);
    if (recipients.length) await tx.teamNotification.createMany({ data: recipients.map(id => ({
      targetProfessionalId: id, type: "support_new", title: input.kind === "problem" ? "Nuevo problema del equipo" : "Nueva propuesta de mejora",
      body: "Hay un aviso pendiente en Soporte y mejoras.", actionUrl: "/fisio/soporte?ticket=" + row.id, refKey: "support-new:" + row.id,
    })) });
    return row;
  });
  return readSupportTicket(actor, ticket.id);
}

export async function updateSupportTicket(actor: ActiveProfessional, id: string, input: z.infer<typeof updateTicketSchema>) {
  const existing = await prisma.supportTicket.findFirst({ where: { id, ...ticketScope(actor) } });
  if (!existing) fail(404, "Aviso no disponible.");
  if (!managesSupport(actor) && (input.status !== undefined || input.priority !== undefined)) fail(403, "Solo el CEO puede cambiar el estado o la prioridad.");
  const duplicate = await prisma.supportTicketEvent.findUnique({ where: { requestId: input.requestId } });
  if (duplicate) {
    if (duplicate.ticketId !== id || duplicate.authorId !== actor.id) fail(409, "Referencia de respuesta ya utilizada.");
    return readSupportTicket(actor, id);
  }
  const recent = await prisma.supportTicketEvent.count({ where: { authorId: actor.id, createdAt: { gte: new Date(Date.now() - 600000) } } });
  if (recent >= 30) fail(429, "Has enviado muchas actualizaciones seguidas. Espera unos minutos antes de continuar.");
  const recipients = managesSupport(actor) ? [existing!.reporterId] : await ceoIds();
  await prisma.$transaction(async tx => {
    const result = await tx.supportTicket.updateMany({ where: { id, ...ticketScope(actor), version: input.version },
      data: { ...(input.status ? { status: input.status } : {}), ...(input.priority ? { priority: input.priority } : {}), version: { increment: 1 }, updatedAt: new Date() } });
    if (result.count !== 1) fail(409, "El aviso ha cambiado. Actualízalo antes de guardar.");
    const event = await tx.supportTicketEvent.create({ data: { ticketId: id, requestId: input.requestId, authorId: actor.id,
      body: input.body, status: input.status ?? null, priority: input.priority ?? null, linksJson: JSON.stringify(input.links ?? []) } });
    await claimSupportFiles(tx, actor, input.attachmentIds ?? [], id, event.id);
    const targets = [...new Set(recipients)].filter(target => target !== actor.id);
    if (targets.length) await tx.teamNotification.createMany({ data: targets.map(target => ({
      targetProfessionalId: target, type: "support_update", title: "Novedades en tu aviso de soporte",
      body: "Hay una respuesta o cambio de estado en Soporte y mejoras.", actionUrl: "/fisio/soporte?ticket=" + id, refKey: "support-update:" + event.id,
    })) });
  });
  return readSupportTicket(actor, id);
}
