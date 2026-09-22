import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { sanitizeInstagram, sanitizeCampaign, CONSENT_VERSION } from "@/lib/semaforo/config";
import { getClientIp, maybeCleanupBuckets, rateLimit } from "@/lib/semaforo/rate-limit";

/**
 * POST /api/semaforo — crea el registro al pulsar "Empezar el test".
 *
 * Público (sin login) — el middleware ya excluye /api/semaforo/*.
 * Guarda desde el primer momento para poder medir abandono en el
 * embudo. El consentimiento y su versión se persisten con timestamp.
 *
 * Anti-abuso mínimo: honeypot obligatorio vacío + rate limit por IP
 * (5 creaciones / minuto). El objetivo no es blindar contra un
 * atacante determinado, sino cortar bots superficiales.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CreateSchema = z.object({
  instagram: z.string().optional().nullable(),
  campana: z.string().optional().nullable(),
  // z.literal(true) obliga a que sea === true.
  consentimiento: z.literal(true),
  // Honeypot — cualquier valor no vacío rechaza la petición.
  website: z.string().max(0).optional().default(""),
});

export async function POST(req: NextRequest) {
  maybeCleanupBuckets();
  const ip = getClientIp(req);
  if (!rateLimit(ip, "semaforo:create", { limit: 5, windowMs: 60_000 })) {
    return NextResponse.json({ error: "Demasiadas peticiones. Espera un minuto." }, { status: 429 });
  }

  const body = await req.json().catch(() => null);
  const parsed = CreateSchema.safeParse(body);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const isConsent = issue?.path?.[0] === "consentimiento";
    return NextResponse.json(
      { error: isConsent ? "Debes aceptar el consentimiento para continuar" : (issue?.message ?? "Payload inválido") },
      { status: 400 },
    );
  }
  // Honeypot: si viene con algo, respondemos 201 falso para no dar
  // pistas al bot, pero no persistimos nada.
  if (parsed.data.website && parsed.data.website.length > 0) {
    return NextResponse.json({ id: "hp-" + Math.random().toString(36).slice(2, 10) }, { status: 201 });
  }

  const instagram = sanitizeInstagram(parsed.data.instagram);
  const campana = sanitizeCampaign(parsed.data.campana);
  const userAgent = req.headers.get("user-agent")?.slice(0, 500) ?? null;

  const created = await prisma.semaforoRespuesta.create({
    data: {
      instagram,
      campana,
      estado: "EN_CURSO",
      ultimoPaso: 0,
      respuestas: "{}",
      banderas: "[]",
      consentimientoAt: new Date(),
      consentimientoVersion: CONSENT_VERSION,
      userAgent,
    },
    select: { id: true },
  });

  return NextResponse.json({ id: created.id }, { status: 201 });
}
