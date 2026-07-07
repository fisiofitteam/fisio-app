/**
 * POST /api/ai/marketer
 *
 * Consultor de marketing de contenido con Claude Opus 4.7. Recibe pregunta
 * + snapshot de métricas y devuelve respuesta en markdown.
 *
 * Solo CEO y setter (los mismos roles que acceden a /fisio/contenido/metricas).
 */
import { NextRequest, NextResponse } from "next/server";
import { getActiveProfessional } from "@/lib/session";
import { askMarketer, type MarketerContext } from "@/lib/ai-marketer";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const user = await getActiveProfessional();
  if (!user || (user.role !== "ceo" && user.role !== "setter" && user.role !== "head_success")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: any;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Body inválido" }, { status: 400 }); }

  const question = typeof body?.question === "string" ? body.question.trim() : "";
  if (!question) return NextResponse.json({ error: "question requerida" }, { status: 400 });
  if (question.length > 4000) return NextResponse.json({ error: "question demasiado larga (>4000 chars)" }, { status: 400 });
  if (!body?.context || typeof body.context !== "object") {
    return NextResponse.json({ error: "context requerido" }, { status: 400 });
  }

  try {
    const result = await askMarketer({ question, context: body.context as MarketerContext });
    return NextResponse.json({ ok: true, ...result });
  } catch (e: any) {
    console.error("[ai/marketer] error:", e);
    return NextResponse.json({ error: e?.message ?? "Error consultando al Marketer IA" }, { status: 502 });
  }
}
