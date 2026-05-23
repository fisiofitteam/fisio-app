/**
 * POST /api/admin/seed-content-template
 *
 * Endpoint one-shot: rellena la tabla ContentTemplateDay con los 7 días iniciales.
 * No destructivo: si ya hay filas, no hace nada.
 *
 * Los carruseles e infografía se simplifican a 1 bloque "Idea general / prompt IA"
 * (decisión de producto v57.6 — Ales prefiere desarrollar la idea en un chat de IA
 * fuera de la app, y solo necesita un cuadro de texto para volcar el resultado).
 * Los reels mantienen sus bloques temporales porque sí se graban con guion estructurado.
 *
 * Solo CEO.
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getActiveProfessional } from "@/lib/session";

export const dynamic = "force-dynamic";

// Plantilla inicial (lo que había en lib/content-templates.ts pero con
// carruseles/infografía simplificados a 1 bloque)
const SEED_DATA = [
  {
    dayOfWeek: 1,
    format: "belief_carousel",
    goal: "Desmontar una creencia limitante de la audiencia",
    ctaType: "Suave (guardar / seguir)",
    defaultDmKeyword: "",
    blocks: [
      { id: "idea", label: "Idea general / prompt IA", order: 0 },
    ],
    storyChecklist: [
      "Caja de preguntas sobre el tema",
      "Encuesta: ¿lo creías tú también?",
      "Story con cita del carrusel",
    ],
  },
  {
    dayOfWeek: 2,
    format: "case_reel",
    goal: "Mostrar transformación real de un atleta",
    ctaType: "DM con palabra clave",
    defaultDmKeyword: "CASO",
    blocks: [
      { id: "t0_3", label: "0–3s · Hook visual + dolor inicial", order: 0 },
      { id: "t3_10", label: "3–10s · Contexto del atleta", order: 1 },
      { id: "t10_35", label: "10–35s · Proceso (qué hicimos)", order: 2 },
      { id: "t35_50", label: "35–50s · Resultado tangible", order: 3 },
      { id: "t50_60", label: "50–60s · CTA: DM con palabra clave", order: 4 },
    ],
    storyChecklist: [
      "Story del atleta entrenando hoy",
      "Caja de preguntas: ¿quieres este resultado?",
    ],
  },
  {
    dayOfWeek: 3,
    format: "value_carousel",
    goal: "Educar profundamente sobre un tema clínico",
    ctaType: "Guardar + comentar",
    defaultDmKeyword: "",
    blocks: [
      { id: "idea", label: "Idea general / prompt IA", order: 0 },
    ],
    storyChecklist: [
      "Story con un punto clave del carrusel",
      "Caja de preguntas para resolver dudas",
    ],
  },
  {
    dayOfWeek: 4,
    format: "value_reel",
    goal: "Idea potente en menos de 45s",
    ctaType: "Comentar palabra clave",
    defaultDmKeyword: "INFO",
    blocks: [
      { id: "t0_3", label: "0–3s · Hook directo", order: 0 },
      { id: "t3_25", label: "3–25s · Idea principal", order: 1 },
      { id: "t25_40", label: "25–40s · Ejemplo / aplicación", order: 2 },
      { id: "t40_45", label: "40–45s · CTA cierre", order: 3 },
      { id: "bonus_stories", label: "Bonus · Idea para stories", order: 4 },
    ],
    storyChecklist: [
      "Story con el reel anclado arriba",
      "Caja de preguntas para profundizar",
    ],
  },
  {
    dayOfWeek: 5,
    format: "exercises_carousel",
    goal: "Mostrar ejercicios concretos para un objetivo",
    ctaType: "DM lead magnet",
    defaultDmKeyword: "PLAN",
    blocks: [
      { id: "idea", label: "Idea general / prompt IA", order: 0 },
    ],
    storyChecklist: [
      "Story demo de uno de los ejercicios",
      "Story con el lead magnet en encuesta",
    ],
  },
  {
    dayOfWeek: 6,
    format: "infographic",
    goal: "Resumir info denso en imagen visual",
    ctaType: "Guardar",
    defaultDmKeyword: "",
    blocks: [
      { id: "idea", label: "Idea general / prompt IA", order: 0 },
    ],
    storyChecklist: [
      "Story con un trozo zoom de la infografía",
    ],
  },
  {
    dayOfWeek: 7,
    format: "closing_reel",
    goal: "Cierre semanal con CTA fuerte",
    ctaType: "DM palabra clave (alta intención)",
    defaultDmKeyword: "EMPEZAR",
    blocks: [
      { id: "t0_5", label: "0–5s · Hook de urgencia", order: 0 },
      { id: "t5_40", label: "5–40s · Argumento principal", order: 1 },
      { id: "t40_55", label: "40–55s · Prueba / caso breve", order: 2 },
      { id: "t55_60", label: "55–60s · CTA fuerte (DM palabra clave)", order: 3 },
    ],
    storyChecklist: [
      "Story con el reel anclado",
      "Caja de preguntas: ¿quieres empezar?",
      "Encuesta cierre de semana",
    ],
  },
];

export async function POST() {
  const user = await getActiveProfessional();
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (user.role !== "ceo") {
    return NextResponse.json({ error: "Solo CEO" }, { status: 403 });
  }

  const existing = await prisma.contentTemplateDay.count();
  if (existing > 0) {
    return NextResponse.json({
      ok: true,
      message: `Ya hay ${existing} días en la plantilla. No se ha modificado nada.`,
      days: existing,
    });
  }

  await prisma.contentTemplateDay.createMany({
    data: SEED_DATA.map((d) => ({
      dayOfWeek: d.dayOfWeek,
      format: d.format,
      goal: d.goal,
      ctaType: d.ctaType,
      defaultDmKeyword: d.defaultDmKeyword,
      blocks: JSON.stringify(d.blocks),
      storyChecklist: JSON.stringify(d.storyChecklist),
    })),
  });

  return NextResponse.json({
    ok: true,
    message: `Plantilla creada con 7 días.`,
    days: 7,
  });
}
