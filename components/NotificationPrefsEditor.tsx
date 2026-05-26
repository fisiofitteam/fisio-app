"use client";

import { useState } from "react";
import type { NotificationTypeDef } from "@/lib/notification-types";

export function NotificationPrefsEditor({
  types,
  initialPrefs,
}: {
  types: NotificationTypeDef[];
  initialPrefs: Record<string, boolean>;
}) {
  // enabled por tipo: ausente o true = activado
  const [enabled, setEnabled] = useState<Record<string, boolean>>(() => {
    const m: Record<string, boolean> = {};
    for (const t of types) m[t.value] = initialPrefs[t.value] !== false;
    return m;
  });
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  function toggle(value: string) {
    setEnabled((e) => ({ ...e, [value]: !e[value] }));
    setMsg(null);
  }

  async function save() {
    setSaving(true);
    setMsg(null);
    const res = await fetch("/api/notification-prefs", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prefs: enabled }),
    });
    if (res.ok) setMsg({ kind: "ok", text: "Guardado ✓" });
    else setMsg({ kind: "err", text: "No se pudo guardar." });
    setSaving(false);
  }

  if (types.length === 0) {
    return <p className="text-sm text-neutral-500">Tu rol no tiene notificaciones configurables por ahora.</p>;
  }

  return (
    <div className="space-y-2">
      {types.map((t) => (
        <div key={t.value} className="card flex items-center justify-between gap-3 py-3">
          <div className="min-w-0">
            <div className="font-medium text-sm">{t.label}</div>
            <div className="text-xs text-neutral-500">{t.description}</div>
          </div>
          <button
            onClick={() => toggle(t.value)}
            role="switch"
            aria-checked={enabled[t.value]}
            className="relative flex-shrink-0 w-11 h-6 rounded-full transition-colors"
            style={{ background: enabled[t.value] ? "#FCD34D" : "#D4D4D4" }}
          >
            <span
              className="absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform"
              style={{ transform: enabled[t.value] ? "translateX(20px)" : "translateX(0)" }}
            />
          </button>
        </div>
      ))}

      <div className="flex items-center justify-end gap-3 pt-1">
        {msg && <span className={`text-sm ${msg.kind === "ok" ? "text-emerald-700" : "text-red-600"}`}>{msg.text}</span>}
        <button onClick={save} disabled={saving} className="btn btn-primary text-sm">{saving ? "Guardando…" : "Guardar"}</button>
      </div>
    </div>
  );
}
