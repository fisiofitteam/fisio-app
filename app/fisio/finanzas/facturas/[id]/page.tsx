import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getActiveProfessional } from "@/lib/session";
import { computeMonthlySalary } from "@/lib/compensation";

export const dynamic = "force-dynamic";

const ROLE_LABELS: Record<string, string> = {
  ceo: "CEO", head_success: "Head of Success", fisio: "Fisioterapeuta", setter: "Setter", closer: "Closer",
};

function eur(n: number) {
  return n.toLocaleString("es-ES", { style: "currency", currency: "EUR", minimumFractionDigits: 0 });
}

export default async function ProfessionalInvoiceHistory({ params }: { params: { id: string } }) {
  const user = await getActiveProfessional();
  if (!user || user.role !== "ceo") redirect("/fisio");

  const pro = await prisma.professional.findUnique({ where: { id: params.id }, select: { fullName: true, role: true } });
  if (!pro) notFound();

  const now = new Date();
  // Últimos 12 meses (incluido el actual), más reciente primero
  const months: { year: number; month: number }[] = [];
  let y = now.getUTCFullYear(), m = now.getUTCMonth();
  for (let i = 0; i < 12; i++) {
    months.push({ year: y, month: m });
    m--; if (m < 0) { m = 11; y--; }
  }

  const payments = await prisma.payrollPayment.findMany({ where: { professionalId: params.id } });
  const paidSet = new Set(payments.map((p) => `${p.year}-${p.month}`));

  const rows = await Promise.all(
    months.map(async ({ year, month }) => {
      const s = await computeMonthlySalary(params.id, year, month);
      const label = new Date(Date.UTC(year, month, 1)).toLocaleDateString("es-ES", { month: "long", year: "numeric", timeZone: "UTC" });
      return { year, month, label, total: s.total, paid: paidSet.has(`${year}-${month}`) };
    })
  );

  return (
    <div>
      <div className="mb-4">
        <Link href="/fisio/finanzas/facturas" className="text-xs text-neutral-500 hover:underline">← Facturas equipo</Link>
        <h1 className="text-xl font-semibold mt-1">Histórico de facturas</h1>
        <p className="text-xs text-neutral-500 mt-0.5">{pro.fullName} · {ROLE_LABELS[pro.role] ?? pro.role}</p>
      </div>

      <section className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-xs text-neutral-500 uppercase border-b border-neutral-200">
              <th className="text-left py-2 px-2 font-medium">Mes</th>
              <th className="text-right py-2 px-2 font-medium">Total</th>
              <th className="text-center py-2 px-2 font-medium">Estado</th>
              <th className="text-right py-2 px-2 font-medium">Factura</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={`${r.year}-${r.month}`} className="border-b border-neutral-100">
                <td className="py-2.5 px-2 font-medium capitalize">{r.label}</td>
                <td className="py-2.5 px-2 text-right tabular-nums">{eur(r.total)}</td>
                <td className="py-2.5 px-2 text-center">
                  {r.paid ? (
                    <span className="text-[10px] uppercase bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded-full">✓ Pagada</span>
                  ) : (
                    <span className="text-[10px] uppercase bg-neutral-100 text-neutral-500 px-2 py-0.5 rounded-full">—</span>
                  )}
                </td>
                <td className="py-2.5 px-2 text-right">
                  <Link href={`/fisio/factura/${params.id}?year=${r.year}&month=${r.month}`} className="text-[11px] text-blue-600 hover:underline">
                    Ver / descargar
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
      <p className="text-[11px] text-neutral-400 mt-3">Últimos 12 meses. "Ver / descargar" abre la factura imprimible (guardar como PDF).</p>
    </div>
  );
}
