/**
 * GET /api/ads/export-scripts
 *
 * Devuelve un .md con todos los guiones de anuncios agrupados por campaña
 * → adset → anuncio. Pensado para pasárselo al editor / narrador / IA.
 * Solo incluye ads con `script` no vacío.
 *
 * Acceso: los mismos roles que ya pueden ver /fisio/anuncios (CEO por lo
 * general — el layout de anuncios ya gate por rol; aquí lo repetimos para
 * defensa en profundidad).
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getActiveProfessional } from "@/lib/session";

export const dynamic = "force-dynamic";

const STATUS_LABEL: Record<string, string> = {
  idea: "Idea",
  brief: "Brief",
  recording: "Grabación",
  editing: "Edición",
  scheduled: "Programado",
  active: "Activo",
  paused: "Pausado",
  finished: "Terminado",
};

function todayShort() {
  return new Date().toLocaleDateString("es-ES", { year: "numeric", month: "long", day: "numeric" });
}

function indent(text: string, prefix = "> "): string {
  return text
    .split("\n")
    .map((l) => (l.trim() === "" ? ">" : prefix + l))
    .join("\n");
}

export async function GET() {
  const user = await getActiveProfessional();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const campaigns = await prisma.adCampaign.findMany({
    orderBy: [{ status: "asc" }, { createdAt: "desc" }],
    include: {
      adSets: {
        orderBy: { createdAt: "asc" },
        include: {
          ads: {
            orderBy: { createdAt: "asc" },
          },
        },
      },
    },
  });

  const lines: string[] = [];
  lines.push(`# Guiones de anuncios · FisioFit Team`);
  lines.push("");
  lines.push(`_Exportado el ${todayShort()}_`);
  lines.push("");

  let totalAds = 0;
  let totalWithScript = 0;
  for (const c of campaigns) {
    for (const s of c.adSets) {
      for (const a of s.ads) {
        totalAds++;
        if (a.script && a.script.trim()) totalWithScript++;
      }
    }
  }
  lines.push(`**${totalWithScript}** guiones sobre ${totalAds} anuncios totales.`);
  lines.push("");
  lines.push("---");
  lines.push("");

  for (const c of campaigns) {
    const adsInCampaign = c.adSets.flatMap((s) => s.ads).filter((a) => a.script && a.script.trim());
    if (adsInCampaign.length === 0) continue;

    lines.push(`## ${c.name}`);
    lines.push("");
    const meta: string[] = [];
    if (c.objective) meta.push(`Objetivo: **${c.objective}**`);
    if (c.status) meta.push(`Estado: **${STATUS_LABEL[c.status] ?? c.status}**`);
    if (meta.length) {
      lines.push(meta.join(" · "));
      lines.push("");
    }

    for (const s of c.adSets) {
      const adsWithScript = s.ads.filter((a) => a.script && a.script.trim());
      if (adsWithScript.length === 0) continue;

      lines.push(`### 🎯 ${s.name}`);
      lines.push("");

      for (const a of adsWithScript) {
        lines.push(`#### ${a.name}`);
        lines.push("");
        const badge: string[] = [];
        badge.push(`Estado: ${STATUS_LABEL[a.status] ?? a.status}`);
        if (a.format) badge.push(`Formato: ${a.format}`);
        if (a.recordingLocation) badge.push(`Loc.: ${a.recordingLocation}`);
        lines.push(`_${badge.join(" · ")}_`);
        lines.push("");
        if (a.hook) {
          lines.push(`**Hook:** ${a.hook}`);
          lines.push("");
        }
        lines.push(`**Guión:**`);
        lines.push("");
        lines.push(indent(a.script!.trim()));
        lines.push("");
        if (a.cta) {
          lines.push(`**CTA:** ${a.cta}${a.ctaUrl ? ` → ${a.ctaUrl}` : ""}`);
          lines.push("");
        }
        if (a.editorNotes) {
          lines.push(`**Notas al editor:** ${a.editorNotes}`);
          lines.push("");
        }
        lines.push("---");
        lines.push("");
      }
    }
  }

  const body = lines.join("\n");
  const filename = `guiones-anuncios-${new Date().toISOString().slice(0, 10)}.md`;

  return new NextResponse(body, {
    status: 200,
    headers: {
      "Content-Type": "text/markdown; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
