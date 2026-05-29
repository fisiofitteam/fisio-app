import type { LeadOriginMetrics } from "@/lib/sales";

// Bloque visual con el desglose de origen del lead (IA vs Setter) y % de cierre
// de cada origen. Server component.
export function LeadOriginBlock({
  metrics, periodLabel,
}: {
  metrics: LeadOriginMetrics;
  periodLabel: string;
}) {
  const {
    aiCount, setterCount, total, aiPct, setterPct,
    aiCloseRate, setterCloseRate, aiWon, aiLost,
    aiNoShow, setterNoShow, aiNoShowRate, setterNoShowRate,
    setterWon, setterLost,
  } = metrics;

  return (
    <section className="card mb-3 relative overflow-hidden">
      <div className="absolute top-0 left-0 w-1 h-full" style={{ background: "linear-gradient(180deg, #8B5CF6 0%, #6D28D9 100%)" }} />
      <div className="pl-2 mb-3">
        <h2 className="font-medium text-sm">Origen de leads — IA vs Setter</h2>
        <p className="text-xs text-neutral-500 capitalize">{periodLabel} · {total} {total === 1 ? "lead agendado" : "leads agendados"}</p>
      </div>

      {total === 0 ? (
        <p className="text-sm text-neutral-400 italic text-center py-6">
          Aún no hay leads agendados en este período.
        </p>
      ) : (
        <>
          {/* Barra de proporción visual */}
          <div className="px-2 mb-3">
            <div className="flex h-2 rounded-full overflow-hidden bg-neutral-100">
              {aiCount > 0 && (
                <div style={{ width: `${aiPct}%`, background: "#8B5CF6" }} title={`IA: ${aiCount} (${aiPct}%)`} />
              )}
              {setterCount > 0 && (
                <div style={{ width: `${setterPct}%`, background: "#0A0A0A" }} title={`Setter: ${setterCount} (${setterPct}%)`} />
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 px-2">
            <OriginCard
              color="#8B5CF6"
              label="🤖 IA"
              count={aiCount}
              pct={aiPct}
              closeRate={aiCloseRate}
              noShowRate={aiNoShowRate}
              won={aiWon}
              lost={aiLost}
              noShow={aiNoShow}
            />
            <OriginCard
              color="#0A0A0A"
              label="🧑 Setter (manual)"
              count={setterCount}
              pct={setterPct}
              closeRate={setterCloseRate}
              noShowRate={setterNoShowRate}
              won={setterWon}
              lost={setterLost}
              noShow={setterNoShow}
            />
          </div>
        </>
      )}
    </section>
  );
}

function OriginCard({
  color, label, count, pct, closeRate, noShowRate, won, lost, noShow,
}: {
  color: string;
  label: string;
  count: number;
  pct: number | null;
  closeRate: number | null;
  noShowRate: number | null;
  won: number;
  lost: number;
  noShow: number;
}) {
  return (
    <div className="rounded-lg p-3 border border-neutral-200">
      <div className="flex items-center gap-2 mb-1">
        <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: color }} />
        <span className="text-xs font-medium text-neutral-700">{label}</span>
      </div>
      <div className="flex items-baseline gap-2">
        <span className="text-2xl font-semibold text-neutral-900 tabular-nums">{count}</span>
        {pct !== null && (
          <span className="text-sm text-neutral-500 tabular-nums">{pct}% del total</span>
        )}
      </div>

      <div className="mt-2 pt-2 border-t border-neutral-100 grid grid-cols-2 gap-3">
        <div>
          <div className="text-xs text-neutral-500">% cierre</div>
          <div className="text-lg font-semibold tabular-nums" style={{ color }}>
            {closeRate !== null ? `${closeRate}%` : "—"}
          </div>
          <div className="text-[11px] text-neutral-400 mt-0.5">
            {won}V · {lost}P
          </div>
        </div>
        <div>
          <div className="text-xs text-neutral-500">% no-show</div>
          <div className="text-lg font-semibold tabular-nums text-amber-700">
            {noShowRate !== null ? `${noShowRate}%` : "—"}
          </div>
          <div className="text-[11px] text-neutral-400 mt-0.5">
            {noShow} no acudieron
          </div>
        </div>
      </div>
    </div>
  );
}
