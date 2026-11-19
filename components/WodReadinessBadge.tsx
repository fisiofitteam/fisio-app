import { isWodReadiness, WOD_READINESS_OPTIONS, type WodReadiness } from "@/lib/wod-readiness";

const colors: Record<WodReadiness, string> = {
  RED: "border-red-200 bg-red-50 text-red-800",
  AMBER: "border-amber-200 bg-amber-50 text-amber-900",
  GREEN: "border-emerald-200 bg-emerald-50 text-emerald-800",
};

export function WodReadinessBadge({ readiness }: { readiness?: string | null }) {
  if (!isWodReadiness(readiness)) return null;
  const option = WOD_READINESS_OPTIONS.find((item) => item.value === readiness);
  return (
    <span className={`inline-flex items-center gap-1.5 rounded border px-2 py-1 text-xs ${colors[readiness]}`}>
      <span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden />
      Antes del WOD: {option?.label}
    </span>
  );
}
