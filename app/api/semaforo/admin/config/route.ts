/**
 * GET  /api/semaforo/admin/config?tipo=hombro → devuelve la config del tipo.
 * PATCH /api/semaforo/admin/config?tipo=hombro → upsert de la fila del tipo.
 *
 * `?tipo=` default "hombro" para compat con el panel original. Si viene
 * un slug no reconocido, se cae a "hombro". El `id` de la fila en DB
 * coincide con el tipo (ids: "hombro", "lumbar", …). La fila legacy
 * "singleton" también se trata como "hombro" en la lectura.
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getActiveProfessional } from "@/lib/session";
import { canAccessSemaforoPanel } from "@/lib/semaforo/access";
import { getSemaforoConfig } from "@/lib/semaforo/get-config";
import { parseTipo } from "@/lib/semaforo/tipos";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const user = await getActiveProfessional();
  if (!user) return NextResponse.json({ error: "Login requerido" }, { status: 401 });
  if (!canAccessSemaforoPanel(user.role)) {
    return NextResponse.json({ error: "Sin permiso" }, { status: 403 });
  }
  const tipo = parseTipo(req.nextUrl.searchParams.get("tipo"));
  const config = await getSemaforoConfig(tipo);
  return NextResponse.json({ ok: true, config });
}

export async function PATCH(req: NextRequest) {
  const user = await getActiveProfessional();
  if (!user) return NextResponse.json({ error: "Login requerido" }, { status: 401 });
  if (!canAccessSemaforoPanel(user.role)) {
    return NextResponse.json({ error: "Sin permiso" }, { status: 403 });
  }

  const tipo = parseTipo(req.nextUrl.searchParams.get("tipo"));
  const body = await req.json().catch(() => ({}));
  const data: {
    tipo?: string;
    quizFunnelEnabled?: boolean;
    funnelWhatsappTemplate?: string;
    videoUrlVerde?: string | null;
    videoUrlAmbar?: string | null;
    videoUrlRojo?: string | null;
    videoUrlAlarma?: string | null;
    updatedById?: string;
  } = {
    tipo,
    updatedById: user.id,
  };
  if (typeof body?.quizFunnelEnabled === "boolean") data.quizFunnelEnabled = body.quizFunnelEnabled;
  if (typeof body?.funnelWhatsappTemplate === "string") {
    data.funnelWhatsappTemplate = body.funnelWhatsappTemplate.slice(0, 2000);
  }
  // Vídeos por color. String vacío = "borrar" (guardamos null); resto se
  // guarda tal cual con cap defensivo. La normalización a embed la hace
  // el componente VideoBlock del cliente.
  const videoKeys = [
    ["videoUrlVerde", "videoUrlVerde"],
    ["videoUrlAmbar", "videoUrlAmbar"],
    ["videoUrlRojo", "videoUrlRojo"],
    ["videoUrlAlarma", "videoUrlAlarma"],
  ] as const;
  for (const [inKey, outKey] of videoKeys) {
    const v = body?.[inKey];
    if (typeof v === "string") {
      const trimmed = v.trim().slice(0, 500);
      (data as any)[outKey] = trimmed.length > 0 ? trimmed : null;
    }
  }

  try {
    // Para el hombro mantenemos id="singleton" (compat con lectura legacy).
    // Para el resto de tipos el id es el propio tipo. En ambos casos
    // guardamos `tipo` para que las lecturas nuevas por `tipo` funcionen.
    const id = tipo === "hombro" ? "singleton" : tipo;
    const row = await (prisma as any).semaforoConfig.upsert({
      where: { id },
      update: data,
      create: { id, ...data },
    });
    return NextResponse.json({ ok: true, config: row });
  } catch (e: any) {
    const msg = String(e?.message ?? e);
    return NextResponse.json(
      {
        ok: false,
        error: msg,
        hint: /does not exist|SemaforoConfig|column.*tipo/i.test(msg)
          ? "La tabla o la columna `tipo` no existe. Corre /api/admin/migrate-semaforo-config y /api/admin/migrate-semaforo-tipo una vez."
          : undefined,
      },
      { status: 500 },
    );
  }
}
