/**
 * POST /api/fisio-ai/chat — chat con un agente concreto de Fisio IA.
 *
 * Body: { agentSlug: string, messages: [{role: "user" | "assistant", content: string}] }
 *   → devuelve { reply: string }
 *
 * El system prompt es el `brief` del agente indicado por `agentSlug`. Si el
 * agente no existe o su brief está vacío, cae a un fallback minimalista.
 * Modelo: Claude Sonnet 4.6 (calidad para brainstorming).
 * Restricción: solo CEO mientras estamos en beta.
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getActiveProfessional } from "@/lib/session";
import { buildPatientBrief } from "@/lib/patient-brief";

const MODEL = "claude-sonnet-4-6";
const MAX_TOKENS = 2048;

type ChatMessage = { role: "user" | "assistant"; content: string };

export async function POST(req: NextRequest) {
  const user = await getActiveProfessional();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "ANTHROPIC_API_KEY no configurado en el server" }, { status: 500 });
  }

  const { messages, agentSlug, patientId } = await req.json().catch(() => ({}));
  if (!Array.isArray(messages) || messages.length === 0) {
    return NextResponse.json({ error: "messages requerido" }, { status: 400 });
  }
  if (typeof agentSlug !== "string" || !agentSlug.trim()) {
    return NextResponse.json({ error: "agentSlug requerido" }, { status: 400 });
  }
  const clean: ChatMessage[] = messages
    .filter((m: any) => (m?.role === "user" || m?.role === "assistant") && typeof m?.content === "string" && m.content.trim())
    .map((m: any) => ({ role: m.role, content: m.content.trim() }));
  if (clean.length === 0) {
    return NextResponse.json({ error: "sin mensajes válidos" }, { status: 400 });
  }

  const agent = await (prisma as any).fisioAiAgent.findUnique({ where: { slug: agentSlug } });
  // Verificamos permisos: el usuario debe estar en allowedRoles (o CEO, o público).
  if (agent) {
    const { canAccessAgent } = await import("@/lib/fisio-ai-agents");
    if (!canAccessAgent(user.role, agent.allowedRoles)) {
      return NextResponse.json({ error: "No tienes acceso a este agente" }, { status: 403 });
    }
  }
  let systemPrompt = (agent?.brief ?? "").trim() ||
    "Eres Fisio IA, asistente para el equipo de FisioFit. Responde en español, breve y directo, con foco práctico.";

  // Si el agente admite contexto de paciente y el cliente envió patientId,
  // añadimos la ficha completa al final del system prompt. Así el agente
  // puede referirse a datos concretos (adaptaciones, PRs, últimos WODs).
  if (agent?.usesPatientContext && typeof patientId === "string" && patientId) {
    const brief = await buildPatientBrief(patientId).catch(() => null);
    if (brief) {
      systemPrompt += `\n\n---\n\n**Contexto del paciente activo** (el fisio te está preguntando sobre este paciente concreto — usa estos datos siempre que sean relevantes):\n\n${brief}`;
    }
  }

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
