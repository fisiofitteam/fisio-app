/**
 * Helper para leer la config del semáforo (singleton). Si la tabla no
 * existe todavía o el registro no está creado, devuelve valores por
 * defecto — así la landing pública nunca se cae aunque no hayamos
 * migrado aún.
 */
import { prisma } from "@/lib/prisma";

export type SemaforoConfig = {
  quizFunnelEnabled: boolean;
  funnelWhatsappTemplate: string;
};

const DEFAULT: SemaforoConfig = {
  quizFunnelEnabled: false,
  funnelWhatsappTemplate:
    "¡Hola {{nombre}}! Vi que hiciste el Semáforo del Hombro y te salió {{color}}. Te escribo yo directamente para explicarte qué significa y qué hacer con {{movimientos_problema}}.",
};

export async function getSemaforoConfig(): Promise<SemaforoConfig> {
  try {
    const row = await (prisma as any).semaforoConfig.findUnique({ where: { id: "singleton" } });
    if (!row) return DEFAULT;
    return {
      quizFunnelEnabled: !!row.quizFunnelEnabled,
      funnelWhatsappTemplate: row.funnelWhatsappTemplate || DEFAULT.funnelWhatsappTemplate,
    };
  } catch {
    // Tabla no existe todavía (migración pendiente) → default.
    return DEFAULT;
  }
}
