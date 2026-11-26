import Link from "next/link";
import { record } from "@/lib/ceo-direction-contract";
const money = (v: unknown) => typeof v === "number" && Number.isFinite(v) ? (v / 100).toLocaleString("es-ES", { style: "currency", currency: "EUR" }) : "Sin dato";
const count = (v: unknown) => typeof v === "number" && Number.isFinite(v) ? String(v) : "Sin dato";
export function CeoBankSnapshot({ banking, historical = false }: { banking: unknown; historical?: boolean }) {
  const b = record(banking);
  if (!Object.keys(b).length) return null;
  const available = b.status === "available";
  const states: Record<string, string> = { available: "Datos disponibles", stale: "Saldo desactualizado", error: "Importación con error", paused: "Importación pausada", unavailable: "Datos no disponibles", not_configured: "Banco sin conectar" };
  const asOf = typeof b.asOf === "string" && Number.isFinite(Date.parse(b.asOf)) ? new Date(b.asOf).toLocaleString("es-ES", { timeZone: "Europe/Madrid" }) : null;
  return <section className="rounded-xl border border-amber-200 bg-amber-50/40 p-4 space-y-3">
    <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="font-semibold text-sm">{historical ? "Tesorería guardada con el informe" : "Tesorería del negocio"}</h3><Link href="/fisio/finanzas/banco" className="text-xs underline">Banco y tesorería →</Link></div>
    <p className="text-xs text-neutral-600">{states[String(b.status)] || "Sin dato"}{asOf ? " · Última importación: " + asOf : ""}{historical ? " · Fotografía de publicación, no saldo actual." : ""}</p>
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">{[
      ["Saldo bancario", money(b.currentBalanceCents)], ["Pendiente de validar", money(b.pendingExpenseCents)],
      ["Candidatos pendientes", count(b.pendingExpenseCount)], ["Posibles suscripciones", count(b.subscriptionCount)],
    ].map(([label,value]) => <div key={label}><p className="text-xs text-neutral-500">{label}</p><p className="font-semibold tabular-nums mt-1">{value}</p></div>)}</div>
    <p className="text-xs text-neutral-600">Los candidatos no están contabilizados. Los abonos de Stripe no son nuevos ingresos contables. {available ? "" : "Revisa el estado de la conexión antes de utilizar el saldo."}</p>
    <Link href="/fisio/finanzas/gastos-pendientes" className="inline-block text-xs font-medium underline">Revisar gastos pendientes</Link>
  </section>;
}
