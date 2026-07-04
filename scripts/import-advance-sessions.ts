/**
 * Importer: lee un HTML con el histórico de sesiones ADVANCE (formato del
 * CEO: <h2>SEMANA X</h2> <h3>Dia N</h3> <h4>Título</h4> <p><em>desc</em></p>
 * <ul><li><strong>BLOQUE</strong><br>cuerpo</li><li>ejercicio1</li>...</ul>)
 * y hace upsert en la tabla AiSessionExample.
 *
 * Uso:
 *   tsx scripts/import-advance-sessions.ts <ruta-al-html>
 *   (por defecto: /Users/ales/Downloads/FISIOFIT_ADVANCE_Programa_Completo.html)
 *
 * Es idempotente: cada sesión se identifica por (source, dayNumber) y se
 * upsertea. Volver a correrlo con el mismo HTML no duplica.
 */

import { readFileSync } from "node:fs";
import { PrismaClient } from "@prisma/client";
import { parseAdvanceHtml, classifySession } from "../lib/parse-advance-html";

const prisma = new PrismaClient();
const DEFAULT_HTML = "/Users/ales/Downloads/FISIOFIT_ADVANCE_Programa_Completo.html";

async function main() {
  const path = process.argv[2] ?? DEFAULT_HTML;
  console.log(`[import-advance-sessions] Leyendo ${path}`);
  const raw = readFileSync(path, "utf8");
  const sessions = parseAdvanceHtml(raw);
  console.log(`[import-advance-sessions] ${sessions.length} sesiones detectadas`);

  let inserted = 0;
  let updated = 0;
  for (const s of sessions) {
    if (!s.title || s.blocks.length === 0) continue;
    const { summary, focusTags } = classifySession(s.title, s.blocks);
    const exerciseNames = [...new Set(s.blocks.flatMap((b) => b.exercises))].join(", ");
    // Buscamos si ya existe por (source + dayNumber). No hay unique compuesto
    // en el schema (para dejar libertad futura) — usamos findFirst + upsert.
    const existing = await prisma.aiSessionExample.findFirst({
      where: { source: "html-import", dayNumber: s.dayNumber },
      select: { id: true },
    });
    const data = {
      kind: "accesorios",
      source: "html-import",
      weekNumber: s.week,
      dayNumber: s.dayNumber,
      title: s.title,
      summary,
      focusTags,
      description: s.description || null,
      blocksJSON: JSON.stringify(s.blocks),
      exerciseNames,
    };
    if (existing) {
      await prisma.aiSessionExample.update({ where: { id: existing.id }, data });
      updated++;
    } else {
      await prisma.aiSessionExample.create({ data });
      inserted++;
    }
  }
  console.log(`[import-advance-sessions] ✓ ${inserted} insertadas, ${updated} actualizadas`);
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
