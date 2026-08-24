"use client";

import { useRouter } from "next/navigation";

/**
 * Selector de mes del Dossier. Navega actualizando ?m=YYYY-MM.
 * También ofrece atajos "← Mes anterior · Este mes · Mes siguiente →".
 */
export function DossierMonthPicker({ year, month }: { year: number; month: number }) {
  const router = useRouter();

  function go(y: number, m: number) {
    const mm = String(m).padStart(2, "0");
    router.push(`?m=${y}-${mm}`);
  }

  function prev() {
    const m = month === 1 ? 12 : month - 1;
    const y = month === 1 ? year - 1 : year;
    go(y, m);
  }
  function next() {
    const m = month === 12 ? 1 : month + 1;
    const y = month === 12 ? year + 1 : year;
    go(y, m);
  }
  function today() {
    const now = new Date();
    go(now.getFullYear(), now.getMonth() + 1);
  }

  return (
    <div className="flex items-center gap-1">
      <button
        onClick={prev}
        className="text-sm px-2 py-1 rounded border border-neutral-200 hover:bg-neutral-50"
        title="Mes anterior"
      >
        ←
      </button>
      <input
        type="month"
        value={`${year}-${String(month).padStart(2, "0")}`}
        onChange={(e) => {
          const v = e.target.value;
          if (/^\d{4}-\d{2}$/.test(v)) {
            const [y, m] = v.split("-").map(Number);
            go(y, m);
          }
        }}
        className="input text-sm"
      />
      <button
        onClick={next}
        className="text-sm px-2 py-1 rounded border border-neutral-200 hover:bg-neutral-50"
        title="Mes siguiente"
      >
        →
      </button>
      <button
        onClick={today}
        className="text-xs font-medium px-2 py-1 rounded border border-neutral-200 hover:bg-neutral-50 ml-1"
      >
        Este mes
      </button>
    </div>
  );
}
