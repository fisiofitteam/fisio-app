import { NextRequest, NextResponse } from "next/server";
import { founderSession } from "@/lib/grok-ceo-exchange";
import { directionSettings, priorityCreate, priorityUpdate } from "@/lib/ceo-direction-contract";
import { createPriority, DirectionError, directionOverview, directionSummary, saveDirectionSettings, updatePriority } from "@/lib/ceo-direction";
export const dynamic = "force-dynamic";
const json = (data: unknown, status = 200) => NextResponse.json(data, { status, headers: { "Cache-Control": "private, no-store" } });
export async function GET(req: NextRequest) {
  const user = await founderSession();
  if (!user) return json({ error: "Forbidden" }, 403);
  try { return json(await (req.nextUrl.searchParams.get("summary") === "1" ? directionSummary(user.id) : directionOverview(user.id))); } catch { return json({ error: "Dirección temporalmente no disponible." }, 503); }
}
async function mutate(req: NextRequest, action: "create" | "update" | "settings") {
  const user = await founderSession();
  if (!user) return json({ error: "Forbidden" }, 403);
  if (req.headers.get("origin") && req.headers.get("origin") !== req.nextUrl.origin) return json({ error: "Forbidden" }, 403);
  if (!req.headers.get("content-type")?.startsWith("application/json")) return json({ error: "JSON required" }, 415);
  const raw = await req.text();
  if (Buffer.byteLength(raw) > 8000) return json({ error: "Petición demasiado grande." }, 413);
  let body: unknown; try { body = JSON.parse(raw); } catch { return json({ error: "JSON inválido." }, 400); }
  try {
    if (action === "create") { const p = priorityCreate.safeParse(body); if (!p.success) return json({ error: "Prioridad inválida." }, 400); return json(await createPriority(user.id, p.data)); }
    if (action === "update") { const p = priorityUpdate.safeParse(body); if (!p.success) return json({ error: "Revisión inválida. Al cerrar, indica el resultado o motivo." }, 400); return json(await updatePriority(user.id, p.data)); }
    const p = directionSettings.safeParse(body); if (!p.success) return json({ error: "Objetivos inválidos." }, 400); return json(await saveDirectionSettings(user.id, p.data));
  } catch (e) {
    if (e instanceof DirectionError) return json({ error: e.message }, e.status);
    if (e && typeof e === "object" && "code" in e && ["P2002", "P2034"].includes(String(e.code))) return json({ error: "Cambio simultáneo. Actualiza antes de reintentar." }, 409);
    return json({ error: "No se pudo guardar el cambio." }, 503);
  }
}
export const POST = (req: NextRequest) => mutate(req, "create");
export const PATCH = (req: NextRequest) => mutate(req, "update");
export const PUT = (req: NextRequest) => mutate(req, "settings");
