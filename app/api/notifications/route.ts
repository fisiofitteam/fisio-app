/**
 * GET  /api/notifications        → lista de notificaciones del usuario actual
 * POST /api/notifications/read   → marca una notificación como leída
 */
import { NextRequest, NextResponse } from "next/server";
import { getActiveProfessional } from "@/lib/session";
import {
  getUnreadNotificationsForUser,
  countUnreadForUser,
  markNotificationRead,
} from "@/lib/notifications";

export async function GET() {
  const user = await getActiveProfessional();
  if (!user) return NextResponse.json({ notifications: [], count: 0 });

  const [notifications, count] = await Promise.all([
    getUnreadNotificationsForUser({ id: user.id, role: user.role }),
    countUnreadForUser({ id: user.id, role: user.role }),
  ]);

  return NextResponse.json({
    notifications: notifications.map((n) => ({
      id: n.id,
      type: n.type,
      title: n.title,
      body: n.body,
      leadId: n.leadId,
      actionUrl: n.actionUrl,
      createdAt: n.createdAt.toISOString(),
    })),
    count,
  });
}
