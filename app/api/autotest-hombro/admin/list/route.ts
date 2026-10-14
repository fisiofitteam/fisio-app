import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getActiveProfessional } from "@/lib/session";
import { canAccessAutotestPanel } from "@/lib/autotest-hombro/access";
import { Q } from "@/lib/autotest-hombro/preguntas";
import { ARQUETIPOS } from "@/lib/autotest-hombro/arquetipos";

/**
 * GET /api/autotest-hombro/admin/list
 *   ?from=YYYY-MM-DD&to=YYYY-MM-DD
 *   &arquetipo=COMPETITIVO|CABALLO_DESCONTROLADO|RIGIDO|INESTABLE|FLUIDO_DEBIL|RECONSTRUCCION
 *   &estado=EN_CURSO|COMPLETADO
 *   &whatsapp=1|0
 *   &gestionado=1|0
 *   &campana=<texto>
 *   &q=<nombre o instagram>
 *   &format=csv
 *
 * Devuelve { rows, kpis } con conteos globales, distribución por
 * arquetipo, CTR WhatsApp y gráfico de abandono por paso.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = {
  from?: Date;
  to?: Date;
  arquetipo?: string;
  estado?: "EN_CURSO" | "COMPLETADO";
  whatsapp?: boolean;
  gestionado?: boolean;
  campana?: string;
  q?: string;
};

const ARQ_IDS = new Set<string>(ARQUETIPOS.map((a) => a.id));

function parseParams(url: URL): Params {
  const p: Params = {};
  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");
  if (from && /^\d{4}-\d{2}-\d{2}$/.test(from)) p.from = new Date(from + "T00:00:00Z");
  if (to && /^\d{4}-\d{2}-\d{2}$/.test(to)) {
    const d = new Date(to + "T00:00:00Z");
    d.setUTCDate(d.getUTCDate() + 1);
    p.to = d;
  }
  const arq = url.searchParams.get("arquetipo");
  if (arq && ARQ_IDS.has(arq)) p.arquetipo = arq;
  const estado = url.searchParams.get("estado");
  if (estado === "EN_CURSO" || estado === "COMPLETADO") p.estado = estado;
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
  if (p.arquetipo) where.arquetipo = p.arquetipo;
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
  if (!user || !canAccessAutotestPanel(user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const url = new URL(req.url);
  const params = parseParams(url);
  const where = buildWhere(params);
  const wantCsv = url.searchParams.get("format") === "csv";

  const rowsRaw = await (prisma as any).autotestHombroResponse.findMany({
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
      arquetipo: true,
      scores: true,
      whatsappClickAt: true,
      gestionado: true,
      gestionadoPor: { select: { fullName: true } },
    },
  });

  const rows = rowsRaw.map((r: any) => {
    let scores: Record<string, number> | null = null;
    try { scores = r.scores ? JSON.parse(r.scores) : null; } catch {}
    return {
      id: r.id,
      createdAt: r.createdAt.toISOString(),
      instagram: r.instagram,
      nombre: r.nombre,
      telefono: r.telefono,
      campana: r.campana,
      estado: r.estado,
      ultimoPaso: r.ultimoPaso,
      arquetipo: r.arquetipo,
      scores,
      whatsappClickAt: r.whatsappClickAt?.toISOString() ?? null,
      gestionado: r.gestionado,
      gestionadoPor: r.gestionadoPor?.fullName ?? null,
    };
  });

  if (wantCsv) {
    const header = [
      "fecha", "instagram", "nombre", "telefono", "campana",
      "estado", "arquetipo",
      "movilidad", "estabilidad", "fuerza", "control", "rotacion", "confianza",
      "whatsapp_click", "gestionado", "gestionado_por",
    ].join(",");
    const lines = rows.map((r: any) => [
      r.createdAt,
      r.instagram ?? "",
      r.nombre ?? "",
      r.telefono ?? "",
      r.campana ?? "",
      r.estado,
      r.arquetipo ?? "",
      r.scores?.movilidadOverhead ?? "",
      r.scores?.estabilidadEscapular ?? "",
      r.scores?.fuerzaEmpuje ?? "",
      r.scores?.controlDinamico ?? "",
      r.scores?.rotacionExterna ?? "",
      r.scores?.confianza ?? "",
      r.whatsappClickAt ? "SI" : "NO",
      r.gestionado ? "SI" : "NO",
      r.gestionadoPor ?? "",
    ].map(csvEscape).join(","));
    const body = [header, ...lines].join("\n");
    return new NextResponse(body, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="autotest-hombro-${Date.now()}.csv"`,
      },
    });
  }

  // ─── KPIs ──────────────────────────────────────────────────────
  const total = rows.length;
  const completados = rows.filter((r: any) => r.estado === "COMPLETADO").length;
  const enCurso = rows.filter((r: any) => r.estado === "EN_CURSO").length;
  const pctCompletado = total > 0 ? Math.round((completados / total) * 100) : 0;

  // Distribución por arquetipo (solo completados).
  const arquetipoCount: Record<string, number> = {};
  for (const a of ARQUETIPOS) arquetipoCount[a.id] = 0;
  for (const r of rows) {
    if (r.estado === "COMPLETADO" && r.arquetipo && arquetipoCount[r.arquetipo] !== undefined) {
      arquetipoCount[r.arquetipo]++;
    }
  }

  // CTR WhatsApp (sobre completados — es la única pantalla con botón).
  const completedRows = rows.filter((r: any) => r.estado === "COMPLETADO");
  const clicks = completedRows.filter((r: any) => r.whatsappClickAt).length;
  const ctrTotal = {
    total: completedRows.length,
    clicks,
    pct: completedRows.length > 0 ? Math.round((clicks / completedRows.length) * 100) : 0,
  };

  // Gráfico de abandono por paso.
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
      iniciados: total,
      completados,
      enCurso,
      pctCompletado,
      arquetipoCount,
      ctrTotal,
      abandono,
    },
  });
}
