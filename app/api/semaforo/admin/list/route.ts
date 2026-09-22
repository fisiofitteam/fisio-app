import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getActiveProfessional } from "@/lib/session";
import { canAccessSemaforoPanel } from "@/lib/semaforo/access";
import { Q } from "@/lib/semaforo/questions";

/**
 * GET /api/semaforo/admin/list
 *   ?from=YYYY-MM-DD&to=YYYY-MM-DD
 *   &color=VERDE|AMBAR|ROJO
 *   &estado=EN_CURSO|COMPLETADO|ALARMA
 *   &whatsapp=1|0        (1 = con click, 0 = sin click)
 *   &gestionado=1|0
 *   &campana=<texto>     (contiene)
 *   &q=<busqueda>        (nombre o instagram, contains)
 *   &format=csv          (opcional: descarga CSV con los filtros)
 *
 * Devuelve: { rows, kpis } donde kpis incluye conteos, distribución
 * por color, %CTR whatsapp por color y gráfico de abandono por paso.
 *
 * Solo managers y equipo de ventas (ceo/head_success/setter/closer).
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = {
  from?: Date;
  to?: Date;
  color?: "VERDE" | "AMBAR" | "ROJO";
  estado?: "EN_CURSO" | "COMPLETADO" | "ALARMA";
  whatsapp?: boolean;
  gestionado?: boolean;
  campana?: string;
  q?: string;
};

function parseParams(url: URL): Params {
  const p: Params = {};
  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");
  if (from && /^\d{4}-\d{2}-\d{2}$/.test(from)) p.from = new Date(from + "T00:00:00Z");
  if (to && /^\d{4}-\d{2}-\d{2}$/.test(to)) {
    // Fin de día inclusivo.
    const d = new Date(to + "T00:00:00Z");
    d.setUTCDate(d.getUTCDate() + 1);
    p.to = d;
  }
  const color = url.searchParams.get("color");
  if (color === "VERDE" || color === "AMBAR" || color === "ROJO") p.color = color;
  const estado = url.searchParams.get("estado");
  if (estado === "EN_CURSO" || estado === "COMPLETADO" || estado === "ALARMA") p.estado = estado;
  const wa = url.searchParams.get("whatsapp");
  if (wa === "1") p.whatsapp = true;
  else if (wa === "0") p.whatsapp = false;
  const gs = url.searchParams.get("gestionado");
  if (gs === "1") p.gestionado = true;
  else if (gs === "0") p.gestionado = false;
  const camp = url.searchParams.get("campana");
  if (camp && camp.trim()) p.campana = camp.trim().slice(0, 100);
  const q = url.searchParams.get("q");
  if (q && q.trim()) p.q = q.trim().slice(0, 100);
  return p;
}

function buildWhere(p: Params) {
  const where: any = {};
  if (p.from || p.to) {
    where.createdAt = {};
    if (p.from) where.createdAt.gte = p.from;
    if (p.to) where.createdAt.lt = p.to;
  }
  if (p.color) where.color = p.color;
  if (p.estado) where.estado = p.estado;
  if (p.whatsapp === true) where.whatsappClickAt = { not: null };
  else if (p.whatsapp === false) where.whatsappClickAt = null;
  if (p.gestionado !== undefined) where.gestionado = p.gestionado;
  if (p.campana) where.campana = { contains: p.campana, mode: "insensitive" };
  if (p.q) {
    where.OR = [
      { nombre: { contains: p.q, mode: "insensitive" } },
      { instagram: { contains: p.q.toLowerCase() } },
    ];
  }
  return where;
}

function csvEscape(v: unknown): string {
  const s = v == null ? "" : String(v);
  if (/[",\n;]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export async function GET(req: NextRequest) {
  const user = await getActiveProfessional();
  if (!user || !canAccessSemaforoPanel(user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const url = new URL(req.url);
  const params = parseParams(url);
  const where = buildWhere(params);
  const wantCsv = url.searchParams.get("format") === "csv";

  const rowsRaw = await prisma.semaforoRespuesta.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: wantCsv ? 10_000 : 500,
    select: {
      id: true,
      createdAt: true,
      instagram: true,
      nombre: true,
      telefono: true,
      campana: true,
      estado: true,
      ultimoPaso: true,
      color: true,
      banderas: true,
      movimientos: true,
      whatsappClickAt: true,
      gestionado: true,
      gestionadoPor: { select: { fullName: true } },
    },
  });

  const rows = rowsRaw.map((r) => {
    let banderas: string[] = [];
    let movimientos: Record<string, string> | null = null;
    try { banderas = r.banderas ? JSON.parse(r.banderas) : []; } catch {}
    try { movimientos = r.movimientos ? JSON.parse(r.movimientos) : null; } catch {}
    return {
      id: r.id,
      createdAt: r.createdAt.toISOString(),
      instagram: r.instagram,
      nombre: r.nombre,
      telefono: r.telefono,
      campana: r.campana,
      estado: r.estado,
      ultimoPaso: r.ultimoPaso,
      color: r.color,
      banderas,
      movimientos,
      whatsappClickAt: r.whatsappClickAt?.toISOString() ?? null,
      gestionado: r.gestionado,
      gestionadoPor: r.gestionadoPor?.fullName ?? null,
    };
  });

  if (wantCsv) {
    const header = [
      "fecha", "instagram", "nombre", "telefono", "campana",
      "estado", "color", "banderas", "overhead", "tirones", "empujes",
      "whatsapp_click", "gestionado", "gestionado_por",
    ].join(",");
    const lines = rows.map((r) => [
      new Date(r.createdAt).toISOString(),
      r.instagram ?? "",
      r.nombre ?? "",
      r.telefono ?? "",
      r.campana ?? "",
      r.estado,
      r.color ?? "",
      r.banderas.join("|"),
      r.movimientos?.overhead ?? "",
      r.movimientos?.tirones ?? "",
      r.movimientos?.empujes ?? "",
      r.whatsappClickAt ? "SI" : "NO",
      r.gestionado ? "SI" : "NO",
      r.gestionadoPor ?? "",
    ].map(csvEscape).join(","));
    const body = [header, ...lines].join("\n");
    return new NextResponse(body, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="semaforo-${Date.now()}.csv"`,
      },
    });
  }

  // ─── KPIs ────────────────────────────────────────────────────
  const total = rows.length;
  const iniciados = total; // todo lo del rango, sea cual sea su estado
  const completados = rows.filter((r) => r.estado === "COMPLETADO").length;
  const enCurso = rows.filter((r) => r.estado === "EN_CURSO").length;
  const alarmas = rows.filter((r) => r.estado === "ALARMA").length;
  const pctCompletado = iniciados > 0 ? Math.round((completados / iniciados) * 100) : 0;

  const colorCount = { VERDE: 0, AMBAR: 0, ROJO: 0 };
  for (const r of rows) {
    if (r.color && r.color in colorCount) colorCount[r.color as keyof typeof colorCount]++;
  }

  // %CTR WhatsApp por color (sobre completados de ese color)
  const ctrByColor: Record<string, { total: number; clicks: number; pct: number }> = {};
  for (const c of ["VERDE", "AMBAR", "ROJO"] as const) {
    const bucket = rows.filter((r) => r.color === c);
    const clicks = bucket.filter((r) => r.whatsappClickAt).length;
    ctrByColor[c] = {
      total: bucket.length,
      clicks,
      pct: bucket.length > 0 ? Math.round((clicks / bucket.length) * 100) : 0,
    };
  }
  // También el CTR de la pantalla de ALARMA
  const alarmBucket = rows.filter((r) => r.estado === "ALARMA");
  const alarmClicks = alarmBucket.filter((r) => r.whatsappClickAt).length;
  const ctrAlarma = {
    total: alarmBucket.length,
    clicks: alarmClicks,
    pct: alarmBucket.length > 0 ? Math.round((alarmClicks / alarmBucket.length) * 100) : 0,
  };

  // Gráfico de abandono: cuántos EN_CURSO se quedaron en cada paso.
  const abandonoRaw = new Map<number, number>();
  for (const r of rows) {
    if (r.estado !== "EN_CURSO") continue;
    abandonoRaw.set(r.ultimoPaso, (abandonoRaw.get(r.ultimoPaso) ?? 0) + 1);
  }
  const abandono = Array.from({ length: Q.length }, (_, i) => ({
    step: i,
    title: Q[i]?.title ?? `Paso ${i + 1}`,
    count: abandonoRaw.get(i) ?? 0,
  }));

  return NextResponse.json({
    rows,
    kpis: {
      iniciados,
      completados,
      enCurso,
      alarmas,
      pctCompletado,
      colorCount,
      ctrByColor,
      ctrAlarma,
      abandono,
    },
  });
}
