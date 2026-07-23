import { getActiveProfessional } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { RenewalRatesTable } from "./RenewalRatesTable";

export const dynamic = "force-dynamic";

export default async function TarifasPage() {
  const user = (await getActiveProfessional())!;
  const rates = await (prisma as any).renewalRate.findMany({
    orderBy: [{ programType: "asc" }, { periodMonths: "asc" }],
  });

  return (
    <div className="space-y-4">
      <header>
        <h2 className="font-medium text-lg flex items-center gap-2">
          💶 Tarifas de renovación
        </h2>
        <p className="text-xs text-neutral-500 mt-1">
          Precios por programa y duración contratada. {user.role === "ceo"
            ? "Puedes editarlos aquí."
            : "Solo el CEO puede modificarlos — para consulta al cerrar renovaciones."}
        </p>
      </header>
      <RenewalRatesTable
        initial={rates.map((r: any) => ({
          id: r.id,
          programType: r.programType,
          periodMonths: r.periodMonths,
          amount: r.amount,
          currency: r.currency,
          notes: r.notes,
        }))}
        canEdit={user.role === "ceo"}
      />
    </div>
  );
}
