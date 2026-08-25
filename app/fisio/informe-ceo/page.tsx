import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getActiveProfessional } from "@/lib/session";
import { CeoReportsClient } from "@/components/CeoReportsClient";

export const dynamic = "force-dynamic";

export default async function CeoReportPage() {
  const user = await getActiveProfessional();
  if (!user || user.role !== "ceo") {
    redirect("/fisio");
  }

  const reports = await (prisma as any).ceoReport.findMany({
    orderBy: { periodStart: "desc" },
    take: 40,
    select: {
      id: true,
      periodType: true,
      periodStart: true,
      periodEnd: true,
      periodLabel: true,
      generatedAt: true,
    },
  });

  const initialList = reports.map((r: any) => ({
    id: r.id,
    periodType: r.periodType,
    periodStart: r.periodStart.toISOString(),
    periodEnd: r.periodEnd.toISOString(),
    periodLabel: r.periodLabel,
    generatedAt: r.generatedAt.toISOString(),
  }));

  return (
    <main className="max-w-5xl mx-auto px-4 py-6">
      <header className="mb-6">
        <Link href="/fisio" className="text-xs text-neutral-500">← Volver al panel</Link>
        <h1 className="text-2xl font-semibold mt-1">🧠 Informe CEO</h1>
        <p className="text-sm text-neutral-500 mt-1">
          Resumen ejecutivo generado por IA con los datos de negocio del periodo. Se guarda para poder comparar tendencias.
        </p>
      </header>

      <CeoReportsClient initial={initialList} />
    </main>
  );
}
