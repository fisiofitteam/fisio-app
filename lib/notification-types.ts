// Catálogo de tipos de notificación de equipo. Cada profesional puede
// activarlas/desactivarlas desde Ajustes → Notificaciones. Al añadir nuevas
// notificaciones en la app, añade aquí su entrada con los roles que la reciben.
export type NotificationTypeDef = {
  value: string;
  label: string;
  description: string;
  roles: string[]; // roles que pueden recibir este tipo (para mostrar el toggle)
};

export const NOTIFICATION_TYPES: NotificationTypeDef[] = [
  { value: "lead_new", label: "Lead nuevo sin contactar", description: "Cuando entra un lead por la agenda o la landing.", roles: ["setter"] },
  { value: "lead_assigned", label: "Lead asignado para llamar", description: "Cuando un setter te asigna un lead para contactar.", roles: ["closer", "ceo"] },
  { value: "lead_rescheduled", label: "Lead re-agendado", description: "Cuando un lead cambia su cita desde el enlace público de re-agenda.", roles: ["setter", "closer", "ceo"] },
  { value: "call_reminder", label: "Recordatorio de llamada", description: "Aviso del día anterior para enviar recordatorio + vídeo.", roles: ["closer", "ceo"] },
  { value: "patient_new_unassigned", label: "Paciente nuevo sin asignar", description: "Pago confirmado: falta asignarle fisio.", roles: ["head_success"] },
  { value: "sale_payment_failed", label: "Pago fallido", description: "Un cobro de Stripe ha fallado.", roles: ["head_success"] },
  { value: "sale_refunded", label: "Reembolso", description: "Se ha reembolsado una venta.", roles: ["head_success"] },
  { value: "program_ending", label: "Programa a punto de terminar", description: "Un paciente termina un programa en menos de una semana.", roles: ["fisio", "head_success"] },
];

// Tipos visibles (con toggle) para un rol concreto.
export function notificationTypesForRole(role: string): NotificationTypeDef[] {
  return NOTIFICATION_TYPES.filter((t) => t.roles.includes(role));
}

// Dado el JSON de prefs (puede ser null), devuelve los tipos DESACTIVADOS.
// Regla: tipo ausente o true = activado; solo false desactiva.
export function disabledTypesFromPrefs(prefs: unknown): string[] {
  if (!prefs || typeof prefs !== "object") return [];
  const obj = prefs as Record<string, unknown>;
  return Object.keys(obj).filter((k) => obj[k] === false);
}
