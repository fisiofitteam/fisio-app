import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getActiveProfessional } from "@/lib/session";

export const dynamic = "force-dynamic";

function eur(n: number) {
  return n.toLocaleString("es-ES", { style: "currency", currency: "EUR", minimumFractionDigits: 0 });
}

export default async function PatientInvoicesListPage({
  searchParams,
}: {
  searchParams: { year?: string };
}) {
  const user = await getActiveProfessional();
  if (!user) redirect("/login");
  if (user.role !== "ceo") redirect("/fisio/finanzas");

  const now = new Date();
  const selectedYear = Number(searchParams.year) || now.getUTCFullYear();

  const invoices = await prisma.patientInvoice.findMany({
    where: { year: selectedYear },
    orderBy: [{ sequence: "desc" }],
  });

  // Lista de años con facturas para el selector
  const years = await prisma.patientInvoice.groupBy({
    by: ["year"],
    orderBy: { year: "desc" },
  });

  const totalActive = invoices
    .filter((i) => !i.cancelledAt)
    .reduce((sum, i) => sum + i.totalAmount, 0);

  return (
    <main>
      <div className="mb-4 flex items-baseline justify-between gap-3 flex-wrap">
        <div>
          <Link href="/fisio/finanzas" className="text-xs text-neutral-500 hover:underline">
            ← Finanzas
          </Link>
          <h1 className="text-xl font-semibold mt-1">Facturas a pacientes</h1>
          <p className="text-xs text-neutral-500 mt-0.5">
            Año {selectedYear} · {invoices.length} facturas · Total facturado{" "}
            <strong className="text-neutral-700">{eur(totalActive)}</strong>
            {invoices.some((i) => i.cancelledAt) && (
              <> · {invoices.filter((i) => i.cancelledAt).length} anuladas</>
            )}
          </p>
        </div>

        {years.length > 1 && (
          <div className="flex gap-1">
            {years.map((y) => (
              <Link
                key={y.year}
                href={`/fisio/finanzas/facturas-pacientes?year=${y.year}`}
                className={`text-xs px-3 py-1.5 rounded-lg border ${
                  y.year === selectedYear
                    ? "bg-neutral-900 text-white border-neutral-900"
                    : "bg-white border-neutral-200 text-neutral-500"
                }`}
              >
                {y.year}
              </Link>
            ))}
          </div>
        )}
      </div>

      {invoices.length === 0 ? (
        <section className="card text-center py-12">
          <div className="text-3xl mb-2">🧾</div>
          <p className="text-sm text-neutral-500">
            No hay facturas en {selectedYear}. Para emitir una, abre la ficha
            de un paciente → pestaña "Suscripción" → botón "Emitir factura".
          </p>
        </section>
      ) : (
        <section className="card overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-neutral-500 uppercase border-b border-neutral-200">
                <th className="text-left py-2 px-2 font-medium">Número</th>
                <th className="text-left py-2 px-2 font-medium">Fecha</th>
                <th className="text-left py-2 px-2 font-medium">Cliente</th>
                <th className="text-left py-2 px-2 font-medium">Concepto</th>
                <th className="text-right py-2 px-2 font-medium">Total</th>
                <th className="text-center py-2 px-2 font-medium">Estado</th>
                <th className="text-right py-2 px-2 font-medium">PDF</th>
              </tr>
            </thead>
            <tbody>
              {invoices.map((inv) => (
                <tr key={inv.id} className="border-b border-neutral-100">
                  <td className="py-2.5 px-2 font-mono font-medium">{inv.number}</td>
                  <td className="py-2.5 px-2 text-neutral-500 text-xs">
                    {inv.issueDate.toLocaleDateString("es-ES", { day: "2-digit", month: "short" })}
                  </td>
                  <td className="py-2.5 px-2">
                    {inv.patientId ? (
                      <Link
                        href={`/fisio/paciente/${inv.patientId}/ficha`}
                        className="hover:underline"
                      >
                        {inv.clientName}
                      </Link>
                    ) : (
                      <span className="text-neutral-500 italic">{inv.clientName} (paciente borrado)</span>
                    )}
                  </td>
                  <td className="py-2.5 px-2 text-xs text-neutral-600 max-w-md truncate">
                    {inv.concept}
                  </td>
                  <td className="py-2.5 px-2 text-right tabular-nums font-medium">
                    {eur(inv.totalAmount)}
                  </td>
                  <td className="py-2.5 px-2 text-center">
                    {inv.cancelledAt ? (
                      <span className="text-[10px] uppercase bg-red-100 text-red-800 px-2 py-0.5 rounded-full">
                        Anulada
                      </span>
                    ) : (
                      <span className="text-[10px] uppercase bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded-full">
                        Emitida
                      </span>
                    )}
                  </td>
                  <td className="py-2.5 px-2 text-right">
                    <Link
                      href={`/fisio/factura-paciente/${inv.id}`}
                      className="text-[11px] text-blue-600 hover:underline"
                    >
                      Ver / descargar
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
    </main>
  );
}
