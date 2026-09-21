"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

/**
 * Celda editable de capacidad (maxPatients) por coach en la tabla del
 * panel de capacidad operativa. Al pulsar Enter o desenfocar hace POST
 * al endpoint /api/professionals/[id]/capacity.
 *
 * Muestra dos cosas:
 *  - value: número efectivo (override ?? default).
 *  - suffix "(auto)" si aún no hay override para dejar claro que ese
 *    valor viene del global.
 */
export function CapacityCell({
  professionalId,
  effectiveCapacity,
  hasOverride,
  defaultCapacity,
}: {
  professionalId: string;
  effectiveCapacity: number;
  hasOverride: boolean;
  defaultCapacity: number;
}) {
  const router = useRouter();
  const [value, setValue] = useState(String(hasOverride ? effectiveCapacity : ""));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setValue(String(hasOverride ? effectiveCapacity : ""));
  }, [effectiveCapacity, hasOverride]);

  async function save() {
    const raw = value.trim();
    const nextValue = raw === "" ? null : Number(raw);
    if (raw !== "" && (!Number.isFinite(nextValue as number) || (nextValue as number) < 0 || (nextValue as number) > 1000)) {
      setError("0-1000");
      inputRef.current?.select();
      return;
    }
    const currentEffective = hasOverride ? effectiveCapacity : null;
    if (nextValue === currentEffective) return; // nada que guardar
    setSaving(true);
    setError(null);
    const r = await fetch(`/api/professionals/${professionalId}/capacity`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ maxPatients: nextValue }),
    }).catch(() => null);
    if (r?.ok) {
      router.refresh();
    } else {
      setError("!");
    }
    setSaving(false);
  }

  return (
    <div className="flex items-center gap-1 justify-end">
      <input
        ref={inputRef}
        type="number"
        min={0}
        max={1000}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); (e.target as HTMLInputElement).blur(); } }}
        onBlur={save}
        disabled={saving}
        placeholder={String(defaultCapacity)}
        className="w-14 text-right text-xs p-1 rounded border"
        style={{ borderColor: error ? "#DC2626" : "#E5E5E5" }}
      />
      {!hasOverride && value === "" && (
        <span className="text-[9px] text-neutral-400" title="Sin override — usa el valor global">auto</span>
      )}
      {saving && <span className="text-[10px] text-neutral-400">…</span>}
      {error && <span className="text-[10px] text-red-600">{error}</span>}
    </div>
  );
}
