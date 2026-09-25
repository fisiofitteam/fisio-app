/**
 * GET  /api/semaforo/admin/config → devuelve la config actual del semáforo.
 * PATCH /api/semaforo/admin/config → actualiza campos (upsert singleton).
 *
 * Solo roles con acceso al panel de lead magnets.
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getActiveProfessional } from "@/lib/session";
import { canAccessSemaforoPanel } from "@/lib/semaforo/access";
import { getSemaforoConfig } from "@/lib/semaforo/get-config";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  const user = await getActiveProfessional();
  if (!user) return NextResponse.json({ error: "Login requerido" }, { status: 401 });
  if (!canAccessSemaforoPanel(user.role)) {
    return NextResponse.json({ error: "Sin permiso" }, { status: 403 });
  }
  const config = await getSemaforoConfig();
  return NextResponse.json({ ok: true, config });
}

export async function PATCH(req: NextRequest) {
  const user = await getActiveProfessional();
  if (!user) return NextResponse.json({ error: "Login requerido" }, { status: 401 });
  if (!canAccessSemaforoPanel(user.role)) {
    return NextResponse.json({ error: "Sin permiso" }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const data: { quizFunnelEnabled?: boolean; funnelWhatsappTemplate?: string; updatedById?: string } = {
    updatedById: user.id,
  };
  if (typeof body?.quizFunnelEnabled === "boolean") data.quizFunnelEnabled = body.quizFunnelEnabled;
  if (typeof body?.funnelWhatsappTemplate === "string") {
    data.funnelWhatsappTemplate = body.funnelWhatsappTemplate.slice(0, 2000);
  }

  try {
    const row = await (prisma as any).semaforoConfig.upsert({
      where: { id: "singleton" },
      update: data,
      create: { id: "singleton", ...data },
    });
    return NextResponse.json({ ok: true, config: row });
  } catch (e: any) {
    const msg = String(e?.message ?? e);
    return NextResponse.json(
      {
        ok: false,
        error: msg,
        hint: /does not exist|SemaforoConfig/i.test(msg)
          ? "La tabla SemaforoConfig no existe. Corre /api/admin/migrate-semaforo-config una vez."
          : undefined,
      },
      { status: 500 },
    );
  }
}
