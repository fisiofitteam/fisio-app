import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getActiveProfessional } from "@/lib/session";

/**
 * PATCH /api/professional/compensation-irpf
 *   { professionalId, irpfRate }  → upsert del tipo de retención del
 *   profesional. Lo pueden cambiar el CEO (de cualquiera) o el propio
 *   profesional (solo el suyo). Rango 0-30% como salvaguarda.
 *
 * Se guarda en Compensation.irpfRate — así las facturas futuras ya
 * salen con el nuevo tipo por defecto. Para facturas antiguas se
 * recalcula el total con el valor actual (es lo que esperamos:
 * cuando pagas con un porcentaje, es el actual).
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Schema = z.object({
  professionalId: z.string().min(1),
  irpfRate: z.number().int().min(0).max(30),
});

export async function PATCH(req: NextRequest) {
  const user = await getActiveProfessional();
  if (!user) return NextResponse.json({ error: "Login requerido" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const parsed = Schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Payload inválido" },
      { status: 400 },
    );
  }

  if (user.role !== "ceo" && user.id !== parsed.data.professionalId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const row = await (prisma as any).compensation.upsert({
      where: { professionalId: parsed.data.professionalId },
      update: { irpfRate: parsed.data.irpfRate, updatedById: user.id },
      create: {
        professionalId: parsed.data.professionalId,
        irpfRate: parsed.data.irpfRate,
        updatedById: user.id,
      },
    });
    return NextResponse.json({ ok: true, irpfRate: row.irpfRate });
  } catch (e: any) {
    const msg = String(e?.message ?? e);
    return NextResponse.json(
      {
        ok: false,
        error: msg,
        hint: /does not exist|irpfRate/i.test(msg)
          ? "Columna irpfRate no existe. Corre /api/admin/migrate-team-invoice-meta."
          : undefined,
      },
      { status: 500 },
    );
  }
}
