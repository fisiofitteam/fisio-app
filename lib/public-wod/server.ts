import { createHash, randomBytes } from "crypto";
import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getActiveProfessional, hasAnyRole } from "@/lib/auth";
import { type PublicWodEntry, type PublicWodProfile } from "@prisma/client";
import { type EntryDTO, type ProfileDTO, profileSchema, selfTestSchema } from "./contracts";

export const COOKIE = "fisio-public-wod";
const SESSION_SECONDS = 180 * 86400;
export const PRIVATE_HEADERS = { "Cache-Control": "private, no-store, max-age=0", "Referrer-Policy": "no-referrer", "X-Content-Type-Options": "nosniff" };
export class PublicWodError extends Error { constructor(public status: number, message: string) { super(message); } }
export const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");
export const newToken = () => randomBytes(32).toString("base64url");
export const expiresAt = () => new Date(Date.now() + SESSION_SECONDS * 1000);
export function setCookie(token: string) {
  cookies().set(COOKIE, token, { httpOnly: true, sameSite: "strict", secure: process.env.NODE_ENV === "production", path: "/", maxAge: SESSION_SECONDS });
}
export function clearCookie() { cookies().set(COOKIE, "", { httpOnly: true, sameSite: "strict", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 0 }); }
export function requireOrigin(req: NextRequest) {
  // Next's internal URL can use localhost behind a reverse proxy. Host is the
  // destination requested by the browser; don't trust a caller-supplied forwarded origin.
  const origin = req.headers.get("origin");
  let valid = false;
  try {
    const url = new URL(origin || "");
    valid = url.host === (req.headers.get("host") || req.nextUrl.host) && url.protocol === req.nextUrl.protocol;
  } catch { /* missing/malformed Origin fails closed */ }
  if (!valid || req.headers.get("sec-fetch-site") === "cross-site") throw new PublicWodError(403, "Abre la herramienta desde FisioFit y vuelve a intentarlo.");
}
export async function readJson(req: NextRequest, max = 18000): Promise<unknown> {
  if (!req.headers.get("content-type")?.startsWith("application/json")) throw new PublicWodError(415, "Formato no válido.");
  const reader = req.body?.getReader();
  if (!reader) throw new PublicWodError(400, "Faltan datos.");
  const chunks: Uint8Array[] = []; let total = 0;
  while (true) {
    const { value, done } = await reader.read(); if (done) break;
    total += value.byteLength;
    if (total > max) { await reader.cancel(); throw new PublicWodError(413, "La solicitud es demasiado grande."); }
    chunks.push(value);
  }
  try { return JSON.parse(Buffer.concat(chunks).toString("utf8")); }
  catch { throw new PublicWodError(400, "No se han podido leer los datos."); }
}
export async function requireProfile() {
  const token = cookies().get(COOKIE)?.value;
  if (!token || !/^[A-Za-z0-9_-]{43}$/.test(token)) throw new PublicWodError(401, "Abre tu enlace de acceso o crea tu perfil para continuar.");
  const profile = await prisma.publicWodProfile.findUnique({ where: { tokenHash: hashToken(token) } });
  if (!profile || profile.expiresAt <= new Date()) throw new PublicWodError(401, "Tu acceso ha caducado. Abre un enlace válido o crea un nuevo perfil.");
  return profile;
}
export async function touchProfile(id: string) {
  await prisma.publicWodProfile.update({ where: { id }, data: { lastUsedAt: new Date(), expiresAt: expiresAt() } });
  const token = cookies().get(COOKIE)?.value;
  if (token) setCookie(token);
}
export function entryDTO(row: PublicWodEntry): EntryDTO {
  return { id: row.id, createdAt: row.createdAt.toISOString(), rawText: row.rawText, readiness: row.readiness, painBefore: JSON.parse(row.inputJson).painBefore, completedAt: row.completedAt?.toISOString() || null, result: JSON.parse(row.resultJson), feedback: row.feedbackJson ? JSON.parse(row.feedbackJson) : null };
}
export async function profileDTO(row: PublicWodProfile, offset = 0): Promise<ProfileDTO> {
  const entries = await prisma.publicWodEntry.findMany({ where: { profileId: row.id }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], skip: offset, take: 21 });
  return { id: row.id, name: row.name, phone: row.phone, profile: profileSchema.parse(JSON.parse(row.profileJson)), selfTest: row.selfTestJson ? selfTestSchema.parse(JSON.parse(row.selfTestJson)) : null,
    marketingConsent: !!row.marketingConsentAt, entries: entries.slice(0, 20).map(entryDTO), hasMore: entries.length > 20 };
}
export async function rateLimit(req: NextRequest, action: string, limit: number, seconds: number, profileId?: string) {
  const ip = req.headers.get("x-real-ip") || req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  const bucket = Math.floor(Date.now() / (seconds * 1000));
  const key = hashToken(`${action}:${profileId || ip}:${bucket}`);
  // Atomic upsert prevents a parallel-request race and survives cold starts.
  const row = await prisma.publicWodRateLimit.upsert({ where: { key }, create: { key, count: 1, expiresAt: new Date((bucket + 1) * seconds * 1000) }, update: { count: { increment: 1 } } });
  if (row.count > limit) throw new PublicWodError(429, "Has hecho varias solicitudes seguidas. Espera un poco y vuelve a intentarlo.");
  if (Math.random() < 0.02) await prisma.publicWodRateLimit.deleteMany({ where: { expiresAt: { lt: new Date() } } });
}
export function canReadWodLeads(user: Awaited<ReturnType<typeof getActiveProfessional>>) {
  return !!user && hasAnyRole(user, ["ceo", "head_success", "fisio", "setter", "closer"]);
}
export function canReadWodHealth(user: NonNullable<Awaited<ReturnType<typeof getActiveProfessional>>>) {
  return hasAnyRole(user, ["ceo", "head_success", "fisio"]);
}
export async function requireWodStaff() {
  const user = await getActiveProfessional();
  if (!user) throw new PublicWodError(401, "Inicia sesión.");
  if (!canReadWodLeads(user)) throw new PublicWodError(403, "No tienes acceso a estos leads.");
  return user;
}
export function json(data: unknown, status = 200) { return NextResponse.json(data, { status, headers: PRIVATE_HEADERS }); }
export function failure(error: unknown) {
  if (error instanceof PublicWodError) return json({ error: error.message }, error.status);
  if (error && typeof error === "object" && "issues" in error) return json({ error: "Revisa las respuestas obligatorias y el formato de los datos." }, 400);
  // No clinical payload, provider errors, connection strings or tokens in logs/responses.
  console.error("[public-wod] Request failed", error && typeof error === "object" && "code" in error ? String(error.code) : "internal");
  return json({ error: "No hemos podido guardar los cambios. Inténtalo de nuevo en un momento." }, 503);
}
