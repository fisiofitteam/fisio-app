type Mode = "subscription" | "adherence";

export function ProgressRing({
  value,
  max,
  size = 56,
  stroke = 5,
  label,
  mode = "subscription",
}: {
  value: number;
  max: number;
  size?: number;
  stroke?: number;
  label?: string;
  mode?: Mode;
}) {
  const safeMax = max > 0 ? max : 1;
  const pct = Math.max(0, Math.min(1, value / safeMax));
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const offset = c * (1 - pct);

  // Colores distintos según modo
  // Suscripción: amarillo → naranja → rojo cuando se acaba el tiempo (>= 85%)
  // Adherencia: rojo si baja → ámbar medio → verde si alta
  let color: string;
  if (mode === "subscription") {
    color = pct < 0.5 ? "#F59E0B" : pct < 0.85 ? "#EA580C" : "#DC2626";
  } else {
    color = pct < 0.5 ? "#DC2626" : pct < 0.8 ? "#F59E0B" : "#10B981";
  }

  const centerLabel =
    mode === "adherence" ? `${Math.round(pct * 100)}%` : `${Math.round(pct * 100)}%`;

  const subLabel =
    mode === "subscription"
      ? `${value.toFixed(1)} / ${max}m`
      : `${value} / ${max}`;

  return (
    <div className="inline-flex items-center gap-2">
      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size} className="-rotate-90">
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            stroke="#E5E5E5"
            strokeWidth={stroke}
            fill="none"
          />
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            stroke={color}
            strokeWidth={stroke}
            strokeLinecap="round"
            fill="none"
            strokeDasharray={c}
            strokeDashoffset={offset}
            style={{ transition: "stroke-dashoffset 0.3s ease" }}
          />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center text-xs font-medium">
          {centerLabel}
        </div>
      </div>
      {label && (
        <div className="text-xs text-neutral-500 leading-tight">
          <div>{subLabel}</div>
          <div className="text-[10px]">{label}</div>
        </div>
      )}
    </div>
  );
}
