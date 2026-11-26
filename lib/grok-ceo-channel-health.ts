export type ChannelEvidence = { channelConfigured: boolean; lastPollAt: string | null; lastReplyAt: string | null };
export function channelStatus(evidence: ChannelEvidence) {
  if (!evidence.channelConfigured) return "unconfigured" as const;
  if (evidence.lastReplyAt) return "reply_recorded" as const;
  if (evidence.lastPollAt) return "poll_recorded" as const;
  return "unverified" as const;
}
export function exchangeStatus(item: { respondedAt: string | null; deliveredAt: string | null }) {
  return item.respondedAt ? "Respondido" : item.deliveredAt ? "Consultado · sin respuesta" : "Pendiente de consulta";
}
export const CONNECTION_TEST = "Prueba de conexión del buzón: confirma la recepción de este encargo y responde únicamente que el canal consultivo funciona. No realices ninguna otra operación.";
export const GROK_CONNECTION_GUIDE = `Revisa la conexión consultiva de FisioFitCross con https://app.fisiofitteam.com usando únicamente las credenciales dedicadas que ya tengas configuradas de forma segura. No solicites ni muestres secretos en mensajes, informes o repositorios; no necesitas las credenciales de Ponto.

Durante las ejecuciones ya autorizadas, consulta GET /api/integrations/grok-ceo/exchange con la credencial existente GROK_CEO_EXCHANGE_TOKEN en Authorization: Bearer. La credencial de métricas o informes no sustituye a esta credencial. Para cada elemento pending, responde mediante POST al mismo endpoint con JSON {"id":"ID recibido","response":"Tu análisis consultivo"}. Conserva el ID exacto y limita response a 3000 caracteres. Una respuesta aceptada cierra el encargo; no lo publiques de nuevo con otro ID. Si falta la credencial o hay un 401/403, informa del bloqueo sin revelar su valor.

Mantén la publicación diaria existente. Las métricas de GET /api/integrations/grok-ceo/metrics incluyen banking y direction: respeta su estado, sus unidades y la distinción entre saldo, caja, candidatos pendientes y gastos validados. Los recuentos de prioridades no prueban resultados ni autorizan ejecución.

Los lunes, POST /api/integrations/grok-ceo/report admite el campo opcional weeklyStrategy con summary, risks, focus, nextActions y decisions. Usa el cierre de siete días completos de las métricas; summary hasta 1800 caracteres, cada elemento hasta 700, máximo 5 riesgos y 3 elementos en las otras listas. Conserva los campos diarios obligatorios y reportDay de Europe/Madrid. No reconstruyas cifras que falten.

No crees otra rutina ni amplíes permisos. El buzón solo permite análisis: no ejecutes acciones, pagos, transferencias, cambios de precios, tareas del equipo ni acceso a datos clínicos. Comprueba una consulta y una respuesta aceptadas; no declares la conexión verificada antes de observarlas.`;
