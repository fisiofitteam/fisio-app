/**
 * GET  /api/autotest-hombro/admin/config → devuelve la config singleton.
 * PATCH /api/autotest-hombro/admin/config → upsert de la fila singleton.
 *
 * Solo profesionales con acceso al panel del autotest. Upsert para que
 * la primera edición materialice la fila sin seed previo.
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getActiveProfessional } from "@/lib/session";
import { canAccessAutotestPanel } from "@/lib/autotest-hombro/access";
import { getAutotestConfig } from "@/lib/autotest-hombro/get-config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const user = await getActiveProfessional();
  if (!user || !canAccessAutotestPanel(user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const config = await getAutotestConfig();
  return NextResponse.json({ ok: true, config });
}

export async function PATCH(req: NextRequest) {
  const user = await getActiveProfessional();
  if (!user || !canAccessAutotestPanel(user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = (await req.json().catch(() => ({}))) as {
    videoUrlTest1?: string | null;
    videoUrlTest2?: string | null;
    videoUrlTest3?: string | null;
    whatsappTemplate?: string | null;
    quizFunnelEnabled?: boolean;
  };

  const data: Record<string, unknown> = {};
  for (const [in_, out] of [
    ["videoUrlTest1", "videoUrlTest1"],
    ["videoUrlTest2", "videoUrlTest2"],
    ["videoUrlTest3", "videoUrlTest3"],
  ] as const) {
    const v = (body as any)[in_];
    if (typeof v === "string") {
      const trimmed = v.trim().slice(0, 500);
      data[out] = trimmed.length > 0 ? trimmed : null;
    }
  }
  if (typeof body.whatsappTemplate === "string") {
    data.whatsappTemplate = body.whatsappTemplate.slice(0, 2000) || null;
  }
  if (typeof body.quizFunnelEnabled === "boolean") {
    data.quizFunnelEnabled = body.quizFunnelEnabled;
  }
  data.updatedById = user.id;

  try {
    const row = await (prisma as any).autotestHombroConfig.upsert({
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
        hint: /does not exist|AutotestHombroConfig/i.test(msg)
          ? "La tabla no existe. Corre /api/admin/migrate-autotest-hombro una vez."
          : undefined,
      },
      { status: 500 },
    );
  }
}
