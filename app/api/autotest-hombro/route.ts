import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getClientIp, maybeCleanupBuckets, rateLimit } from "@/lib/semaforo/rate-limit";

/**
 * POST /api/autotest-hombro — crea un registro EN_CURSO del autotest.
 *
 * El cliente llama a este endpoint al pulsar "Empezar". Devuelve el id,
 * con el que seguirá PATCH-ándo progreso y cierre. Rate limit: 5/min/IP
 * para no abrir arbitrariamente desde reels.
 *
 * Honeypot anti-bots: campo `website` que debe venir vacío. Los bots lo
 * rellenan por costumbre, los humanos no lo ven.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CONSENT_VERSION = "v1";

const Schema = z.object({
  instagram: z.string().max(60).nullable().optional(),
  campana: z.string().max(80).nullable().optional(),
  consentimiento: z.literal(true),
  website: z.string().max(0, { message: "Fuera honeypot" }).optional(),
});

function sanitizeInstagram(raw?: string | null): string | null {
  if (!raw) return null;
  const clean = raw.trim().replace(/^@+/, "").toLowerCase();
  return /^[a-z0-9._]{1,30}$/.test(clean) ? clean : null;
}
function sanitizeCampaign(raw?: string | null): string | null {
  if (!raw) return null;
  const clean = raw.trim().slice(0, 80);
  return clean || null;
}

export async function POST(req: NextRequest) {
  maybeCleanupBuckets();
  const ip = getClientIp(req);
  if (!rateLimit(ip, "autotest:create", { limit: 5, windowMs: 60_000 })) {
    return NextResponse.json({ error: "Demasiadas peticiones" }, { status: 429 });
  }

  const body = await req.json().catch(() => null);
  const parsed = Schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Payload inválido" },
      { status: 400 },
    );
  }

  const userAgent = req.headers.get("user-agent")?.slice(0, 300) ?? null;

  const row = await (prisma as any).autotestHombroResponse.create({
    data: {
      instagram: sanitizeInstagram(parsed.data.instagram ?? null),
      campana: sanitizeCampaign(parsed.data.campana ?? null),
      estado: "EN_CURSO",
      ultimoPaso: 0,
      consentimientoAt: new Date(),
      consentimientoVersion: CONSENT_VERSION,
      userAgent,
    },
    select: { id: true },
  });

  return NextResponse.json({ id: row.id });
}
