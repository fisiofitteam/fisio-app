"use client";

import { useRouter, useSearchParams } from "next/navigation";

export function KpiPeriodNav({ title, month, year, annual = false, rangeLabel }: {
  title: string; month: string; year: number; annual?: boolean; rangeLabel?: string;
}) {
  const router = useRouter();
  const params = useSearchParams();
  const [selectedYear, selectedMonth] = month.split("-").map(Number);

  function go(value: string, nextYear?: number) {
    const next = new URLSearchParams(params.toString());
    next.set("specificMonth", value);
    next.set("year", String(nextYear ?? Number(value.slice(0, 4))));
    next.delete("period");
    router.push(`?${next.toString()}`, { scroll: false });
  }

  function shift(delta: number) {
    if (annual) {
      const nextYear = Math.min(2099, Math.max(2000, year + delta));
      go(`${nextYear}-${String(selectedMonth).padStart(2, "0")}`, nextYear);
    } else {
      const date = new Date(Date.UTC(selectedYear, selectedMonth - 1 + delta, 1));
      if (date.getUTCFullYear() < 2000 || date.getUTCFullYear() > 2099) return;
      go(date.toISOString().slice(0, 7));
    }
  }

  function today() {
    const parts = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Madrid", year: "numeric", month: "2-digit" }).formatToParts(new Date());
    go(`${parts.find((p) => p.type === "year")!.value}-${parts.find((p) => p.type === "month")!.value}`);
  }

  const label = annual ? String(year) : new Date(Date.UTC(selectedYear, selectedMonth - 1, 1))
    .toLocaleDateString("es-ES", { month: "long", year: "numeric", timeZone: "UTC" });

  return (
    <header className="mb-4 flex flex-wrap items-center justify-between gap-3">
      <h2 className="text-xl font-semibold tracking-tight">{title} <span className="text-neutral-400 font-normal">·</span> <span className="capitalize">{rangeLabel ?? label}</span></h2>
      <div className="flex items-center gap-1.5">
        <button type="button" onClick={() => shift(-1)} aria-label={annual ? "Año anterior" : "Mes anterior"} className="rounded-lg border border-neutral-200 px-3 py-1.5 text-sm hover:bg-neutral-50">←</button>
        <button type="button" onClick={today} className="rounded-lg border border-neutral-200 px-3 py-1.5 text-xs hover:bg-neutral-50">Hoy</button>
        <button type="button" onClick={() => shift(1)} aria-label={annual ? "Año siguiente" : "Mes siguiente"} className="rounded-lg border border-neutral-200 px-3 py-1.5 text-sm hover:bg-neutral-50">→</button>
        <label className="sr-only" htmlFor="kpi-period">{annual ? "Año" : "Mes"}</label>
        {annual ? (
          <input id="kpi-period" type="number" min={2000} max={2099} value={year} onChange={(e) => {
            const n = Number(e.target.value);
            if (/^20\d{2}$/.test(e.target.value)) go(`${n}-${String(selectedMonth).padStart(2, "0")}`, n);
          }} className="ml-1 w-20 rounded-lg border border-neutral-200 px-2 py-1.5 text-xs" />
        ) : (
          <input id="kpi-period" type="month" min="2000-01" max="2099-12" value={month} onChange={(e) => {
            if (/^20\d{2}-(0[1-9]|1[0-2])$/.test(e.target.value)) go(e.target.value);
          }} className="ml-1 rounded-lg border border-neutral-200 px-2 py-1.5 text-xs" />
        )}
      </div>
    </header>
  );
}
