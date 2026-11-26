import { randomUUID } from "node:crypto";
import { head, del } from "@vercel/blob";
import type { Prisma } from "@prisma/client";
import type { z } from "zod";
import { prisma } from "@/lib/prisma";
import type { ActiveProfessional } from "@/lib/session";
import { recordingToken } from "@/lib/recordings";
import { managesSupport } from "./guide";
import { SupportError } from "./errors";
import { SUPPORT_FILE_TYPES, reserveSupportFileSchema, type SupportFile } from "./materials-contract";

const PREFIX = "team-support/";
export function supportStorageToken() {
  try { return recordingToken(); } catch { throw new SupportError(503, "El almacenamiento de adjuntos no está disponible. Puedes guardar la propuesta con texto y enlaces."); }
}
export function supportBlobUrl(raw: string, path: string): URL | null {
  try {
    const u = new URL(raw);
    return u.protocol === "https:" && !u.port && !u.username && !u.password && !u.search && !u.hash &&
      /^[a-z0-9-]+\.private\.blob\.vercel-storage\.com$/.test(u.hostname) && path.startsWith(PREFIX) && u.pathname === "/" + path ? u : null;
  } catch { return null; }
}
export function supportFileDTO(row: { id: string; name: string; mime: string; size: number }): SupportFile {
  return { id: row.id, name: row.name, mime: row.mime, size: row.size, href: "/api/support/attachments/" + row.id + "/file" };
}
export async function discardSupportFile(actor: ActiveProfessional, id: string) {
  const row = await prisma.supportAttachment.findFirst({ where: { id, createdById: actor.id, ticketId: null, eventId: null } });
  if (!row) throw new SupportError(404, "Adjunto no disponible para retirar.");
  const claimed = await prisma.supportAttachment.updateMany({ where: { id, createdById: actor.id, ticketId: null, eventId: null }, data: { status: "deleting" } });
  if (!claimed.count) throw new SupportError(409, "El adjunto ya se ha enviado con un aviso.");
  await del(row.blobPath, { token: supportStorageToken() });
  await prisma.supportAttachment.deleteMany({ where: { id, ticketId: null, status: "deleting" } });
}
export async function reserveSupportFile(actor: ActiveProfessional, input: z.infer<typeof reserveSupportFileSchema>) {
  supportStorageToken();
  // Recover abandoned uploads for this owner only; never touch submitted material.
  const expired = await prisma.supportAttachment.findMany({ where: { createdById: actor.id, ticketId: null, createdAt: { lt: new Date(Date.now() - 86400000) } }, take: 8 });
  for (const old of expired) { try { await discardSupportFile(actor, old.id); } catch { /* A later reservation can retry cleanup. */ } }
  const count = await prisma.supportAttachment.count({ where: { createdById: actor.id, createdAt: { gte: new Date(Date.now() - 3600000) } } });
  if (count >= 20) throw new SupportError(429, "Has subido muchos archivos seguidos. Espera un poco antes de añadir más.");
  const id = randomUUID(), ext = SUPPORT_FILE_TYPES[input.mime as keyof typeof SUPPORT_FILE_TYPES];
  const row = await prisma.supportAttachment.create({ data: {
    id, createdById: actor.id, name: input.name, mime: input.mime, size: input.size,
    blobPath: PREFIX + id + "." + ext, pendingUntil: new Date(Date.now() + 3600000),
  } });
  return { ...supportFileDTO(row), pathname: row.blobPath };
}
export async function requireOwnedSupportUpload(actor: ActiveProfessional, id: string) {
  const row = await prisma.supportAttachment.findFirst({ where: { id, createdById: actor.id, ticketId: null, eventId: null } });
  if (!row || row.status === "deleting" || !row.pendingUntil || row.pendingUntil <= new Date()) throw new SupportError(409, "La subida ha caducado o no te pertenece. Vuelve a añadir el archivo.");
  return row;
}
export async function finishSupportFile(actor: ActiveProfessional, id: string) {
  const row = await requireOwnedSupportUpload(actor, id);
  if (row.status === "ready") return supportFileDTO(row);
  // Only read the path reserved by us. Never fetch a URL sent by the browser.
  const blob = await head(row.blobPath, { token: supportStorageToken() });
  if (blob.pathname !== row.blobPath || blob.size !== row.size || blob.contentType.split(";")[0].trim().toLowerCase() !== row.mime || !supportBlobUrl(blob.url, row.blobPath))
    throw new SupportError(409, "El archivo no coincide con la subida autorizada.");
  const done = await prisma.supportAttachment.updateMany({ where: { id, createdById: actor.id, status: "pending", ticketId: null, pendingUntil: { gt: new Date() } }, data: { status: "ready", url: blob.url } });
  if (!done.count) {
    const latest = await requireOwnedSupportUpload(actor, id);
    if (latest.status !== "ready") throw new SupportError(409, "No se pudo confirmar el adjunto.");
  }
  return supportFileDTO(row);
}
export async function claimSupportFiles(tx: Prisma.TransactionClient, actor: ActiveProfessional, ids: string[], ticketId: string, eventId: string | null) {
  if (!ids.length) return;
  const result = await tx.supportAttachment.updateMany({
    where: { id: { in: ids }, createdById: actor.id, status: "ready", ticketId: null, eventId: null, pendingUntil: { gt: new Date() } },
    data: { ticketId, eventId, pendingUntil: null },
  });
  if (result.count !== ids.length) throw new SupportError(409, "Algún adjunto no está listo, ha caducado o ya se ha enviado. Revisa los archivos antes de continuar.");
}
export async function readableSupportFile(actor: ActiveProfessional, id: string) {
  const row = await prisma.supportAttachment.findUnique({ where: { id } });
  if (!row || row.status !== "ready" || !row.url) throw new SupportError(404, "Adjunto no disponible.");
  if (row.ticketId) {
    const ticket = await prisma.supportTicket.findFirst({ where: { id: row.ticketId, ...(managesSupport(actor) ? {} : { reporterId: actor.id }) }, select: { id: true } });
    if (!ticket) throw new SupportError(404, "Adjunto no disponible.");
  } else if (row.createdById !== actor.id || !row.pendingUntil || row.pendingUntil <= new Date()) throw new SupportError(404, "Adjunto no disponible.");
  const url = supportBlobUrl(row.url, row.blobPath);
  if (!url) throw new SupportError(404, "Adjunto no disponible.");
  return { row, url };
}
