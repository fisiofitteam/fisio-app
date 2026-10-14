/**
 * Lee la fila singleton de AutotestHombroConfig. Si la tabla aún no
 * existe (migración pendiente) o la fila no está creada, devuelve
 * defaults — así la landing nunca se cae.
 */
import { prisma } from "@/lib/prisma";

export type AutotestConfig = {
  videoUrls: { test1: string; test2: string; test3: string };
  whatsappTemplate: string;
  quizFunnelEnabled: boolean;
};

export const DEFAULT_WHATSAPP_TEMPLATE =
  `¡Hola {{nombre}}! Soy Ales de FisioFitCross.

Vi que hiciste el Autotest Funcional del Hombro y te ha salido *{{arquetipo}}*.

{{resumen}}

Si quieres, te paso un par de ejercicios concretos para tus 2 áreas más débiles ({{debiles}}) y te cuento cómo encajarlos sin tocar lo que ya haces en el box.

¿Cuando puedas seguimos por aquí?`;

const DEFAULTS: AutotestConfig = {
  videoUrls: { test1: "", test2: "", test3: "" },
  whatsappTemplate: DEFAULT_WHATSAPP_TEMPLATE,
  quizFunnelEnabled: false,
};

export async function getAutotestConfig(): Promise<AutotestConfig> {
  try {
    const row = await (prisma as any).autotestHombroConfig.findUnique({
      where: { id: "singleton" },
    });
    if (!row) return DEFAULTS;
    return {
      videoUrls: {
        test1: row.videoUrlTest1 || "",
        test2: row.videoUrlTest2 || "",
        test3: row.videoUrlTest3 || "",
      },
      whatsappTemplate: row.whatsappTemplate || DEFAULT_WHATSAPP_TEMPLATE,
      quizFunnelEnabled: !!row.quizFunnelEnabled,
    };
  } catch {
    return DEFAULTS;
  }
}
