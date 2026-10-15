import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getActiveProfessional } from "@/lib/session";

/**
 * PATCH /api/team-invoice-meta
 *
 * Upsert del override manual del número de factura del equipo.
 * Body: { professionalId, year, month, invoiceNumber }.
 *
 * Puede ejecutarlo el CEO (puede editar cualquier factura) o el propio
 * profesional (solo la suya). Si invoiceNumber viene vacío, borramos
 * el override y la factura vuelve al numerado automático "YYYY/NNN".
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Schema = z.object({
  professionalId: z.string().min(1),
  year: z.number().int().min(2000).max(2100),
  month: z.number().int().min(0).max(11),
  invoiceNumber: z.string().max(50),
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

  const { professionalId, year, month, invoiceNumber } = parsed.data;
  const clean = invoiceNumber.trim();

  try {
    if (clean.length === 0) {
      // Vacío → vuelve al número automático. deleteMany porque podría no existir.
      await (prisma as any).teamInvoiceMeta.deleteMany({
        where: { professionalId, year, month },
      });
      return NextResponse.json({ ok: true, invoiceNumber: null });
    }
    const row = await (prisma as any).teamInvoiceMeta.upsert({
      where: { professionalId_year_month: { professionalId, year, month } },
      update: { invoiceNumber: clean, updatedById: user.id },
      create: { professionalId, year, month, invoiceNumber: clean, updatedById: user.id },
    });
    return NextResponse.json({ ok: true, invoiceNumber: row.invoiceNumber });
  } catch (e: any) {
    const msg = String(e?.message ?? e);
    return NextResponse.json(
      {
        ok: false,
        error: msg,
        hint: /does not exist|TeamInvoiceMeta/i.test(msg)
          ? "La tabla no existe. Corre /api/admin/migrate-team-invoice-meta una vez."
          : undefined,
      },
      { status: 500 },
    );
  }
}
