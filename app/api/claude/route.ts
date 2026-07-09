/**
 * POST /api/claude
 *
 * Proxy de servidor a la API de Anthropic para el Story Maker (que llama a
 * este endpoint con `stream: true`, SSE). La clave ANTHROPIC_API_KEY vive
 * solo en el servidor y nunca se expone al navegador.
 *
 * Dos modos según el body:
 *   - stream: true  → passthrough del SSE de Anthropic (streaming de tokens).
 *   - stream: false → respuesta JSON completa con guardia de timeout.
 *
 * Solo staff autenticado con acceso a Contenido (mismo criterio que
 * /storymaker que sirve el HTML).
 */
import { NextRequest, NextResponse } from "next/server";
import { getActiveProfessional } from "@/lib/session";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 120;

export async function POST(req: NextRequest) {
  const user = await getActiveProfessional();
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  if (user.role !== "ceo" && user.role !== "setter") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: "ANTHROPIC_API_KEY no configurada" }, { status: 500 });
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Body inválido" }, { status: 400 });
  }
  const { model, max_tokens, messages, system, stream } = body;
  if (!model || !messages) {
    return NextResponse.json({ error: "model y messages son obligatorios" }, { status: 400 });
  }
  const payload: Record<string, unknown> = {
    model,
    max_tokens: max_tokens ?? 2000,
    messages,
  };
  if (system) payload.system = system;

  // Modo streaming (Story Maker típicamente): passthrough SSE tal cual.
  if (stream === true) {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": process.env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({ ...payload, stream: true }),
    });
    if (!res.ok || !res.body) {
      const data = await res.json().catch(() => ({ error: { message: "Error de la API de Anthropic" } }));
      return NextResponse.json(data, { status: res.status });
    }
    return new Response(res.body, {
      status: 200,
      headers: {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
      },
    });
  }

  // No-stream: guardia de timeout para no chocar con el límite de funciones
  // síncronas del hosting (Vercel corta a 60s en free; 300s en pro).
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), 55_000);
  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": process.env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify(payload),
      signal: ac.signal,
    });
    clearTimeout(timer);
    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch (e: unknown) {
    clearTimeout(timer);
    if (e instanceof Error && e.name === "AbortError") {
      return NextResponse.json(
        { error: "La generación tardó demasiado. Prueba con una petición más corta." },
        { status: 504 },
      );
    }
    const message = e instanceof Error ? e.message : "Error inesperado";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
