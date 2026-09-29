"use client";

import { useRouter, usePathname } from "next/navigation";

export function MonthPicker({
  options,
  current,
}: {
  options: { key: string; label: string }[];
  current: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  return (
    <select
      value={current}
      onChange={(e) => router.push(`${pathname}?m=${e.target.value}`)}
      className="text-sm px-3 py-1.5 rounded-lg border"
      style={{ borderColor: "#E5E5E5", background: "#FFFFFF" }}
    >
      {options.map((o) => (
        <option key={o.key} value={o.key}>{o.label}</option>
      ))}
    </select>
  );
}
