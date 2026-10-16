import Link from "next/link";
import type { ReactNode } from "react";
import type { KpiDashboardData } from "@/lib/kpi-dashboard";

type Props = { data: KpiDashboardData };
type Tone = "neutral" | "good" | "warning";
const money = (value: number | null) => value === null ? "—" : value.toLocaleString("es-ES", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });
const preciseMoney = (value: number | null) => value === null ? "—" : value.toLocaleString("es-ES", { style: "currency", currency: "EUR", minimumFractionDigits: 2, maximumFractionDigits: 2 });
const count = (value: number | null) => value === null ? "—" : value.toLocaleString("es-ES");
const pct = (value: number | null) => value === null ? "—" : `${value.toLocaleString("es-ES", { maximumFractionDigits: 1 })}%`;
const ratio = (value: number | null) => value === null ? "—" : `${value.toLocaleString("es-ES", { maximumFractionDigits: 1 })}×`;
const day = (value: string | null) => value ? new Intl.DateTimeFormat("es-ES", { day: "2-digit", month: "short", year: "numeric", timeZone: "Europe/Madrid" }).format(new Date(value)) : "—";
const STATUS_LABELS: Record<string, string> = {
  won: "Venta", lost: "No compra", no_show: "No asiste", cancelled: "Cancelada",
  scheduled: "Agendada", pending: "Pendiente", new: "Nueva",
};

function Metric({ label, value, note, tone = "neutral" }: { label: string; value: string; note?: string; tone?: Tone }) {
  const color = tone === "good" ? "text-emerald-700" : tone === "warning" ? "text-amber-700" : "text-neutral-900";
  return <div className="card min-w-0">
    <p className="text-xs text-neutral-500">{label}</p>
    <p className={`mt-1 text-2xl font-semibold tabular-nums leading-8 ${color}`}>{value}</p>
    {note && <p className="mt-1.5 text-xs leading-5 text-neutral-500">{note}</p>}
  </div>;
}

function Section({ title, description, children }: { title: string; description?: string; children: ReactNode }) {
  return <section className="min-w-0">
    <div className="mb-3">
      <h2 className="text-sm font-semibold text-neutral-900">{title}</h2>
      {description && <p className="mt-1 text-xs leading-5 text-neutral-500">{description}</p>}
    </div>
    {children}
  </section>;
}

function Notes({ notes }: { notes: string[] }) {
  if (!notes.length) return null;
  return <div className="rounded-xl border border-neutral-200 bg-neutral-50 p-4 text-xs leading-5 text-neutral-600">
    {notes.map((note, i) => <p key={i} className={i ? "mt-1.5" : undefined}>{note}</p>)}
  </div>;
}

function CompactTable({ columns, rows, empty }: { columns: string[]; rows: ReactNode[][]; empty: string }) {
  return <div className="card overflow-x-auto p-0">
    <table className="w-full text-sm">
      <thead className="bg-neutral-100">
        <tr>{columns.map((column, i) => <th key={i} scope="col" className={`whitespace-nowrap px-3 py-2 text-xs font-medium text-neutral-500 ${i === 0 ? "text-left" : "text-right"}`}>{column}</th>)}</tr>
      </thead>
      <tbody className="divide-y divide-neutral-100">
        {rows.length ? rows.map((row, index) => <tr key={index} className="hover:bg-neutral-50">
          {row.map((cell, i) => <td key={i} className={`px-3 py-2.5 text-xs text-neutral-700 ${i === 0 ? "text-left" : "text-right tabular-nums whitespace-nowrap"}`}>{cell}</td>)}
        </tr>) : <tr><td colSpan={columns.length} className="px-4 py-8 text-center text-xs text-neutral-500">{empty}</td></tr>}
      </tbody>
    </table>
  </div>;
}

function SourceTable({ rows, firstColumn = "Vía" }: { rows: KpiDashboardData["sources"]["breakdown"]; firstColumn?: string }) {
  return <CompactTable
    columns={[firstColumn, "Agendadas", "Realizadas", "Ventas", "Show", "Cierre"]}
    rows={rows.map(row => [row.label, count(row.scheduled), count(row.done), count(row.won), pct(row.showRate), pct(row.closeRate)])}
    empty="Sin llamadas registradas en este período."
  />;
}

export function KpiAcquisitionView({ data }: Props) {
  const { acquisition: a, metrics: m } = data;
  return <div className="space-y-6">
    <Section title="Embudo de captación" description="Llamadas agrupadas por la fecha para la que se agendaron. Los resultados corresponden al estado registrado de cada lead.">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-6">
        <Metric label="Conversaciones" value="—" note="Sin registro consolidado" />
        <Metric label="Agendadas" value={count(a.scheduled)} />
        <Metric label="Realizadas" value={count(a.done)} note="Venta + no compra" />
        <Metric label="Ventas" value={count(a.won)} tone="good" />
        <Metric label="Show rate" value={pct(a.showRate)} note="Realizadas / (realizadas + no asiste)" />
        <Metric label="Tasa de cierre" value={pct(a.closeRate)} note="Ventas / realizadas" />
      </div>
      <p className="mt-3 text-xs leading-5 text-neutral-500">
        {count(a.lost)} no compra · {count(a.noShow)} no asiste · {count(a.cancelled)} canceladas · {count(a.pending)} pendientes
      </p>
    </Section>
    <div className="grid min-w-0 gap-6 min-[700px]:grid-cols-2">
      <Section title="Por vía de captación"><SourceTable rows={data.sources.breakdown} /></Section>
      <Section title="Por origen"><SourceTable rows={data.sources.origins} firstColumn="Origen" /></Section>
    </div>
    <Section title="Publicidad y comunidad" description={`Datos manuales de ${count(a.monthsWithInputs)} de ${count(a.monthsInPeriod)} meses del período. Los campos vacíos se mantienen sin dato.`}>
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-3">
        <Metric label="Nuevos seguidores" value={count(a.newFollowers)} />
        <Metric label="Seguidores totales" value={count(a.totalFollowers)} note="Último valor disponible del período" />
        <Metric label="Coste por seguidor" value={preciseMoney(a.costPerFollower)} note="Follow me ADS / nuevos seguidores" />
        <Metric label="Follow me ADS" value={money(a.followAds)} />
        <Metric label="Conversión ADS" value={money(a.conversionAds)} />
        <Metric label="Gastos contables de captación" value={money(a.acquisitionExpenses)} note="Se muestran aparte de la fórmula histórica de CAC" />
      </div>
    </Section>
    <Section title="Coste de adquisición" description="Se conserva la fórmula del cuadro de mandos de FisioFitCross y su base de altas registradas.">
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <Metric label="Inversión ADS" value={money(m.marketingSpend)} />
        <Metric label="Comisión closer" value={money(m.closerCommission)} />
        <Metric label="Sueldo closer" value={money(m.closerSalary)} />
        <Metric label="CAC" value={money(m.cac)} note={`ADS + comisión + sueldo / ${count(m.newAltas)} registros de alta`} />
      </div>
      <div className="mt-3 grid grid-cols-2 gap-3">
        <Metric label="Altas registradas" value={count(m.newAltas)} note="Transacciones de tipo alta nueva" />
        <Metric label="Ticket medio" value={money(m.ticketAvg)} note="Ingresos de altas / registros de alta" />
      </div>
    </Section>
    <Notes notes={a.notes} />
    <details className="card">
      <summary className="cursor-pointer text-sm font-medium text-neutral-700">Ver llamadas que forman el embudo ({count(data.leads.length)})</summary>
      <div className="mt-4">
        <CompactTable columns={["Persona", "Fecha de llamada", "Resultado", "Vía", "Origen"]}
          rows={data.leads.map(lead => [lead.fullName || "Sin nombre", day(lead.callScheduledAt), STATUS_LABELS[lead.status] || lead.status, lead.source || "Sin vía", lead.origin])}
          empty="No hay llamadas agendadas en el período seleccionado." />
      </div>
    </details>
  </div>;
}

export function KpiHealthView({ data }: Props) {
  const { health: h, metrics: m } = data;
  return <div className="space-y-6">
    <Section title="Evolución de la cartera" description="La cartera del período se reconstruye con los intervalos de suscripción disponibles. La cifra actual se muestra por separado.">
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-3">
        <Metric label="Activos al inicio" value={count(h.activeAtStart)} />
        <Metric label="Activos al cierre" value={count(h.activeAtEnd)} note={data.period.isPartial ? "Hasta la fecha disponible" : "Al final del período"} />
        <Metric label="Activos ahora" value={count(h.activeNow)} note="Suscripción vigente en este momento" />
        <Metric label="Activos · criterio anterior" value={count(h.activeLegacy)} note="Cálculo histórico del resumen de negocio" />
        <Metric label="Entradas netas" value={count(h.additions)} note="Personas que aparecen entre los dos cortes" />
        <Metric label="Salidas de cohorte" value={count(h.departures)} note="Personas que desaparecen entre los dos cortes" />
        <Metric label="Churn estimado" value={pct(h.churnRate)} note="Salidas estimadas / activos al inicio" />
      </div>
    </Section>
    <Section title="Retención y valor del cliente">
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-3">
        <Metric label="Renovaciones" value={count(m.renewedCount)} note="Decisiones de renovación en el período" />
        <Metric label="Bajas" value={count(m.lostCount)} note="Bajas efectivas en el período" />
        <Metric label="Tasa de renovación" value={pct(m.renewalRate)} note="Renovaciones / (renovaciones + bajas)" />
        <Metric label="LTV registrado" value={money(m.ltv)} note={`Histórico · ${count(m.ltvPatients)} pacientes con pagos`} tone="good" />
        <Metric label="LTV / CAC" value={ratio(m.ltvCacRatio)} note="Referencia orientativa: 3×" tone={m.ltvCacRatio !== null && m.ltvCacRatio >= 3 ? "good" : m.ltvCacRatio !== null && m.ltvCacRatio < 1 ? "warning" : "neutral"} />
        <Metric label="ARPU del período" value={money(h.arpu)} note="Ingresos / media de activos al inicio y cierre · sin mensualizar" />
      </div>
    </Section>
    <Notes notes={h.notes} />
    <details className="card text-xs leading-5 text-neutral-600">
      <summary className="cursor-pointer font-medium text-neutral-700">Cómo se interpretan estas métricas</summary>
      <p className="mt-3">El LTV divide los ingresos históricos registrados entre los pacientes con pagos. El ratio LTV / CAC combina ese histórico con el coste de adquisición del período seleccionado.</p>
      <p className="mt-2">Los movimientos estimados comparan personas entre dos fechas; una entrada y salida dentro del mismo período pueden no aparecer en esos cortes. El churn se presenta como estimación.</p>
      <p className="mt-2">La duración media no se estima a partir del churn: faltan intervalos históricos completos para calcularla con fiabilidad.</p>
    </details>
  </div>;
}

export function KpiPaymentsView({ data }: Props) {
  const { payments: p } = data;
  const selectedMonth = data.period.start.slice(0, 7);
  const selectedYear = selectedMonth.slice(0, 4);
  const incomeType = (type: string) => type === "income_new" ? "Alta nueva" : type === "income_renewal" ? "Renovación" : (type === "income" || type === "income_other") ? "Otro ingreso" : type.replace(/_/g, " ");
  return <div className="space-y-6">
    <div className="flex flex-wrap gap-2">
      <Link href={`/fisio/finanzas?specificMonth=${selectedMonth}`} className="btn btn-ghost">Gestionar movimientos</Link>
      <Link href={`/fisio/finanzas/facturas-pacientes?year=${selectedYear}&specificMonth=${selectedMonth}`} className="btn btn-ghost">Facturas a pacientes</Link>
    </div>
    <Section title="Ingresos registrados" description="Movimientos que alimentan el resumen financiero del período seleccionado.">
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <Metric label="Ingresos" value={preciseMoney(p.income)} tone="good" />
        <Metric label="Gastos" value={preciseMoney(p.expense)} />
        <Metric label="Beneficio" value={preciseMoney(p.profit)} tone={p.profit < 0 ? "warning" : "neutral"} />
        <Metric label="Registros de ingreso" value={count(p.rowCount)} />
      </div>
    </Section>
    <Section title="Detalle de ingresos" description="Este listado muestra ingresos registrados; consulta la ficha de cada paciente para revisar sus pagos.">
      <CompactTable columns={["Paciente", "Fecha", "Concepto", "Tipo", "Procedencia", "Importe"]}
        rows={p.rows.map(row => [
          row.patientId
            ? <Link key="patient" href={`/fisio/paciente/${encodeURIComponent(row.patientId)}`} className="font-medium underline decoration-neutral-300 underline-offset-2 hover:text-neutral-900">{row.patientName || "Ver paciente"}</Link>
            : row.patientName || "Sin paciente vinculado",
          day(row.date),
          <div key="description" className="max-w-sm whitespace-normal text-left">{row.description || "Sin descripción"}</div>,
          incomeType(row.type),
          <span key="source" className={`inline-flex rounded-md px-2 py-1 text-[11px] ${row.source === "legacy-renewal" ? "bg-amber-50 text-amber-800" : "bg-neutral-100 text-neutral-600"}`}>{row.source === "legacy-renewal" ? "Renovación histórica" : "Transacción"}</span>,
          <span key="amount" className="font-medium">{preciseMoney(row.amount)}</span>,
        ])}
        empty="No hay ingresos registrados en este período." />
      {p.truncated && <p className="mt-2 text-xs text-neutral-500">Se muestran {count(p.rows.length)} de {count(p.rowCount)} registros. Los importes del resumen incluyen todos.</p>}
    </Section>
    <Section title="Composición de los ingresos">
      <div className="grid grid-cols-1 gap-3 min-[700px]:grid-cols-2">
        <Metric label="Transacciones" value={preciseMoney(p.transactionsIncome)} note="Movimientos de ingreso existentes" />
        <Metric label="Renovaciones históricas" value={preciseMoney(p.legacyRenewalIncome)} note="Importes de compatibilidad incluidos por el cálculo financiero" />
      </div>
    </Section>
    <Notes notes={p.notes} />
    <p className="text-xs leading-5 text-neutral-500">La procedencia indica dónde se guardó cada ingreso. Para consultar más información sobre un pago, abre la ficha del paciente.</p>
  </div>;
}

export function KpiDiagnosisView({ data }: Props) {
  const { diagnosis: d, metrics: m, acquisition: a, payments: p } = data;
  return <div className="space-y-6">
    <Section title="Lectura del negocio" description="Indicadores del período y comprobaciones sobre la información que ya existe.">
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <Metric label="Margen de beneficio" value={pct(m.profitPct)} tone={m.profitPct !== null && m.profitPct < 0 ? "warning" : "neutral"} note="Beneficio / ingresos" />
        <Metric label="Cierre comercial" value={pct(a.closeRate)} note={`${count(a.won)} ventas en ${count(a.done)} llamadas realizadas`} />
        <Metric label="Renovación" value={pct(m.renewalRate)} note={`${count(m.renewedCount)} renovaciones · ${count(m.lostCount)} bajas`} />
        <Metric label="LTV / CAC" value={ratio(m.ltvCacRatio)} note="LTV histórico / CAC del período" tone={m.ltvCacRatio !== null && m.ltvCacRatio >= 3 ? "good" : "neutral"} />
      </div>
    </Section>
    <Section title="Coherencia de las fuentes financieras">
      <CompactTable columns={["Base de cálculo", "Ingresos"]}
        rows={[
          ["Resumen financiero", preciseMoney(d.financeIncome)],
          ["Ingresos con criterio de tabla anual", preciseMoney(d.monthlyIncome)],
          ["Diferencia entre ambas bases", <span key="difference" className={d.incomeDifference === 0 ? "text-emerald-700" : "text-amber-700"}>{preciseMoney(d.incomeDifference)}</span>],
          ["Transacciones de ingreso", preciseMoney(p.transactionsIncome)],
          ["Renovaciones históricas incluidas en finanzas", preciseMoney(p.legacyRenewalIncome)],
        ]}
        empty="Sin información financiera para este período." />
      <p className="mt-2 text-xs leading-5 text-neutral-500">Las bases existentes se muestran por separado para poder revisar diferencias conservando su historial.</p>
    </Section>
    <Section title="Comprobaciones">
      <div className="space-y-3">
        {d.findings.length ? d.findings.map(finding => <div key={finding.key} className="card">
          <div className="flex items-start gap-3">
            <span aria-hidden="true" className={`mt-1.5 h-2 w-2 flex-none rounded-full ${finding.severity === "warning" ? "bg-amber-400" : "bg-neutral-300"}`} />
            <div className="min-w-0">
              <h3 className="text-sm font-medium text-neutral-900">{finding.title}</h3>
              <p className="mt-1 text-xs leading-5 text-neutral-600">{finding.detail}</p>
            </div>
          </div>
        </div>) : <div className="card text-xs text-neutral-500">No se han detectado comprobaciones adicionales para este período.</div>}
      </div>
    </Section>
    <Section title="Criterios de cálculo">
      <CompactTable columns={["Métrica", "Fórmula y alcance"]}
        rows={[
          ["CAC", <span key="cac" className="block max-w-xl whitespace-normal text-left">ADS + comisión closer + sueldo closer, dividido entre transacciones de alta nueva del período.</span>],
          ["LTV", <span key="ltv" className="block max-w-xl whitespace-normal text-left">Ingresos históricos registrados por paciente con pagos; no es una proyección de valor futuro.</span>],
          ["Show rate", "Realizadas / (realizadas + no asiste)."],
          ["Tasa de cierre", "Ventas / llamadas realizadas."],
          ["Renovación", "Renovaciones / (renovaciones + bajas)."],
        ]}
        empty="Sin criterios disponibles." />
    </Section>
  </div>;
}

export function KpiSourcesView({ data }: Props) {
  const { sources: s } = data;
  const active = s.catalog.filter(source => source.active).length;
  return <div className="space-y-6">
    <Section title="Vías de captación" description="Catálogo existente y resultados de las llamadas del período por vía.">
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-3">
        <Metric label="Vías activas" value={count(active)} />
        <Metric label="Vías archivadas" value={count(s.catalog.length - active)} note="Se mantienen para conservar el histórico" />
        <Metric label="Vías con llamadas" value={count(s.breakdown.length)} note="Incluye registros sin vía, si los hay" />
      </div>
    </Section>
    <Section title="Resultados por vía"><SourceTable rows={s.breakdown} /></Section>
    <Section title="Origen de las llamadas"><SourceTable rows={s.origins} firstColumn="Origen" /></Section>
    <Section title="Catálogo de vías">
      <CompactTable columns={["Vía", "Estado"]}
        rows={s.catalog.map(source => [
          <span key="label" className="inline-flex items-center gap-2"><span aria-hidden="true" className="h-2 w-2 rounded-full bg-neutral-300" style={source.color && /^#[0-9a-f]{3,8}$/i.test(source.color) ? { backgroundColor: source.color } : undefined} />{source.label}</span>,
          <span key="state" className={source.active ? "text-emerald-700" : "text-neutral-500"}>{source.active ? "Activa" : "Archivada"}</span>,
        ])}
        empty="Todavía no hay vías en el catálogo. Las llamadas existentes se conservan en su desglose." />
    </Section>
    <Notes notes={s.notes} />
  </div>;
}
