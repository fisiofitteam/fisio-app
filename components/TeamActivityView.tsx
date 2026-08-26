"use client";
/**
 * Panel de actividad del equipo. Mide TIEMPO ACTIVO dentro de la app
 * (pestaña visible + interaccion en <90s). NO mide trabajo real ni
 * productividad — lo repetimos en la UI para no generar expectativas
 * equivocadas.
 *
 * Datos calculados en servidor (RSC); este componente solo pinta.
 */
import { useState } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";

type Row = { id: string; fullName: string; role: string; seconds: number };
type DayPoint = { date: string; seconds: number };

const PERIODS = [
  { key: "hoy", label: "Hoy" },
  { key: "semana", label: "Esta semana" },
  { key: "mes", label: "Este mes" },
];

const ROLE_STYLE: Record<string, { color: string; label: string }> = {
  ceo:          { color: "#B45309", label: "CEO" },
  head_success: { color: "#7C3AED", label: "Head-success" },
  fisio:        { color: "#0D9488", label: "Fisio" },
  setter:       { color: "#EA580C", label: "Setter" },
  closer:       { color: "#DC2626", label: "Closer" },
  operaciones:  { color: "#2563EB", label: "Operaciones" },
  marketing:    { color: "#DB2777", label: "Marketing" },
  contabilidad: { color: "#475569", label: "Contabilidad" },
};
const roleStyle = (r: string) => ROLE_STYLE[r] ?? { color: "#141717", label: r };

function fmtDur(sec: number): string {
  const s = Math.round(sec || 0);
  if (s < 60) return "0m";
  const h = Math.floor(s / 3600);
  const m = Math.round((s % 3600) / 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

export function TeamActivityView({
  activity, period, periodDays, daily = [], personDaily = {}, personHourly = {},
}: {
  activity: Row[];
  period: string;
  periodDays: number;
  daily?: DayPoint[];
  personDaily?: Record<string, DayPoint[]>;
  personHourly?: Record<string, number[]>;
}) {
  const router = useRouter();
  const pathname = usePathname() ?? "/fisio/equipo";
  const params = useSearchParams();
  const [selected, setSelected] = useState<Row | null>(null);

  function setPeriod(p: string) {
    const u = new URLSearchParams(params?.toString() ?? "");
    u.set("tab", "actividad");
    u.set("actPeriod", p);
    router.push(`${pathname}?${u.toString()}`);
  }

  const rows     = [...activity].sort((a, b) => b.seconds - a.seconds);
  const max      = Math.max(1, ...rows.map((r) => r.seconds));
  const total    = rows.reduce((s, r) => s + r.seconds, 0);
  const withTime = rows.filter((r) => r.seconds >= 60).length;
  const days     = Math.max(1, periodDays);
  const showAvg  = period !== "hoy";
  const rolesPresent = Array.from(new Set(rows.map((r) => r.role)));

  return (
    <div>
      <p className="text-[11px] text-neutral-500 italic mb-3">
        Mide tiempo activo dentro de la app (pestaña visible + interacción reciente). No es tiempo de trabajo. Los datos empiezan desde que se activó la medición.
      </p>

      {/* Selector de periodo + resumen */}
      <div className="flex items-center justify-between gap-2 mb-3 flex-wrap">
        <div className="flex bg-neutral-100 rounded-lg p-0.5">
          {PERIODS.map((p) => (
            <button
              key={p.key}
              onClick={() => setPeriod(p.key)}
              className={`px-3 py-1 text-xs rounded-md ${period === p.key ? "bg-white shadow-sm font-medium" : "text-neutral-600"}`}
            >
              {p.label}
            </button>
          ))}
        </div>
        <div className="text-xs text-neutral-500">
          Total equipo <strong>{fmtDur(total)}</strong>
          {showAvg && <> · media <strong>{fmtDur(total / days)}/día</strong></>}
          {" "}· {withTime} activo{withTime === 1 ? "" : "s"}
        </div>
      </div>

      {/* Leyenda de roles */}
      {rolesPresent.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-3">
          {rolesPresent.map((r) => {
            const stt = roleStyle(r);
            return (
              <span key={r} className="inline-flex items-center gap-1.5 text-[11px] text-neutral-600">
                <span className="w-2.5 h-2.5 rounded-sm" style={{ background: stt.color }} />
                {stt.label}
              </span>
            );
          })}
        </div>
      )}

      {/* Barras por persona */}
      {rows.length === 0 ? (
        <p className="text-sm text-neutral-400 italic text-center py-8">
          Aún no hay datos de actividad para este periodo.
        </p>
      ) : (
        <div className="card space-y-2.5">
          {rows.map((r) => {
            const pct = Math.round((r.seconds / max) * 100);
            const stt = roleStyle(r.role);
            return (
              <div key={r.id} className="flex items-center gap-3">
                <button
                  onClick={() => setSelected(r)}
                  className="w-32 shrink-0 text-sm truncate text-left hover:underline"
                >
                  {r.fullName}
                </button>
                <div className="flex-1 h-5 bg-neutral-100 rounded-md overflow-hidden">
                  <div
                    className="h-full rounded-md"
                    style={{ width: `${r.seconds >= 60 ? Math.max(pct, 3) : 0}%`, background: stt.color }}
                  />
                </div>
                <div className="w-16 shrink-0 text-right text-xs tabular-nums">{fmtDur(r.seconds)}</div>
                {showAvg && (
                  <div className="w-20 shrink-0 text-right text-[11px] text-neutral-400">
                    {fmtDur(r.seconds / days)}/día
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Gráfica del equipo por día */}
      {daily.length >= 2 && (
        <div className="card mt-4">
          <h3 className="text-sm font-medium mb-1">Actividad del equipo por día</h3>
          <DailyBars daily={daily} />
        </div>
      )}

      {selected && (
        <PersonActivityModal
          person={selected}
          daily={personDaily[selected.id] ?? []}
          hourly={personHourly[selected.id] ?? []}
          periodDays={periodDays}
          period={period}
          onClose={() => setSelected(null)}
        />
      )}
    </div>
  );
}

// ────────────────────────── DailyBars ──────────────────────────

function DailyBars({ daily, color = "#141717" }: { daily: DayPoint[]; color?: string }) {
  const max = Math.max(1, ...daily.map((d) => d.seconds));
  const total = daily.reduce((s, d) => s + d.seconds, 0);
  // Parseamos al MEDIODIA UTC — asi la zona del navegador no desplaza el dia.
  const dObj = (iso: string) => new Date(iso + "T12:00:00.000Z");
  return (
    <div>
      <div className="flex items-end gap-1 h-32">
        {daily.map((d) => {
          const h = Math.round((d.seconds / max) * 100);
          return (
            <div
              key={d.date}
              className="flex-1 flex flex-col justify-end h-full min-w-[6px]"
              title={`${dObj(d.date).toLocaleDateString("es-ES", { weekday: "long", day: "numeric", month: "short" })} · ${fmtDur(d.seconds)}`}
            >
              <div
                className="w-full rounded-t"
                style={{ height: `${d.seconds >= 60 ? Math.max(h, 2) : 0}%`, background: color }}
              />
            </div>
          );
        })}
      </div>
      <div className="flex gap-1 mt-1">
        {daily.map((d) => (
          <div key={d.date} className="flex-1 text-center text-[9px] text-neutral-400 min-w-[6px]">
            {dObj(d.date).getUTCDate()}
          </div>
        ))}
      </div>
      <div className="text-[11px] text-neutral-500 mt-2 text-right">
        Total del periodo: <strong>{fmtDur(total)}</strong>
      </div>
    </div>
  );
}

// ────────────────────────── PersonActivityModal ──────────────────────────

const PERIOD_LABEL: Record<string, string> = { hoy: "hoy", semana: "esta semana", mes: "este mes" };
const WEEKDAYS = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];

function PersonActivityModal({
  person, daily, hourly, periodDays, period, onClose,
}: {
  person: Row;
  daily: DayPoint[];
  hourly: number[];
  periodDays: number;
  period: string;
  onClose: () => void;
}) {
  const st = roleStyle(person.role);
  const total = daily.reduce((s, d) => s + d.seconds, 0);
  const activeDays = daily.filter((d) => d.seconds >= 60);
  const best = daily.reduce<DayPoint | null>((b, d) => (!b || d.seconds > b.seconds ? d : b), null);
  const days = Math.max(1, periodDays);
  const avgPerDay = total / days;
  const avgPerActiveDay = activeDays.length ? total / activeDays.length : 0;

  const wdSum = new Array(7).fill(0);
  const wdCount = new Array(7).fill(0);
  for (const d of daily) {
    const wd = (new Date(d.date + "T12:00:00.000Z").getUTCDay() + 6) % 7;
    wdSum[wd] += d.seconds;
    wdCount[wd] += 1;
  }
  const wdAvg = wdSum.map((s, i) => (wdCount[i] ? s / wdCount[i] : 0));
  const wdMax = Math.max(1, ...wdAvg);
  const dObj = (iso: string) => new Date(iso + "T12:00:00.000Z");

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div
        className="bg-white rounded-2xl w-full max-w-lg max-h-[88vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-4 border-b flex items-center justify-between sticky top-0 bg-white">
          <div className="flex items-center gap-2 min-w-0">
            <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ background: st.color }} />
            <h3 className="font-medium truncate">{person.fullName}</h3>
            <span className="text-[11px] text-neutral-400">· {st.label}</span>
          </div>
          <button onClick={onClose} className="text-neutral-400 text-xl px-2">✕</button>
        </div>

        <div className="p-4 space-y-4">
          <p className="text-[11px] text-neutral-400">
            Tiempo activo en la app · {PERIOD_LABEL[period] ?? period}. No es tiempo de trabajo.
          </p>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <Kpi label="Total" value={fmtDur(total)} />
            <Kpi label="Media/día" value={fmtDur(avgPerDay)} />
            <Kpi label="Media día activo" value={fmtDur(avgPerActiveDay)} />
            <Kpi label="Días activos" value={`${activeDays.length}/${daily.length}`} />
          </div>

          {best && best.seconds >= 60 && (
            <p className="text-[11px] text-neutral-500">
              Mejor día: <strong>{dObj(best.date).toLocaleDateString("es-ES", { weekday: "long", day: "numeric", month: "short" })}</strong> · {fmtDur(best.seconds)}
            </p>
          )}

          {daily.length >= 2 && (
            <div>
              <h4 className="text-xs font-semibold text-neutral-600 mb-2">Por día</h4>
              <DailyBars daily={daily} color={st.color} />
            </div>
          )}

          <div>
            <h4 className="text-xs font-semibold text-neutral-600 mb-2">Media por día de la semana</h4>
            <div className="flex items-end gap-2 h-24">
              {wdAvg.map((v, i) => (
                <div
                  key={i}
                  className="flex-1 flex flex-col justify-end h-full"
                  title={`${WEEKDAYS[i]} · ${fmtDur(v)}`}
                >
                  <div
                    className="w-full rounded-t"
                    style={{
                      height: `${v >= 60 ? Math.max(Math.round((v / wdMax) * 100), 2) : 0}%`,
                      background: st.color,
                    }}
                  />
                </div>
              ))}
            </div>
            <div className="flex gap-2 mt-1">
              {WEEKDAYS.map((w) => (
                <div key={w} className="flex-1 text-center text-[9px] text-neutral-400">{w}</div>
              ))}
            </div>
          </div>

          <HourlyBreakdown hourly={hourly} color={st.color} />
        </div>
      </div>
    </div>
  );
}

function Kpi({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-neutral-50 rounded-lg p-2.5 text-center">
      <div className="text-[10px] text-neutral-500 uppercase tracking-wide">{label}</div>
      <div className="text-sm font-semibold text-neutral-800 mt-0.5">{value}</div>
    </div>
  );
}

// ────────────────────────── HourlyBreakdown ──────────────────────────

const FRANJAS = [
  { label: "Madrugada", from: 0,  to: 5  },
  { label: "Mañana",    from: 6,  to: 11 },
  { label: "Mediodía",  from: 12, to: 14 },
  { label: "Tarde",     from: 15, to: 20 },
  { label: "Noche",     from: 21, to: 23 },
];

function HourlyBreakdown({ hourly, color }: { hourly: number[]; color: string }) {
  const hours = hourly.length === 24 ? hourly : new Array(24).fill(0);
  const total = hours.reduce((s, v) => s + v, 0);
  if (total < 60) return null; // aun sin datos
  const max = Math.max(1, ...hours);

  const franjas = FRANJAS.map((f) => {
    let s = 0;
    for (let h = f.from; h <= f.to; h++) s += hours[h] ?? 0;
    return { ...f, seconds: s };
  });
  const topFranja = franjas.reduce((b, f) => (f.seconds > b.seconds ? f : b), franjas[0]);
  let peakHour = 0;
  for (let h = 1; h < 24; h++) if (hours[h] > hours[peakHour]) peakHour = h;

  return (
    <div>
      <h4 className="text-xs font-semibold text-neutral-600 mb-2">Franja horaria</h4>
      <p className="text-[11px] text-neutral-400 mb-2">
        Hora local. Franja principal: <strong>{topFranja.label}</strong> · hora punta{" "}
        <strong>{String(peakHour).padStart(2, "0")}:00</strong>
      </p>

      <div className="flex items-end gap-[2px] h-20">
        {hours.map((v, h) => (
          <div
            key={h}
            className="flex-1 flex flex-col justify-end h-full min-w-[3px]"
            title={`${String(h).padStart(2, "0")}:00 · ${fmtDur(v)}`}
          >
            <div
              className="w-full rounded-t"
              style={{ height: `${v >= 60 ? Math.max(Math.round((v / max) * 100), 2) : 0}%`, background: color }}
            />
          </div>
        ))}
      </div>
      <div className="flex gap-[2px] mt-1">
        {hours.map((_, h) => (
          <div key={h} className="flex-1 text-center text-[8px] text-neutral-400 min-w-[3px]">
            {h % 6 === 0 ? String(h).padStart(2, "0") : ""}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-5 gap-1.5 mt-3">
        {franjas.map((f) => (
          <div key={f.label} className="bg-neutral-50 rounded-lg p-2 text-center">
            <div className="text-[9px] text-neutral-500 uppercase tracking-wide">{f.label}</div>
            <div className="text-xs font-semibold text-neutral-800 mt-0.5">{fmtDur(f.seconds)}</div>
            <div className="text-[9px] text-neutral-400">{Math.round((f.seconds / total) * 100)}%</div>
          </div>
        ))}
      </div>
    </div>
  );
}
