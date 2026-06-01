// Dashboard global ADVANCE: medias diarias de fatigue/rpe/sleep agregadas sobre
// todos los pacientes que registraron log diario. Server-friendly, sin client.
//
// Props: ya recibe los datos agregados precalculados por día (orden ascendente).

type DayAggregate = {
  dateIso: string;          // UTC midnight ISO
  fatigueAvg: number | null;
  rpeAvg: number | null;
  sleepAvg: number | null;
  entries: number;          // nº de logs ese día
};

export function AdvanceDashboard({
  daily,
  advanceRollingPatients,
  uniqueLoggers7d,
  uniqueLoggers30d,
}: {
  /** 60 días en orden ascendente */
  daily: DayAggregate[];
  /** Total de pacientes en modo ADVANCE rolling (con algún rolling asignado) */
  advanceRollingPatients: number;
  /** Pacientes únicos que registraron al menos 1 log en los últimos 7d / 30d */
  uniqueLoggers7d: number;
  uniqueLoggers30d: number;
}) {
  const last7 = daily.slice(-7);
  const last30 = daily.slice(-30);
  const prev7 = daily.slice(-14, -7);

  const fatigue7 = avg(last7.map((d) => d.fatigueAvg).filter(isNum));
  const rpe7 = avg(last7.map((d) => d.rpeAvg).filter(isNum));
  const sleep7 = avg(last7.map((d) => d.sleepAvg).filter(isNum));

  const fatiguePrev7 = avg(prev7.map((d) => d.fatigueAvg).filter(isNum));
  const rpePrev7 = avg(prev7.map((d) => d.rpeAvg).filter(isNum));
  const sleepPrev7 = avg(prev7.map((d) => d.sleepAvg).filter(isNum));

  const fatigue30 = avg(last30.map((d) => d.fatigueAvg).filter(isNum));
  const rpe30 = avg(last30.map((d) => d.rpeAvg).filter(isNum));
  const sleep30 = avg(last30.map((d) => d.sleepAvg).filter(isNum));

  const totalEntries30 = last30.reduce((sum, d) => sum + d.entries, 0);

  return (
    <section className="space-y-4">
      <header>
        <h2 className="text-base font-semibold">⚡ Pulso ADVANCE</h2>
        <p className="text-xs text-neutral-500 mt-0.5">
          Medias globales de los logs diarios de los atletas ADVANCE rolling. Para detectar fatiga acumulada,
          intensidad de cargas y calidad del sueño a nivel de grupo.
        </p>
      </header>

      {/* Adopción */}
      <div className="card">
        <div className="grid grid-cols-3 gap-3 text-center">
          <Adoption label="ADVANCE rolling" value={advanceRollingPatients} sub="atletas activos" />
          <Adoption label="Loguearon" value={uniqueLoggers7d} sub="últimos 7 días" />
          <Adoption label="Loguearon" value={uniqueLoggers30d} sub="últimos 30 días" />
        </div>
        <div className="text-[10px] text-neutral-400 text-center mt-2">
          {totalEntries30} entradas registradas en los últimos 30 días
        </div>
      </div>

      {/* Medias 7d con tendencia vs 7d anteriores */}
      <div>
        <div className="text-[11px] font-medium text-neutral-500 uppercase tracking-wider mb-2">Media 7 días</div>
        <div className="grid grid-cols-3 gap-2">
          <Stat color="#A78BFA" emoji="🪫" label="Fatiga" value={fatigue7} prev={fatiguePrev7} betterIsLower />
          <Stat color="#F87171" emoji="🔥" label="RPE" value={rpe7} prev={rpePrev7} betterIsLower={false} neutral />
          <Stat color="#60A5FA" emoji="😴" label="Sueño" value={sleep7} prev={sleepPrev7} betterIsLower={false} />
        </div>
      </div>

      {/* Medias 30d */}
      <div>
        <div className="text-[11px] font-medium text-neutral-500 uppercase tracking-wider mb-2">Media 30 días</div>
        <div className="grid grid-cols-3 gap-2">
          <Stat color="#A78BFA" emoji="🪫" label="Fatiga" value={fatigue30} />
          <Stat color="#F87171" emoji="🔥" label="RPE" value={rpe30} />
          <Stat color="#60A5FA" emoji="😴" label="Sueño" value={sleep30} />
        </div>
      </div>

      {/* Gráfico 60 días */}
      {daily.length >= 2 && (
        <div className="card">
          <div className="flex items-baseline justify-between mb-2">
            <div className="text-sm font-semibold">Tendencia · últimos 60 días</div>
            <div className="text-[10px] text-neutral-400">media diaria</div>
          </div>
          <Chart daily={daily} />
        </div>
      )}

      {daily.length === 0 && (
        <div className="card text-center py-10">
          <p className="text-sm text-neutral-500 italic">
            Todavía no hay logs registrados. En cuanto los atletas empiecen a registrar tras sus entrenos,
            verás aquí la tendencia global.
          </p>
        </div>
      )}
    </section>
  );
}

function isNum(x: unknown): x is number {
  return typeof x === "number" && Number.isFinite(x);
}
function avg(xs: number[]): number | null {
  if (xs.length === 0) return null;
  return Math.round((xs.reduce((a, b) => a + b, 0) / xs.length) * 10) / 10;
}

function Adoption({ label, value, sub }: { label: string; value: number; sub: string }) {
  return (
    <div>
      <div className="text-2xl font-bold tabular-nums" style={{ letterSpacing: "-0.02em" }}>{value}</div>
      <div className="text-[10px] text-neutral-500">{label}</div>
      <div className="text-[10px] text-neutral-400">{sub}</div>
    </div>
  );
}

function Stat({
  color, emoji, label, value, prev, betterIsLower, neutral,
}: {
  color: string;
  emoji: string;
  label: string;
  value: number | null;
  prev?: number | null;
  betterIsLower?: boolean;
  neutral?: boolean;
}) {
  const diff = value !== null && prev !== null && prev !== undefined ? Math.round((value - prev) * 10) / 10 : null;
  let trendColor = "#737373";
  let trendIcon = "→";
  if (diff !== null && Math.abs(diff) >= 0.2 && !neutral) {
    const isImproving = betterIsLower ? diff < 0 : diff > 0;
    trendColor = isImproving ? "#16A34A" : "#DC2626";
    trendIcon = diff > 0 ? "▲" : "▼";
  } else if (diff !== null && Math.abs(diff) >= 0.2) {
    trendIcon = diff > 0 ? "▲" : "▼";
  }
  return (
    <div className="rounded-lg px-3 py-2.5" style={{ background: "#FAFAFA", border: "1px solid #F0F0F0" }}>
      <div className="text-[10px] text-neutral-500">{emoji} {label}</div>
      <div className="flex items-baseline gap-1.5">
        <div className="text-2xl font-bold tabular-nums" style={{ color, letterSpacing: "-0.02em" }}>
          {value === null ? "—" : value}
        </div>
        {diff !== null && Math.abs(diff) >= 0.2 && (
          <span className="text-[10px] font-semibold tabular-nums" style={{ color: trendColor }}>
            {trendIcon} {Math.abs(diff).toFixed(1)}
          </span>
        )}
      </div>
    </div>
  );
}

function Chart({ daily }: { daily: DayAggregate[] }) {
  const W = 600, H = 140, PAD_X = 8, PAD_Y_TOP = 8, PAD_Y_BOT = 18;
  const n = daily.length;
  const xs = daily.map((_, i) => PAD_X + (i * (W - PAD_X * 2)) / Math.max(1, n - 1));
  const ys = (vals: (number | null)[]) =>
    vals.map((v) => v === null ? null : H - PAD_Y_BOT - (v / 10) * (H - PAD_Y_TOP - PAD_Y_BOT));

  function path(vals: (number | null)[]): string {
    const ysv = ys(vals);
    const parts: string[] = [];
    let lastNull = true;
    for (let i = 0; i < ysv.length; i++) {
      const y = ysv[i];
      if (y === null) { lastNull = true; continue; }
      parts.push(`${lastNull ? "M" : "L"} ${xs[i].toFixed(1)} ${y.toFixed(1)}`);
      lastNull = false;
    }
    return parts.join(" ");
  }

  // Hitos del eje X: primera, mitad, última
  const xTick = (i: number) => {
    const d = new Date(daily[i].dateIso);
    return d.toLocaleDateString("es-ES", { day: "numeric", month: "short" });
  };

  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} preserveAspectRatio="none">
        {/* Guías 0 / 5 / 10 */}
        <line x1={PAD_X} x2={W - PAD_X} y1={H - PAD_Y_BOT} y2={H - PAD_Y_BOT} stroke="#E5E5E5" />
        <line
          x1={PAD_X} x2={W - PAD_X}
          y1={H - PAD_Y_BOT - 0.5 * (H - PAD_Y_TOP - PAD_Y_BOT)}
          y2={H - PAD_Y_BOT - 0.5 * (H - PAD_Y_TOP - PAD_Y_BOT)}
          stroke="#F0F0F0" strokeDasharray="2 2"
        />
        <line x1={PAD_X} x2={W - PAD_X} y1={PAD_Y_TOP} y2={PAD_Y_TOP} stroke="#E5E5E5" />
        <path d={path(daily.map((d) => d.fatigueAvg))} stroke="#A78BFA" strokeWidth={1.5} fill="none" />
        <path d={path(daily.map((d) => d.rpeAvg))} stroke="#F87171" strokeWidth={1.5} fill="none" />
        <path d={path(daily.map((d) => d.sleepAvg))} stroke="#60A5FA" strokeWidth={1.5} fill="none" />
        {/* Tick labels */}
        <text x={PAD_X} y={H - 4} fontSize="9" fill="#A3A3A3">{xTick(0)}</text>
        {n > 2 && (
          <text x={W / 2} y={H - 4} fontSize="9" fill="#A3A3A3" textAnchor="middle">
            {xTick(Math.floor(n / 2))}
          </text>
        )}
        <text x={W - PAD_X} y={H - 4} fontSize="9" fill="#A3A3A3" textAnchor="end">{xTick(n - 1)}</text>
      </svg>
      <div className="flex justify-around text-[10px] mt-1 text-neutral-500">
        <span><span style={{ color: "#A78BFA" }}>●</span> Fatiga</span>
        <span><span style={{ color: "#F87171" }}>●</span> RPE</span>
        <span><span style={{ color: "#60A5FA" }}>●</span> Sueño</span>
      </div>
    </div>
  );
}
