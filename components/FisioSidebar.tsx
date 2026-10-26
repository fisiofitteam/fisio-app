"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { LogoFull } from "./Logo";
import { NotificationsBell } from "./NotificationsBell";
import { LogOut } from "lucide-react";
import { itemsForRoles } from "@/lib/sidebar-items";
import { SidebarNavigation } from "@/components/SidebarNavigation";
import type { SidebarLayout } from "@/lib/sidebar-layout";
const ROLE_LABEL: Record<string, string> = {
  ceo: "CEO",
  head_success: "Head-success",
  fisio: "Fisioterapeuta",
  setter: "Setter",
  closer: "Closer",
};

function getInitials(fullName: string): string {
  const parts = fullName.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].substring(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function FisioSidebar({
  user, sidebarLayout,
}: {
  sidebarLayout?: SidebarLayout;
  user: { id: string; fullName: string; role: string; extraRoles?: string[]; photoUrl?: string | null } | null;
}) {
  const pathname = usePathname() ?? "";
  const [notifCount, setNotifCount] = useState(0);
  const [communityUnread, setCommunityUnread] = useState(0);
  const [alertsUnseen, setAlertsUnseen] = useState(0);
  const [reportsCount, setReportsCount] = useState(0);

  // Polling notificaciones para mostrar badge en sidebar
  useEffect(() => {
    if (!user) return;
    async function fetchCount() {
      try {
        const res = await fetch("/api/notifications", { cache: "no-store" });
        if (!res.ok) return;
        const data = await res.json();
        setNotifCount(data.count || 0);
      } catch {}
    }
    fetchCount();
    const id = setInterval(fetchCount, 30_000);
    return () => clearInterval(id);
  }, [user]);

  // Polling badge de novedades de la comunidad. Al entrar en /fisio/comunidad
  // el server actualiza communityLastSeenAt → siguiente poll devuelve 0.
  useEffect(() => {
    if (!user) return;
    async function fetchCommunity() {
      try {
        const res = await fetch("/api/community/unread", { cache: "no-store" });
        if (!res.ok) return;
        const data = await res.json();
        setCommunityUnread(data.count || 0);
      } catch {}
    }
    fetchCommunity();
    const id = setInterval(fetchCommunity, 30_000);
    return () => clearInterval(id);
  }, [user, pathname]);

  // Polling contador de alertas sin ver del clinico. La API devuelve el
  // scope adecuado por rol (fisio → suyas, head_success → globales).
  // CEO no ve el buzon de alertas — es cosa del head y de los fisios.
  useEffect(() => {
    if (!user) return;
    if (user.role !== "fisio" && user.role !== "head_success") return;
    async function fetchAlerts() {
      try {
        const res = await fetch("/api/alerts?count=1", { cache: "no-store" });
        if (!res.ok) return;
        const data = await res.json();
        setAlertsUnseen(data.unseen || 0);
      } catch {}
    }
    fetchAlerts();
    const id = setInterval(fetchAlerts, 30_000);
    return () => clearInterval(id);
  }, [user, pathname]);

  // Polling contador de resumenes semanales sin descartar. Solo aparece
  // el item "Resumenes" en la sidebar cuando hay >= 1 (el sistema los
  // genera cada domingo noche y el fisio los va marcando como vistos).
  useEffect(() => {
    if (!user) return;
    if (user.role !== "fisio" && user.role !== "head_success" && user.role !== "ceo") return;
    async function fetchReports() {
      try {
        const res = await fetch("/api/weekly-reports?count=1", { cache: "no-store" });
        if (!res.ok) return;
        const data = await res.json();
        setReportsCount(data.count || 0);
      } catch {}
    }
    fetchReports();
    const id = setInterval(fetchReports, 60_000);
    return () => clearInterval(id);
  }, [user, pathname]);

  if (pathname.startsWith("/fisio/paciente/")) return null;

  const items = user
    ? itemsForRoles(user.role, user.extraRoles ?? [], { withResumenes: reportsCount > 0 })
    : [];
  const initials = user ? getInitials(user.fullName) : "??";

  // ¿Qué items deben mostrar el badge de notificaciones?
  // - Setters: ven el badge en el item LEADS (es donde está su workflow)
  // - Closers / CEO con franjas: ven el badge en LLAMADAS_VENTA
  function badgeFor(itemId: string): number | null {
    if (!user) return null;
    if (itemId === "resumenes" && reportsCount > 0) return reportsCount;
    if (itemId === "alertas" && alertsUnseen > 0) return alertsUnseen;
    if (itemId === "comunidad" && communityUnread > 0) return communityUnread;
    if (notifCount === 0) return null;
    if (user.role === "setter" && itemId === "leads") return notifCount;
    if ((user.role === "closer" || user.role === "ceo") && itemId === "llamadas-venta") return notifCount;
    return null;
  }

  return (
    <>
      {/* Mobile. La campanita va FUERA del nav con overflow-x-auto porque,
          si está dentro, el dropdown queda recortado y no se ve al abrirlo. */}
      <div className="md:hidden flex items-stretch gap-1 -mx-4 px-4">
        <Link
          href="/"
          className="px-3 py-2 text-xs rounded-lg whitespace-nowrap bg-white border border-neutral-200 text-neutral-500 shrink-0 self-center"
        >
          ← Inicio
        </Link>
        {user && (
          <div className="px-1 flex items-center shrink-0">
            <NotificationsBell />
          </div>
        )}
        <SidebarNavigation items={items} layout={sidebarLayout} pathname={pathname} badgeFor={badgeFor} mobile />
      </div>

      {/* Desktop */}
      <aside className="hidden md:block w-48 flex-shrink-0">
        <div className="px-3 mb-3 flex items-center justify-between">
          <LogoFull size={28} />
          {user && <NotificationsBell />}
        </div>

        {user && (
          <div className="mx-3 mb-3 px-3 py-2.5 bg-white border border-neutral-200 rounded-xl">
            <div className="flex items-center gap-2.5">
              {user.photoUrl ? (
                <img
                  src={user.photoUrl}
                  alt={user.fullName}
                  className="flex-shrink-0 object-cover"
                  style={{ width: 36, height: 36, borderRadius: 9 }}
                />
              ) : (
                <div
                  className="flex items-center justify-center font-semibold flex-shrink-0"
                  style={{
                    width: 36, height: 36, borderRadius: 9,
                    background: "linear-gradient(135deg, #FCD34D 0%, #F59E0B 100%)",
                    color: "#0A0A0A",
                    fontSize: 13,
                    letterSpacing: "-0.02em",
                  }}
                >
                  {initials}
                </div>
              )}
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium truncate" style={{ letterSpacing: "-0.015em" }}>
                  {user.fullName}
                </div>
                <div className="text-[10px] uppercase text-neutral-500" style={{ letterSpacing: "0.1em" }}>
                  {ROLE_LABEL[user.role] ?? user.role}
                </div>
              </div>
            </div>
            <LogoutButton />
          </div>
        )}

        <SidebarNavigation items={items} layout={sidebarLayout} pathname={pathname} badgeFor={badgeFor} />
        <Link href="/fisio/ajustes/menu" className="block px-3 py-2 mt-3 text-xs text-neutral-500 hover:text-neutral-900">Organizar menú</Link>
      </aside>
    </>
  );
}

function LogoutButton() {
  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.href = "/login";
  }
  return (
    <button onClick={logout} className="text-xs text-neutral-500 mt-2 flex items-center gap-1.5 hover:text-neutral-900">
      <LogOut size={12} /> Cerrar sesión
    </button>
  );
}
