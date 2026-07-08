"use client";

type Point = { date: Date; value: number };

/**
 * Gráfica de tendencia de 30 días para una métrica del paciente (Fatiga,
 * RPE, Sueño). Cada punto tiene su día en el eje X y valor 0-10 en el Y.
 * Los huecos (días sin registro) se dejan como saltos en la línea, no como
 * ceros — así el paciente ve claramente cuándo no registró.
 *
 * Optimizada para pantalla móvil: SVG responsive, líneas guía sutiles,
 * puntos discretos y valor "último" destacado arriba a la derecha.
 */
export function PatientMetricChart({
  label,
  emoji,
  color,
  entries,
  daysWindow = 30,
  hint,
}: {
  label: string;
  emoji: string;
  color: string;
  entries: Point[];
  daysWindow?: number;
  hint?: string;
}) {
  // Días del rango: los últimos N días (contando hoy) — ordenados asc.
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const start = new Date(today);
  start.setDate(start.getDate() - (daysWindow - 1));

  const byDay = new Map<string, number>();
  for (const p of entries) {
    const d = new Date(p.date);
    d.setHours(0, 0, 0, 0);
    if (d < start || d > today) continue;
    byDay.set(d.toISOString().slice(0, 10), p.value);
  }

  const days: { iso: string; value: number | null; date: Date }[] = [];
  for (let i = 0; i < daysWindow; i++) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    const iso = d.toISOString().slice(0, 10);
    days.push({ iso, date: d, value: byDay.get(iso) ?? null });
  }

  const values = days.map((d) => d.value).filter((v): v is number => v != null);
  const lastValue = [...days].reverse().find((d) => d.value != null)?.value ?? null;
  const avg = values.length > 0 ? Math.round((values.reduce((a, b) => a + b, 0) / values.length) * 10) / 10 : null;

  // Layout SVG
  const W = 340;
  const H = 130;
  const padL = 22;
  const padR = 8;
  const padT = 8;
  const padB = 18;
  const innerW = W - padL - padR;
  const innerH = H - padT - padB;
  const xForIndex = (i: number) => padL + (i * innerW) / Math.max(1, days.length - 1);
  const yForValue = (v: number) => padT + innerH - (v / 10) * innerH;

  // Construir la línea saltando los null (múltiples "path" segments)
  const segments: string[] = [];
  let current: string[] = [];
  for (let i = 0; i < days.length; i++) {
    const v = days[i].value;
    if (v == null) {
      if (current.length > 0) segments.push(current.join(" "));
      current = [];
      continue;
    }
    const x = xForIndex(i).toFixed(1);
    const y = yForValue(v).toFixed(1);
    current.push(`${current.length === 0 ? "M" : "L"} ${x} ${y}`);
  }
  if (current.length > 0) segments.push(current.join(" "));

  // Área sombreada bajo cada segmento (relleno tenue del color)
  const areaSegments: string[] = [];
  let currArea: string[] = [];
  let firstIdxInSeg: number | null = null;
  for (let i = 0; i < days.length; i++) {
    const v = days[i].value;
    if (v == null) {
      if (currArea.length > 0 && firstIdxInSeg != null) {
        const lastX = xForIndex(i - 1).toFixed(1);
        const firstX = xForIndex(firstIdxInSeg).toFixed(1);
        const bottomY = (padT + innerH).toFixed(1);
        areaSegments.push([...currArea, `L ${lastX} ${bottomY}`, `L ${firstX} ${bottomY}`, "Z"].join(" "));
      }
      currArea = [];
      firstIdxInSeg = null;
      continue;
    }
    const x = xForIndex(i).toFixed(1);
    const y = yForValue(v).toFixed(1);
    if (currArea.length === 0) {
      firstIdxInSeg = i;
      currArea.push(`M ${x} ${y}`);
    } else {
      currArea.push(`L ${x} ${y}`);
    }
  }
  if (currArea.length > 0 && firstIdxInSeg != null) {
    const lastX = xForIndex(days.length - 1).toFixed(1);
    const firstX = xForIndex(firstIdxInSeg).toFixed(1);
    const bottomY = (padT + innerH).toFixed(1);
    areaSegments.push([...currArea, `L ${lastX} ${bottomY}`, `L ${firstX} ${bottomY}`, "Z"].join(" "));
  }

  // Ticks del eje X: primer día, mitad, hoy (con etiqueta de mes/día abreviado)
  const xTicks = [0, Math.floor(days.length / 2), days.length - 1].map((i) => ({
    x: xForIndex(i),
    label: days[i].date.toLocaleDateString("es-ES", { day: "numeric", month: "short" }),
  }));

  return (
    <section
      className="rounded-2xl p-4"
      style={{ background: "var(--p-surface)", border: "1px solid var(--p-border)" }}
    >
      <div className="flex items-baseline justify-between mb-3 flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <div className="text-2xl leading-none">{emoji}</div>
          <div>
            <div className="text-sm font-semibold" style={{ letterSpacing: "-0.01em" }}>
              {label}
            </div>
            <div className="text-[11px]" style={{ color: "var(--p-text-faint)" }}>
              {values.length > 0
                ? `${values.length} registros · media ${avg}/10`
                : "Aún no hay registros"}
            </div>
          </div>
        </div>
        <div className="text-right">
          <div
            className="text-2xl font-bold tabular-nums"
            style={{ color, letterSpacing: "-0.02em" }}
          >
            {lastValue == null ? "—" : lastValue}
          </div>
          <div className="text-[10px]" style={{ color: "var(--p-text-faint)" }}>
            último
          </div>
        </div>
      </div>

      <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} preserveAspectRatio="none">
        {/* Líneas guía Y en 0, 5 y 10 */}
        {[0, 5, 10].map((v) => (
          <g key={v}>
            <line
              x1={padL}
              x2={W - padR}
              y1={yForValue(v)}
              y2={yForValue(v)}
              stroke="var(--p-border)"
              strokeDasharray={v === 0 || v === 10 ? "0" : "2 3"}
              opacity={v === 0 || v === 10 ? 1 : 0.6}
            />
            <text
              x={padL - 4}
              y={yForValue(v) + 3}
              textAnchor="end"
              fontSize={9}
              fill="var(--p-text-faint)"
            >
              {v}
            </text>
          </g>
        ))}

        {/* Área bajo la línea (tenue) */}
        {areaSegments.map((d, i) => (
          <path key={`a-${i}`} d={d} fill={color} opacity={0.12} />
        ))}

        {/* Línea principal */}
        {segments.map((d, i) => (
          <path key={`l-${i}`} d={d} fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
        ))}

        {/* Puntos por día registrado */}
        {days.map((d, i) => {
          if (d.value == null) return null;
          return (
            <circle
              key={d.iso}
              cx={xForIndex(i)}
              cy={yForValue(d.value)}
              r={2.4}
              fill={color}
            />
          );
        })}

        {/* Ticks X (fechas) */}
        {xTicks.map((t, i) => (
          <text
            key={i}
            x={t.x}
            y={H - 4}
            textAnchor={i === 0 ? "start" : i === xTicks.length - 1 ? "end" : "middle"}
            fontSize={9}
            fill="var(--p-text-faint)"
          >
            {t.label}
          </text>
        ))}
      </svg>

      {hint && (
        <p className="text-[10px] italic mt-2" style={{ color: "var(--p-text-faint)" }}>
          {hint}
        </p>
      )}
    </section>
  );
}
