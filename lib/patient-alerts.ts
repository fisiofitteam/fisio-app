/**
 * Helpers para el sistema de alertas del fisio (Fase A del proyecto de
 * seguimiento inteligente de sensaciones).
 *
 * Una PatientAlert es un evento detectado por:
 *   - IA sobre patientNotes al completar sesion (kind = "notes_ai")
 *   - Detector de metricas al guardar daily-log         (kind = "metric_deviation")
 *
 * Nunca las borramos. El fisio las gestiona con seenAt / dismissedAt para
 * preservar auditoria — "quien vio que y cuando".
 */
import { prisma } from "@/lib/prisma";

export type AlertKind = "notes_ai" | "metric_deviation";
export type AlertSeverity = "info" | "warn" | "high";

// Solo warn+ se muestran en el buzon por defecto. "info" queda archivada
// para que se pueda consultar si se quiere pero no molesta.
export const VISIBLE_SEVERITIES: AlertSeverity[] = ["warn", "high"];

export type CreateAlertInput = {
  patientId: string;
  kind: AlertKind;
  severity: AlertSeverity;
  summary: string;
  triggerData?: unknown;
  sourceType: "session" | "daily_log";
  sourceId: string;
};

export async function createPatientAlert(input: CreateAlertInput) {
  const summary = input.summary.slice(0, 200);
  return await (prisma as any).patientAlert.create({
    data: {
      patientId: input.patientId,
      kind: input.kind,
      severity: input.severity,
      summary,
      triggerData: input.triggerData ? JSON.stringify(input.triggerData) : null,
      sourceType: input.sourceType,
      sourceId: input.sourceId,
    },
  });
}

/**
 * Cuenta alertas visibles (warn+) aun sin ver. Es lo que pinta el badge de
 * la sidebar. Si assignedProfessionalId se pasa, filtra a los pacientes
 * de ese fisio; si no, cuenta globales (para roles CEO/head_success).
 */
export async function countUnseenAlerts(assignedProfessionalId?: string | null): Promise<number> {
  const where: any = {
    seenAt: null,
    dismissedAt: null,
    severity: { in: VISIBLE_SEVERITIES },
  };
  if (assignedProfessionalId) {
    where.patient = { assignedProfessionalId };
  }
  return await (prisma as any).patientAlert.count({ where });
}

export type AlertListFilters = {
  scope: "mine" | "all";
  professionalId?: string | null;
  includeSeen?: boolean;
  includeInfo?: boolean;
  patientId?: string;
  limit?: number;
};

export async function listAlerts(f: AlertListFilters) {
  const where: any = {};
  if (!f.includeSeen) where.seenAt = null;
  where.dismissedAt = null;
  where.severity = { in: f.includeInfo ? ["info", "warn", "high"] : VISIBLE_SEVERITIES };
  if (f.scope === "mine" && f.professionalId) {
    where.patient = { assignedProfessionalId: f.professionalId };
  }
  if (f.patientId) where.patientId = f.patientId;
  return await (prisma as any).patientAlert.findMany({
    where,
    orderBy: [{ createdAt: "desc" }],
    take: f.limit ?? 100,
    include: {
      patient: {
        select: {
          id: true,
          fullName: true,
          photoUrl: true,
          programType: true,
          assignedProfessional: { select: { id: true, fullName: true } },
        },
      },
    },
  });
}

export async function markAlertSeen(alertId: string, professionalId: string) {
  return await (prisma as any).patientAlert.update({
    where: { id: alertId },
    data: { seenAt: new Date(), seenById: professionalId },
  });
}

export async function dismissAlert(alertId: string, professionalId: string) {
  return await (prisma as any).patientAlert.update({
    where: { id: alertId },
    data: {
      dismissedAt: new Date(),
      dismissedById: professionalId,
      // Si nadie la habia marcado como vista todavia, se cuenta al dismisser.
      seenAt: new Date(),
      seenById: professionalId,
    },
  });
}
