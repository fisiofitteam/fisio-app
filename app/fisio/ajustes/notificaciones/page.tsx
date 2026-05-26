import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getActiveProfessional } from "@/lib/session";
import { notificationTypesForRole } from "@/lib/notification-types";
import { NotificationPrefsEditor } from "@/components/NotificationPrefsEditor";

export const dynamic = "force-dynamic";

export default async function NotificationsSettingsPage() {
  const user = await getActiveProfessional();
  if (!user) redirect("/login");

  const p = await prisma.professional.findUnique({
    where: { id: user.id },
    select: { notificationPrefs: true },
  });
  const prefs = (p?.notificationPrefs as Record<string, boolean>) ?? {};
  const types = notificationTypesForRole(user.role);

  return (
    <main className="max-w-xl">
      <header className="mb-4">
        <Link href="/fisio/ajustes" className="text-xs text-neutral-500">← Ajustes</Link>
        <h1 className="text-xl font-semibold mt-1">Notificaciones</h1>
        <p className="text-xs text-neutral-500 mt-0.5">
          Activa o desactiva los avisos de la campanita según tu preferencia.
        </p>
      </header>

      <NotificationPrefsEditor types={types} initialPrefs={prefs} />
    </main>
  );
}
