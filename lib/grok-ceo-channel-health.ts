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
