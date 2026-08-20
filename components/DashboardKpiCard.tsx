"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

/**
 * Tarjeta de KPI del panel de control. Si recibe `detail`, es clicable y
 * abre un popup con la lista concreta que compone el número.
 */

export type KpiDetailRow = {
  /** Si se define, la fila es un enlace. */
  href?: string;
  title: string;
  subtitle?: string;
  /** Texto pequeño alineado a la derecha (ej: "en 12d", "35%", "hoy 12:00"). */
  meta?: string;
  /** Acento del meta: rojo (danger) o ámbar (warning). */
  metaAccent?: "danger" | "warning" | null;
};

export type KpiDetail = {
  title: string;
  description?: string;
  emptyText?: string;
  rows: KpiDetailRow[];
};

export function DashboardKpiCard({
  label,
  value,
  accent,
  detail,
}: {
  label: string;
  value: number | string;
  accent?: "warning" | "info" | "danger";
  detail?: KpiDetail;
}) {
  const [open, setOpen] = useState(false);
  const clickable = !!detail;

  const accentClass =
    accent === "warning" ? "text-amber-700"
    : accent === "danger" ? "text-red-600"
    : "text-neutral-900";

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <>
      <button
        type="button"
        onClick={clickable ? () => setOpen(true) : undefined}
        disabled={!clickable}
        className={`bg-neutral-50 rounded-lg p-3 text-left w-full transition ${clickable ? "hover:bg-neutral-100 cursor-pointer" : "cursor-default"}`}
      >
        <div className="text-xs text-neutral-500 flex items-center justify-between gap-2">
          <span>{label}</span>
          {clickable && <span className="text-neutral-400 text-[10px]">›</span>}
        </div>
        <div className={`text-2xl font-semibold mt-1 ${accentClass}`}>{value}</div>
      </button>

      {clickable && open && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center p-4 overflow-y-auto"
          style={{ background: "rgba(0,0,0,0.5)" }}
          onClick={() => setOpen(false)}
        >
          <div
            className="w-full max-w-lg rounded-xl mt-8 mb-8 p-4"
            style={{ background: "#FFFFFF" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3 mb-2">
              <div>
                <h3 className="font-semibold text-base">{detail!.title}</h3>
                {detail!.description && (
                  <p className="text-xs text-neutral-500 mt-0.5">{detail!.description}</p>
                )}
              </div>
              <button
                onClick={() => setOpen(false)}
                className="text-neutral-400 hover:text-neutral-800 text-xl leading-none shrink-0"
                aria-label="Cerrar"
              >
                ✕
              </button>
            </div>

            {detail!.rows.length === 0 ? (
              <p className="text-sm text-neutral-500 italic py-6 text-center">
                {detail!.emptyText ?? "Sin resultados."}
              </p>
            ) : (
              <div className="mt-2 divide-y divide-neutral-100 max-h-[60vh] overflow-y-auto">
                {detail!.rows.map((r, i) => {
                  const inner = (
                    <div className="flex items-start justify-between gap-3 py-2 px-1">
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-medium text-neutral-800 truncate">{r.title}</div>
                        {r.subtitle && (
                          <div className="text-[11px] text-neutral-500 truncate">{r.subtitle}</div>
                        )}
                      </div>
                      {r.meta && (
                        <div
                          className={`text-xs shrink-0 tabular-nums ${
                            r.metaAccent === "danger" ? "text-red-600 font-medium"
                            : r.metaAccent === "warning" ? "text-amber-700 font-medium"
                            : "text-neutral-500"
                          }`}
                        >
                          {r.meta}
                        </div>
                      )}
                    </div>
                  );
                  return r.href ? (
                    <Link key={i} href={r.href} onClick={() => setOpen(false)} className="block hover:bg-neutral-50 rounded">
                      {inner}
                    </Link>
                  ) : (
                    <div key={i}>{inner}</div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
