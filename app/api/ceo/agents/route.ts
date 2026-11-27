import { NextRequest, NextResponse } from "next/server";
import { founderSession } from "@/lib/grok-ceo-exchange";
import { agentEngine } from "@/lib/ceo-agents/engine";
import { AgentError, commandSchema } from "@/lib/ceo-agents/contract";
export const dynamic = "force-dynamic";
export const maxDuration = 120;
const json = (v: unknown, status = 200) => NextResponse.json(v, { status, headers: { "Cache-Control": "private, no-store" } });
export async function GET() {
  const user = await founderSession(); if (!user) return json({ error: "Forbidden" }, 403);
  try { return json(await agentEngine.overview(user.id)); } catch { return json({ error: "Motor temporalmente no disponible." }, 503); }
}
export async function POST(req: NextRequest) {
  if (process.env.VERCEL_ENV && process.env.VERCEL_ENV !== "production") return json({ error: "Escritura de agentes desactivada en previews." }, 403);
  const user = await founderSession(); if (!user) return json({ error: "Forbidden" }, 403);
  if (req.headers.get("origin") !== req.nextUrl.origin || req.headers.get("sec-fetch-site") === "cross-site") return json({ error: "Forbidden" }, 403);
  if (!req.headers.get("content-type")?.startsWith("application/json")) return json({ error: "JSON required" }, 415);
  const text = await req.text(); if (Buffer.byteLength(text) > 14000) return json({ error: "Petición demasiado grande." }, 413);
  let raw: unknown; try { raw = JSON.parse(text); } catch { return json({ error: "JSON inválido." }, 400); }
  const parsed = commandSchema.safeParse(raw); if (!parsed.success) return json({ error: "Petición inválida. Comprueba campos y límites." }, 400);
  try { return json(await agentEngine.command(user.id, parsed.data)); }
  catch (error: any) { if (error instanceof AgentError) return json({ error: error.message }, error.status); if (["P2002", "P2034"].includes(error?.code)) return json({ error: "Cambio simultáneo; actualiza antes de reintentar." }, 409); return json({ error: "No se pudo completar la petición." }, 503); }
}
