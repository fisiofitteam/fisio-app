/**
 * POST /api/fisio-ai/chat — chat con Fisio IA.
 *
 * Body: { messages: [{role: "user" | "assistant", content: string}] }
 *   → devuelve { reply: string }
 *
 * Se envía como system prompt el brief guardado en FisioAiBrief. El model
 * usado es Claude Sonnet 4.6 (mayor calidad, ideal para brainstorming y
 * ayuda a fisios). Restricción: solo CEO mientras estamos en beta.
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getActiveProfessional } from "@/lib/session";

const MODEL = "claude-sonnet-4-6";
const MAX_TOKENS = 2048;

type ChatMessage = { role: "user" | "assistant"; content: string };

export async function POST(req: NextRequest) {
  const user = await getActiveProfessional();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (user.role !== "ceo") return NextResponse.json({ error: "Forbidden — solo CEO por ahora" }, { status: 403 });

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "ANTHROPIC_API_KEY no configurado en el server" }, { status: 500 });
  }

  const { messages } = await req.json().catch(() => ({}));
  if (!Array.isArray(messages) || messages.length === 0) {
    return NextResponse.json({ error: "messages requerido" }, { status: 400 });
  }
  const clean: ChatMessage[] = messages
    .filter((m: any) => (m?.role === "user" || m?.role === "assistant") && typeof m?.content === "string" && m.content.trim())
    .map((m: any) => ({ role: m.role, content: m.content.trim() }));
  if (clean.length === 0) {
    return NextResponse.json({ error: "sin mensajes válidos" }, { status: 400 });
  }

  const brief = await (prisma as any).fisioAiBrief.findFirst({ orderBy: { createdAt: "asc" } });
  const systemPrompt = (brief?.content ?? "").trim() ||
    // Fallback minimalista si el CEO aún no ha guardado brief.
    "Eres Fisio IA, asistente para el equipo de FisioFit. Ayudas a preparar llamadas de optimización y renovación, resolver casos de pacientes difíciles y redactar mensajes. Responde en español, breve y directo, con foco práctico.";

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: MAX_TOKENS,
      system: systemPrompt,
      messages: clean,
    }),
  });

  if (!res.ok) {
    const t = await res.text().catch(() => "");
    return NextResponse.json({ error: `Anthropic API ${res.status}: ${t.slice(0, 300)}` }, { status: 502 });
  }
  const data = await res.json();
  const reply: string = data?.content?.[0]?.text ?? "";
  if (!reply) return NextResponse.json({ error: "La IA no devolvió texto" }, { status: 502 });
  return NextResponse.json({ reply });
}
