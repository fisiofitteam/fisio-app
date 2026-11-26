import { NextResponse } from "next/server";
import { getActiveProfessional } from "@/lib/session";
import { SupportError } from "./errors";
import type { z } from "zod";

export const supportJson = (data: unknown, status = 200) => NextResponse.json(data, { status, headers: { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } });
export async function supportActor() {
  const actor = await getActiveProfessional();
  if (!actor) throw new SupportError(401, "Inicia sesión como miembro del equipo.");
  return actor;
}
export async function supportBody<T>(req: Request, schema: z.ZodType<T>): Promise<T> {
  const origin = req.headers.get("origin");
  if (origin && origin !== new URL(req.url).origin) throw new SupportError(403, "Origen no permitido.");
  if (!req.headers.get("content-type")?.startsWith("application/json")) throw new SupportError(400, "Formato no válido.");
  const raw = await req.text();
  if (Buffer.byteLength(raw) > 48000) throw new SupportError(413, "El mensaje es demasiado largo.");
  let parsed: unknown;
  try { parsed = JSON.parse(raw); } catch { throw new SupportError(400, "Revisa el contenido del formulario."); }
  const result = schema.safeParse(parsed);
  if (!result.success) throw new SupportError(400, "Revisa los campos y la longitud del mensaje.");
  return result.data;
}
export async function supportRoute(run: () => Promise<unknown>) {
  try { return supportJson(await run()); } catch (error) {
    if (error instanceof SupportError) return supportJson({ error: error.message }, error.status);
    if (error && typeof error === "object" && "code" in error && ["P2002", "P2034"].includes(String(error.code))) return supportJson({ error: "Esta acción ya se ha procesado o ha cambiado. Actualiza antes de reintentar." }, 409);
    return supportJson({ error: "El soporte no está disponible en este momento. Puedes volver a intentarlo." }, 503);
  }
}
