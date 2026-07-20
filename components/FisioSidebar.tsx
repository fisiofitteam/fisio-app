"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { LogoFull } from "./Logo";
import { NotificationsBell } from "./NotificationsBell";
import {
  LayoutDashboard,
  Users,
  BookOpen,
  CheckSquare,
  Phone,
  Package,
  Wallet,
  Target,
  PhoneCall,
  Repeat,
  Gift,
  Sparkles,
  UserCog,
  Settings,
  LogOut,
  Stethoscope,
  CalendarDays,
  Gauge,
  Zap,
  MessageSquare,
  Megaphone,
  Brain,
  AlertTriangle,
  LucideIcon,
} from "lucide-react";

type Item = {
  id: string;
  label: string;
  Icon: LucideIcon;
  href: string;
  match: (p: string) => boolean;
};

const PANEL: Item = { id: "panel", label: "Panel", Icon: LayoutDashboard, href: "/fisio", match: (p) => p === "/fisio" };
const PACIENTES: Item = { id: "pacientes", label: "Pacientes", Icon: Users, href: "/fisio/pacientes", match: (p) => p.startsWith("/fisio/pacientes") || p.startsWith("/fisio/paciente/") };
const LEADS: Item = { id: "leads", label: "Llamadas", Icon: Target, href: "/fisio/leads", match: (p) => p.startsWith("/fisio/leads") };
const LLAMADAS_VENTA: Item = { id: "llamadas-venta", label: "Llamadas", Icon: PhoneCall, href: "/fisio/llamadas-venta", match: (p) => p.startsWith("/fisio/llamadas-venta") };
const FOLLOWUP: Item = { id: "followup", label: "Follow-up", Icon: Repeat, href: "/fisio/followup", match: (p) => p.startsWith("/fisio/followup") };
const REGALOS: Item = { id: "regalos", label: "Regalos", Icon: Gift, href: "/fisio/regalos", match: (p) => p.startsWith("/fisio/regalos") || p.startsWith("/fisio/parches") };
const CONTENIDO: Item = { id: "contenido", label: "Contenido", Icon: Sparkles, href: "/fisio/contenido/calendario", match: (p) => p.startsWith("/fisio/contenido") };
const ANUNCIOS: Item = { id: "anuncios", label: "Anuncios", Icon: Megaphone, href: "/fisio/anuncios", match: (p) => p.startsWith("/fisio/anuncios") };
const BIBLIOTECA: Item = { id: "biblioteca", label: "Biblioteca", Icon: BookOpen, href: "/fisio/biblioteca", match: (p) => p.startsWith("/fisio/biblioteca") };
const REUNIONES: Item = { id: "reuniones", label: "Reuniones", Icon: Stethoscope, href: "/fisio/reuniones", match: (p) => p.startsWith("/fisio/reuniones") };
const CALENDARIO: Item = { id: "calendario", label: "Calendario", Icon: CalendarDays, href: "/fisio/calendario", match: (p) => p.startsWith("/fisio/calendario") };
const ADVANCE: Item = { id: "advance", label: "Advance", Icon: Zap, href: "/fisio/advance", match: (p) => p.startsWith("/fisio/advance") };
const COMUNIDAD: Item = { id: "comunidad", label: "Comunidad", Icon: CalendarDays, href: "/fisio/comunidad", match: (p) => p.startsWith("/fisio/comunidad") };
const ROLLING_LECTURA: Item = { id: "rolling-lectura", label: "Rolling", Icon: Zap, href: "/fisio/rolling-lectura", match: (p) => p.startsWith("/fisio/rolling-lectura") };
const TAREAS: Item = { id: "tareas", label: "Tareas", Icon: CheckSquare, href: "/fisio/tareas", match: (p) => p.startsWith("/fisio/tareas") };
const LLAMADAS: Item = { id: "llamadas", label: "Llamadas", Icon: Phone, href: "/fisio/llamadas", match: (p) => p.startsWith("/fisio/llamadas") };
const RECURSOS: Item = { id: "recursos", label: "Recursos", Icon: Package, href: "/fisio/recursos", match: (p) => p.startsWith("/fisio/recursos") };
const FINANZAS: Item = { id: "finanzas", label: "Cuadro de mandos", Icon: Gauge, href: "/fisio/finanzas/metricas-negocio", match: (p) => p.startsWith("/fisio/finanzas") };
const EQUIPO: Item = { id: "equipo", label: "Equipo", Icon: UserCog, href: "/fisio/equipo", match: (p) => p.startsWith("/fisio/equipo") };
const CHAT: Item = { id: "chat", label: "Chat", Icon: MessageSquare, href: "/fisio/chat", match: (p) => p.startsWith("/fisio/chat") };
const FISIO_IA: Item = { id: "fisio-ia", label: "Fisio IA", Icon: Brain, href: "/fisio/fisio-ia", match: (p) => p.startsWith("/fisio/fisio-ia") };
const ALERTAS: Item = { id: "alertas", label: "Alertas", Icon: AlertTriangle, href: "/fisio/alertas", match: (p) => p.startsWith("/fisio/alertas") };
const AJUSTES: Item = { id: "ajustes", label: "Ajustes", Icon: Settings, href: "/fisio/ajustes", match: (p) => p.startsWith("/fisio/ajustes") };

function itemsForRole(role: string): Item[] {
  if (role === "ceo") {
    return [PANEL, PACIENTES, ALERTAS, ADVANCE, LLAMADAS_VENTA, CONTENIDO, ANUNCIOS, BIBLIOTECA, REUNIONES, CALENDARIO, COMUNIDAD, TAREAS, RECURSOS, FINANZAS, EQUIPO, CHAT, FISIO_IA, AJUSTES];
  }
  if (role === "head_success") {
    return [PANEL, PACIENTES, ALERTAS, ADVANCE, BIBLIOTECA, REUNIONES, CALENDARIO, COMUNIDAD, TAREAS, LLAMADAS, RECURSOS, EQUIPO, CHAT, AJUSTES];
  }
  if (role === "setter") {
    return [PANEL, LEADS, PACIENTES, REGALOS, CONTENIDO, COMUNIDAD, REUNIONES, CALENDARIO, EQUIPO, CHAT, AJUSTES];
  }
  if (role === "closer") {
    return [PANEL, LLAMADAS_VENTA, FOLLOWUP, COMUNIDAD, REUNIONES, CALENDARIO, EQUIPO, CHAT, AJUSTES];
  }
  // fisio normal
  return [PANEL, PACIENTES, ALERTAS, ROLLING_LECTURA, BIBLIOTECA, REUNIONES, CALENDARIO, COMUNIDAD, TAREAS, LLAMADAS, RECURSOS, EQUIPO, CHAT, AJUSTES];
}

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
  user,
}: {
  user: { id: string; fullName: string; role: string } | null;
}) {
  const pathname = usePathname() ?? "";
  const [notifCount, setNotifCount] = useState(0);
  const [communityUnread, setCommunityUnread] = useState(0);
  const [alertsUnseen, setAlertsUnseen] = useState(0);

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
  // scope adecuado por rol (fisio → suyas, manager → globales).
  useEffect(() => {
    if (!user) return;
    if (user.role !== "fisio" && user.role !== "head_success" && user.role !== "ceo") return;
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

  if (pathname.startsWith("/fisio/paciente/")) return null;

  const items = user ? itemsForRole(user.role) : [PANEL, PACIENTES, BIBLIOTECA, TAREAS, LLAMADAS, RECURSOS];
  const initials = user ? getInitials(user.fullName) : "??";

  // ¿Qué items deben mostrar el badge de notificaciones?
  // - Setters: ven el badge en el item LEADS (es donde está su workflow)
  // - Closers / CEO con franjas: ven el badge en LLAMADAS_VENTA
  function badgeFor(itemId: string): number | null {
    if (!user) return null;
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
        <nav className="flex gap-1 overflow-x-auto pb-1 min-w-0 flex-1">
          {items.map((it) => {
            const active = it.match(pathname);
            const Icon = it.Icon;
            const badge = badgeFor(it.id);
            return (
              <Link
                key={it.id}
                href={it.href}
                className={`px-3 py-2 text-xs rounded-lg whitespace-nowrap flex items-center gap-1.5 relative ${
                  active ? "bg-neutral-900 text-white dark:bg-white dark:text-neutral-900" : "bg-white border border-neutral-200"
                }`}
              >
                <Icon size={14} strokeWidth={2} />
                {it.label}
                {badge !== null && badge > 0 && (
                  <span
                    className="ml-1 min-w-[16px] h-[16px] px-1 rounded-full text-[9px] font-bold flex items-center justify-center"
                    style={{ background: "#DC2626", color: "#FFFFFF" }}
                  >
                    {badge > 99 ? "99+" : badge}
                  </span>
                )}
              </Link>
            );
          })}
        </nav>
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

        <nav className="space-y-0.5">
          {items.map((it) => {
            const active = it.match(pathname);
            const Icon = it.Icon;
            const badge = badgeFor(it.id);
            return (
              <Link
                key={it.id}
                href={it.href}
                className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-colors ${
                  active ? "bg-neutral-900 text-white font-medium dark:bg-white dark:text-neutral-900" : "text-neutral-600 hover:bg-neutral-100"
                }`}
              >
                <Icon size={17} strokeWidth={active ? 2.25 : 2} />
                <span style={{ letterSpacing: "-0.015em" }} className="flex-1">{it.label}</span>
                {badge !== null && badge > 0 && (
                  <span
                    className="min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-bold flex items-center justify-center"
                    style={{ background: "#DC2626", color: "#FFFFFF" }}
                  >
                    {badge > 99 ? "99+" : badge}
                  </span>
                )}
              </Link>
            );
          })}
        </nav>
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
