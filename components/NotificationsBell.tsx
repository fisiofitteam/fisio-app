"use client";

import { useEffect, useState, useRef } from "react";
import Link from "next/link";
import { Bell } from "lucide-react";

type Notification = {
  id: string;
  type: string;
  title: string;
  body: string;
  leadId: string | null;
  actionUrl: string | null;
  createdAt: string;
};

const POLL_MS = 30_000;

function timeAgo(iso: string): string {
  const now = Date.now();
  const then = new Date(iso).getTime();
  const seconds = Math.floor((now - then) / 1000);
  if (seconds < 60) return "ahora mismo";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `hace ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `hace ${hours} h`;
  const days = Math.floor(hours / 24);
  return `hace ${days} d`;
}

const TYPE_BADGE: Record<string, { label: string; bg: string; color: string }> = {
  lead_new: { label: "NUEVO", bg: "#FEE2E2", color: "#991B1B" },
  lead_assigned: { label: "ASIGNADO", bg: "#DBEAFE", color: "#1E40AF" },
  call_reminder: { label: "RECORDATORIO", bg: "#FEF3C7", color: "#78350F" },
  program_ending: { label: "PROGRAMA", bg: "#FEF3C7", color: "#78350F" },
  patient_new_unassigned: { label: "PACIENTE", bg: "#DCFCE7", color: "#166534" },
  sale_payment_failed: { label: "PAGO", bg: "#FEE2E2", color: "#991B1B" },
  sale_refunded: { label: "REEMBOLSO", bg: "#FEE2E2", color: "#991B1B" },
  chat_mention: { label: "MENCIÓN", bg: "#FEF3C7", color: "#78350F" },
  lead_rescheduled: { label: "RE-AGENDA", bg: "#DBEAFE", color: "#1E40AF" },
  ads_daily_report: { label: "ADS", bg: "#E0E7FF", color: "#3730A3" },
};

export function NotificationsBell() {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [count, setCount] = useState(0);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  async function load() {
    try {
      const res = await fetch("/api/notifications", { cache: "no-store" });
      if (!res.ok) return;
      const data = await res.json();
      setNotifications(data.notifications || []);
      setCount(data.count || 0);
    } catch {}
  }

  useEffect(() => {
    load();
    const id = setInterval(load, POLL_MS);
    return () => clearInterval(id);
  }, []);

  // Cerrar al hacer click fuera
  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (!ref.current) return;
      if (!ref.current.contains(e.target as Node)) setOpen(false);
    }
    if (open) {
      document.addEventListener("mousedown", onDocClick);
      return () => document.removeEventListener("mousedown", onDocClick);
    }
  }, [open]);

  async function markRead(id: string) {
    await fetch("/api/notifications/read", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    setNotifications((prev) => prev.filter((n) => n.id !== id));
    setCount((c) => Math.max(0, c - 1));
  }

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="relative p-2 rounded-lg hover:bg-neutral-100"
        aria-label="Notificaciones"
      >
        <Bell size={18} className="text-neutral-700" />
        {count > 0 && (
          <span
            className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-bold flex items-center justify-center"
            style={{ background: "#DC2626", color: "#FFFFFF" }}
          >
            {count > 99 ? "99+" : count}
          </span>
        )}
      </button>

      {open && (
        <div
          className="absolute left-0 top-full mt-2 w-80 sm:w-96 max-w-[calc(100vw-1.5rem)] rounded-xl shadow-lg z-50"
          style={{ background: "#FFFFFF", border: "1px solid #E5E5E5" }}
        >
          <div className="p-3 flex items-center justify-between" style={{ borderBottom: "1px solid #F5F5F5" }}>
            <h3 className="text-sm font-semibold">Notificaciones</h3>
            <span className="text-xs" style={{ color: "#737373" }}>
              {count} sin leer
            </span>
          </div>

          {notifications.length === 0 ? (
            <div className="p-6 text-center">
              <div className="text-3xl mb-2">🎉</div>
              <p className="text-sm" style={{ color: "#737373" }}>
                No tienes notificaciones pendientes
              </p>
            </div>
          ) : (
            <div className="max-h-[60vh] overflow-y-auto">
              {notifications.map((n) => {
                const badge = TYPE_BADGE[n.type];
                return (
                  <div key={n.id} className="p-3" style={{ borderBottom: "1px solid #F5F5F5" }}>
                    <div className="flex items-start gap-2 mb-1.5">
                      {badge && (
                        <span
                          className="text-[9px] font-bold tracking-wider px-1.5 py-0.5 rounded mt-0.5 shrink-0"
                          style={{ background: badge.bg, color: badge.color }}
                        >
                          {badge.label}
                        </span>
                      )}
                      <span className="text-[11px]" style={{ color: "#A3A3A3" }}>
                        {timeAgo(n.createdAt)}
                      </span>
                    </div>
                    <div className="text-sm font-medium mb-0.5">{n.title}</div>
                    <p className="text-xs mb-2" style={{ color: "#525252" }}>
                      {n.body}
                    </p>
                    <div className="flex items-center gap-2">
                      {n.actionUrl && (
                        <Link
                          href={n.actionUrl}
                          onClick={() => setOpen(false)}
                          className="text-xs font-medium px-2.5 py-1.5 rounded-md"
                          style={{ background: "#0A0A0A", color: "#FAFAFA" }}
                        >
                          Ver →
                        </Link>
                      )}
                      <button
                        onClick={() => markRead(n.id)}
                        className="text-xs hover:underline"
                        style={{ color: "#737373" }}
                      >
                        Marcar como leído
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
