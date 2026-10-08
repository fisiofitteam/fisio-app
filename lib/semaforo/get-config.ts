/**
 * Helper para leer la config del Semáforo por `tipo`. Si la tabla no
 * existe todavía o el registro no está creado, devuelve valores por
 * defecto — así la landing pública nunca se cae aunque no hayamos
 * migrado aún.
 *
 * Antes de la generalización multi-zona, la tabla era singleton
 * (id = "singleton"). Ahora cada tipo tiene su propia fila con el
 * id igual al slug ("hombro", "lumbar"). La migración se encarga de
 * convertir la fila "singleton" existente en la de "hombro".
 */
import { prisma } from "@/lib/prisma";
import { VIDEO_URLS } from "@/lib/semaforo/config";
import { parseTipo, type SemaforoTipo } from "@/lib/semaforo/tipos";

export type SemaforoConfig = {
  tipo: SemaforoTipo;
  quizFunnelEnabled: boolean;
  funnelWhatsappTemplate: string;
  videoUrls: Record<"verde" | "ambar" | "rojo" | "alarma", string>;
};

// Plantilla completa por defecto: se envía como si Ales le hablara al lead
// en primera persona. Incluye la explicación entera del color, no solo el
// verdict — la setter no necesita añadir nada, solo pulsar enviar.
export const DEFAULT_FUNNEL_TEMPLATE = `¡Hola {{nombre}}! Soy Ales de FisioFitCross.

Vi que hiciste el Semáforo y te ha salido *{{color}}*:
{{color_titulo}}

Lo que interpretamos de tu resultado:
{{tips}}

Sobre los movimientos que ahora te dan guerra ({{movimientos_problema}}), te cuento cómo abordarlos concretamente para no perder progreso.

¿Cuando puedas seguimos por aquí?`;

function defaultFor(tipo: SemaforoTipo): SemaforoConfig {
  return {
    tipo,
    quizFunnelEnabled: false,
    funnelWhatsappTemplate: DEFAULT_FUNNEL_TEMPLATE,
    videoUrls: { ...VIDEO_URLS },
  };
}

/**
 * Lee la config de un tipo concreto. Hace un primer intento buscando por
 * `tipo` (schema nuevo multi-zona) y cae al legacy `id="singleton"`
 * cuando el tipo pedido es "hombro" (compat con la fila original).
 */
export async function getSemaforoConfig(tipoInput: unknown = "hombro"): Promise<SemaforoConfig> {
  const tipo = parseTipo(tipoInput);
  try {
    let row = await (prisma as any).semaforoConfig.findFirst({ where: { tipo } });
    // Fallback: la primera migración mantuvo la fila con id="singleton"
    // antes del backfill a tipo="hombro". Si no la encontramos por tipo
    // y es la del hombro, intentamos por el id legacy.
    if (!row && tipo === "hombro") {
      row = await (prisma as any).semaforoConfig.findUnique({ where: { id: "singleton" } });
    }
    if (!row) return defaultFor(tipo);
    return {
      tipo,
      quizFunnelEnabled: !!row.quizFunnelEnabled,
      funnelWhatsappTemplate: row.funnelWhatsappTemplate || DEFAULT_FUNNEL_TEMPLATE,
      videoUrls: {
        verde: (row.videoUrlVerde as string | null) || VIDEO_URLS.verde,
        ambar: (row.videoUrlAmbar as string | null) || VIDEO_URLS.ambar,
        rojo: (row.videoUrlRojo as string | null) || VIDEO_URLS.rojo,
        alarma: (row.videoUrlAlarma as string | null) || VIDEO_URLS.alarma,
      },
    };
  } catch {
    // Tabla o columnas no existen (migración pendiente) → default.
    return defaultFor(tipo);
  }
}
