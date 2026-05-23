/**
 * Helpers para generar y consultar notificaciones in-app del equipo.
 *
 * Patrón: las notificaciones se "dirigen" a un destinatario mediante uno
 * de estos dos campos:
 *   - targetRole: a TODOS los miembros activos de ese rol
 *   - targetProfessionalId: a un miembro concreto
 *
 * Reglas de visibilidad por rol:
 *   - SETTER ve: notificaciones con targetRole="setter" (todas las leads sin
 *     contactar, da igual quién las atienda al final)
 *   - CLOSER ve: notificaciones con targetProfessionalId = su.id (las
 *     asignadas a él/ella concretamente)
 *   - CEO con franjas de closer asignadas: ve las suyas como closer
 */
import { prisma } from "@/lib/prisma";

export type NotifierUser = {
  id: string;
  role: string;
};

/**
 * Devuelve las notificaciones sin leer del usuario, ordenadas por más
 * recientes primero.
 */
export async function getUnreadNotificationsForUser(user: NotifierUser, limit = 20) {
  const where = visibilityWhereFor(user);
  if (!where) return [];
  return prisma.teamNotification.findMany({
    where: { ...where, readAt: null },
    orderBy: { createdAt: "desc" },
    take: limit,
  });
}

/**
 * Cuenta cuántas notificaciones no leídas tiene el usuario.
 */
export async function countUnreadForUser(user: NotifierUser): Promise<number> {
  const where = visibilityWhereFor(user);
  if (!where) return 0;
  return prisma.teamNotification.count({
    where: { ...where, readAt: null },
  });
}

/**
 * Filtro Prisma para "qué notificaciones puede ver este usuario".
 * Devuelve null si el usuario no debe ver ninguna.
 */
function visibilityWhereFor(user: NotifierUser): any {
  if (user.role === "setter") {
    return { targetRole: "setter" };
  }
  if (user.role === "closer" || user.role === "ceo") {
    return { targetProfessionalId: user.id };
  }
  return null;
}

/**
 * Crea notificación dirigida a TODOS los setters activos.
 * Devuelve cuántos destinatarios la verán (informativo).
 */
export async function notifySetters(params: {
  type: string;
  title: string;
  body: string;
  leadId?: string;
  actionUrl?: string;
}): Promise<number> {
  await prisma.teamNotification.create({
    data: {
      targetRole: "setter",
      targetProfessionalId: null,
      type: params.type,
      title: params.title,
      body: params.body,
      leadId: params.leadId,
      actionUrl: params.actionUrl,
    },
  });
  return prisma.professional.count({
    where: { active: true, role: "setter" },
  });
}

/**
 * Crea notificación dirigida a un profesional concreto (closer).
 */
export async function notifyProfessional(params: {
  professionalId: string;
  type: string;
  title: string;
  body: string;
  leadId?: string;
  actionUrl?: string;
}): Promise<void> {
  await prisma.teamNotification.create({
    data: {
      targetProfessionalId: params.professionalId,
      targetRole: null,
      type: params.type,
      title: params.title,
      body: params.body,
      leadId: params.leadId,
      actionUrl: params.actionUrl,
    },
  });
}

/**
 * Marca como leída una notificación concreta. Verifica permisos.
 */
export async function markNotificationRead(notificationId: string, user: NotifierUser): Promise<boolean> {
  const notif = await prisma.teamNotification.findUnique({ where: { id: notificationId } });
  if (!notif) return false;
  // Validar que el usuario tiene permiso
  if (notif.targetProfessionalId && notif.targetProfessionalId !== user.id) return false;
  if (notif.targetRole && notif.targetRole !== user.role && user.role !== "ceo") return false;
  await prisma.teamNotification.update({
    where: { id: notificationId },
    data: { readAt: new Date() },
  });
  return true;
}

/**
 * Marca como leídas TODAS las notificaciones de un lead concreto, dirigidas
 * a un destinatario concreto. Se usa cuando la acción asociada se completa
 * (ej. setter marca "avisado" → marca su notificación lead_new como leída).
 */
export async function markLeadNotificationsRead(params: {
  leadId: string;
  targetRole?: string;
  targetProfessionalId?: string;
}): Promise<void> {
  const where: any = { leadId: params.leadId, readAt: null };
  if (params.targetRole) where.targetRole = params.targetRole;
  if (params.targetProfessionalId) where.targetProfessionalId = params.targetProfessionalId;
  await prisma.teamNotification.updateMany({
    where,
    data: { readAt: new Date() },
  });
}

/**
 * Crea notificación dirigida a todos los head_success (Miguel y futuros).
 * Mismo patrón que notifySetters.
 */
export async function notifyHeadSuccess(params: {
  type: string;
  title: string;
  body: string;
  actionUrl?: string;
}): Promise<void> {
  await prisma.teamNotification.create({
    data: {
      targetRole: "head_success",
      targetProfessionalId: null,
      type: params.type,
      title: params.title,
      body: params.body,
      actionUrl: params.actionUrl,
    },
  });
}
