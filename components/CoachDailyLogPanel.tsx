// Panel para el coach: histórico de logs diarios (fatiga/RPE/sueño) del paciente
// ADVANCE. Muestra medias 7d, gráfico de 30 días y tabla.

type Entry = {
  recordedDate: string; // ISO
  fatigue: number;
  rpe: number;
  sleep: number;
};

export function CoachDailyLogPanel({ entries }: { entries: Entry[] }) {
  if (entries.length === 0) {
    return (
      <section className="card">
        <h2 className="font-semibold text-sm mb-1">📊 Log diario · Fatiga / RPE / Sueño</h2>
        <p className="text-xs text-neutral-500 italic">El paciente todavía no ha registrado ningún log.</p>
      </section>
    );
  }

  // entries vienen en orden DESCendente (más reciente primero)
  const last7 = entries.slice(0, 7);
  const last30 = entries.slice(0, 30).slice().reverse(); // ascendente para el gráfico

  const avgFatigue = avg(last7.map((e) => e.fatigue));
  const avgRpe = avg(last7.map((e) => e.rpe));
  const avgSleep = avg(last7.map((e) => e.sleep));

  return (
    <section className="card">
      <div className="flex items-baseline justify-between mb-3">
        <h2 className="font-semibold text-sm">📊 Log diario · Fatiga / RPE / Sueño</h2>
        <span className="text-xs text-neutral-500">{entries.length} entradas</span>
      </div>

      <div className="grid grid-cols-3 gap-2 mb-4">
        <Stat color="#A78BFA" emoji="🪫" label="Fatiga" sub="media 7d" value={avgFatigue} />
        <Stat color="#F87171" emoji="🔥" label="RPE" sub="media 7d" value={avgRpe} />
        <Stat color="#60A5FA" emoji="😴" label="Sueño" sub="media 7d" value={avgSleep} />
      </div>

      {last30.length >= 2 && (
        <div className="mb-4">
          <div className="text-[10px] text-neutral-400 mb-1">Últimos 30 días</div>
          <Chart entries={last30} />
        </div>
      )}

      <div className="text-[10px] text-neutral-400 mb-1">Histórico</div>
      <div className="overflow-x-auto -mx-3">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-[11px] text-neutral-500">
              <th className="text-left px-3 py-1 font-medium">Día</th>
              <th className="text-right px-3 py-1 font-medium">🪫 Fatiga</th>
              <th className="text-right px-3 py-1 font-medium">🔥 RPE</th>
              <th className="text-right px-3 py-1 font-medium">😴 Sueño</th>
            </tr>
          </thead>
          <tbody>
            {entries.slice(0, 30).map((e, i) => (
              <tr
                key={i}
                style={{ borderTop: i === 0 ? "none" : "1px solid #F5F5F5" }}
              >
                <td className="px-3 py-1.5 text-xs text-neutral-600">
                  {new Date(e.recordedDate).toLocaleDateString("es-ES", { day: "numeric", month: "short", weekday: "short" })}
                </td>
                <td className="px-3 py-1.5 text-right tabular-nums">{e.fatigue}</td>
                <td className="px-3 py-1.5 text-right tabular-nums">{e.rpe}</td>
                <td className="px-3 py-1.5 text-right tabular-nums">{e.sleep}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function avg(xs: number[]): number | null {
  if (xs.length === 0) return null;
  return Math.round((xs.reduce((a, b) => a + b, 0) / xs.length) * 10) / 10;
}

function Stat({ color, emoji, label, sub, value }: { color: string; emoji: string; label: string; sub: string; value: number | null }) {
  return (
    <div className="rounded-lg px-3 py-2" style={{ background: "#FAFAFA", border: "1px solid #F0F0F0" }}>
      <div className="text-[10px] text-neutral-500">{emoji} {label}</div>
      <div className="text-xl font-bold tabular-nums" style={{ color, letterSpacing: "-0.02em" }}>
        {value === null ? "—" : value}
      </div>
      <div className="text-[9px] text-neutral-400">{sub}</div>
    </div>
  );
}

function Chart({ entries }: { entries: Entry[] }) {
  const W = 600, H = 110, PAD = 6;
  const n = entries.length;
  const xs = entries.map((_, i) => PAD + (i * (W - PAD * 2)) / Math.max(1, n - 1));
  const ys = (vals: number[]) => vals.map((v) => H - PAD - (v / 10) * (H - PAD * 2));
  const path = (vals: number[]) =>
    ys(vals).map((y, i) => `${i === 0 ? "M" : "L"} ${xs[i].toFixed(1)} ${y.toFixed(1)}`).join(" ");

  return (
    <div className="rounded-lg p-2" style={{ background: "#FAFAFA", border: "1px solid #F0F0F0" }}>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} preserveAspectRatio="none">
        {/* Guías 0, 5, 10 */}
        <line x1={0} x2={W} y1={H - PAD} y2={H - PAD} stroke="#E5E5E5" />
        <line x1={0} x2={W} y1={PAD + (H - PAD * 2) / 2} y2={PAD + (H - PAD * 2) / 2} stroke="#F0F0F0" strokeDasharray="2 2" />
        <line x1={0} x2={W} y1={PAD} y2={PAD} stroke="#E5E5E5" />
        <path d={path(entries.map((e) => e.fatigue))} stroke="#A78BFA" strokeWidth={1.5} fill="none" />
        <path d={path(entries.map((e) => e.rpe))} stroke="#F87171" strokeWidth={1.5} fill="none" />
        <path d={path(entries.map((e) => e.sleep))} stroke="#60A5FA" strokeWidth={1.5} fill="none" />
      </svg>
      <div className="flex justify-around text-[10px] mt-1 text-neutral-500">
        <span><span style={{ color: "#A78BFA" }}>●</span> Fatiga</span>
        <span><span style={{ color: "#F87171" }}>●</span> RPE</span>
        <span><span style={{ color: "#60A5FA" }}>●</span> Sueño</span>
      </div>
    </div>
  );
}
