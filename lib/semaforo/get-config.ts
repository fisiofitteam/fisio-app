/**
 * Helper para leer la config del semáforo (singleton). Si la tabla no
 * existe todavía o el registro no está creado, devuelve valores por
 * defecto — así la landing pública nunca se cae aunque no hayamos
 * migrado aún.
 */
import { prisma } from "@/lib/prisma";
import { VIDEO_URLS } from "@/lib/semaforo/config";

export type SemaforoConfig = {
  quizFunnelEnabled: boolean;
  funnelWhatsappTemplate: string;
  videoUrls: Record<"verde" | "ambar" | "rojo" | "alarma", string>;
};

// Plantilla completa por defecto: se envía como si Ales le hablara al lead
// en primera persona. Incluye la explicación entera del color, no solo el
// verdict — la setter no necesita añadir nada, solo pulsar enviar.
export const DEFAULT_FUNNEL_TEMPLATE = `¡Hola {{nombre}}! Soy Ales de FisioFitCross.

Vi que hiciste el Semáforo del Hombro y te ha salido *{{color}}*:
{{color_titulo}}

Lo que interpretamos de tu resultado:
{{tips}}

Sobre los movimientos que ahora te dan guerra ({{movimientos_problema}}), te cuento cómo abordarlos concretamente para no perder progreso.

¿Cuando puedas seguimos por aquí?`;

const DEFAULT: SemaforoConfig = {
  quizFunnelEnabled: false,
  funnelWhatsappTemplate: DEFAULT_FUNNEL_TEMPLATE,
  // Los defaults de vídeo vienen de la constante VIDEO_URLS (típicamente
  // vacíos). La DB los sobreescribe cuando el CEO los define en el panel.
  videoUrls: { ...VIDEO_URLS },
};

export async function getSemaforoConfig(): Promise<SemaforoConfig> {
  try {
    const row = await (prisma as any).semaforoConfig.findUnique({ where: { id: "singleton" } });
    if (!row) return DEFAULT;
    return {
      quizFunnelEnabled: !!row.quizFunnelEnabled,
      funnelWhatsappTemplate: row.funnelWhatsappTemplate || DEFAULT.funnelWhatsappTemplate,
      videoUrls: {
        verde: (row.videoUrlVerde as string | null) || VIDEO_URLS.verde,
        ambar: (row.videoUrlAmbar as string | null) || VIDEO_URLS.ambar,
        rojo: (row.videoUrlRojo as string | null) || VIDEO_URLS.rojo,
        alarma: (row.videoUrlAlarma as string | null) || VIDEO_URLS.alarma,
      },
    };
  } catch {
    // Tabla o columnas no existen (migración pendiente) → default.
    return DEFAULT;
  }
}
