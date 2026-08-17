/**
 * POST /api/ai/generate-session
 *
 * Genera una sesión ADVANCE con Claude Opus 4.7 usando el brief del kind y
 * un few-shot de 3-5 ejemplos del banco. Solo CEO / head_success.
 *
 * Body: { kind, prompt, dayOfWeek?, durationMin?, extraContext? }
 * Res:  { ok: true, session, meta } | { error }
 */
import { NextRequest, NextResponse } from "next/server";
import { getActiveProfessional } from "@/lib/session";
import { generateSession } from "@/lib/ai-generate-session";
import { isBriefKind } from "@/lib/ai-training-brief";
import { buildPatientBrief } from "@/lib/patient-brief";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const user = await getActiveProfessional();
  if (!user || (user.role !== "ceo" && user.role !== "head_success")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: any;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Body inválido" }, { status: 400 }); }

  if (!isBriefKind(body?.kind)) {
    return NextResponse.json({ error: "kind requerido (accesorios | entrenamiento)" }, { status: 400 });
  }
  const prompt = typeof body?.prompt === "string" ? body.prompt.trim() : "";
  if (!prompt) return NextResponse.json({ error: "prompt requerido" }, { status: 400 });
  if (prompt.length > 4000) return NextResponse.json({ error: "prompt demasiado largo (>4000 chars)" }, { status: 400 });

  const dayOfWeek = Number.isInteger(body?.dayOfWeek) && body.dayOfWeek >= 1 && body.dayOfWeek <= 7
    ? Number(body.dayOfWeek) : null;
  const durationMin = Number.isInteger(body?.durationMin) && body.durationMin >= 5 && body.durationMin <= 240
    ? Number(body.durationMin) : null;
  const extraContext = typeof body?.extraContext === "string" ? body.extraContext.slice(0, 2000) : null;

  // Si viene patientId, cargamos la ficha del paciente (anamnesis, adaptaciones,
  // diagnóstico, últimas métricas) y la anteponemos al extraContext para que
  // la sesión salga personalizada. Silencioso si falla — no bloquea la generación.
  let extraContextWithPatient = extraContext ?? "";
  const patientId = typeof body?.patientId === "string" ? body.patientId : null;
  if (patientId) {
    const patientBrief = await buildPatientBrief(patientId).catch(() => null);
    if (patientBrief) {
      // Cap total del contexto para no petar el context window del modelo.
      // 8000 chars ≈ 2000 tokens, suficientemente denso pero manejable.
      const brief = patientBrief.slice(0, 8000);
      extraContextWithPatient = `FICHA DEL PACIENTE:\n${brief}\n\n${extraContextWithPatient}`.trim().slice(0, 12000);
    }
  }

  try {
    const result = await generateSession({
      kind: body.kind,
      prompt,
      dayOfWeek,
      durationMin,
      extraContext: extraContextWithPatient || null,
    });
    return NextResponse.json({ ok: true, ...result });
  } catch (e: any) {
    console.error("[generate-session] error:", e);
    return NextResponse.json({ error: e?.message ?? "Error generando la sesión" }, { status: 502 });
  }
}
