/**
 * GET /api/admin/paypal-duplicate-tx
 *
 * Devuelve pares sospechosos de Transaction duplicadas (bugs PayPal + de
 * applyRenewal que creaba doblete). Solo lectura, solo CEO.
 *
 * Criterio: dos transacciones income_renewal o income_new del MISMO paciente
 * creadas con < 5 min de diferencia. No filtramos por importe ni por texto:
 * las manuales "Renovación - PACIENTE (N€ total)" coexisten con las
 * "Renovación PayPal · cuota 1/N (N/M€)" y ambas son duplicados de origen
 * distinto.
 *
 * El CEO decide cuál borrar en /fisio/finanzas.
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getActiveProfessional } from "@/lib/session";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type TxLite = { id: string; type: string; amount: number; description: string; occurredAt: string };
type Group = {
  patientId: string;
  patientName: string;
  totalAmount: number; // suma de los importes del grupo
  txs: TxLite[];       // 2 o más transacciones del mismo paciente en <5 min
};

const GAP_MS = 5 * 60 * 1000; // 5 minutos

export async function GET() {
  const user = await getActiveProfessional();
  if (!user || user.role !== "ceo") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const txs = await prisma.transaction.findMany({
    where: { type: { in: ["income_new", "income_renewal"] } },
    orderBy: { occurredAt: "asc" },
    include: { patient: { select: { id: true, fullName: true } } },
  });

  // Agrupar por patient
  const byPatient = new Map<string, typeof txs>();
  for (const t of txs) {
    if (!t.patientId) continue;
    if (!byPatient.has(t.patientId)) byPatient.set(t.patientId, []);
    byPatient.get(t.patientId)!.push(t);
  }

  // Clusters temporales por paciente: transacciones consecutivas separadas
  // por < GAP_MS. Si un cluster tiene ≥2 transacciones, es sospechoso.
  const groups: Group[] = [];
  for (const [patientId, list] of byPatient) {
    list.sort((a, b) => a.occurredAt.getTime() - b.occurredAt.getTime());
    let cluster: typeof list = [];
    const flush = () => {
      if (cluster.length >= 2) {
        groups.push({
          patientId,
          patientName: cluster[0].patient?.fullName ?? "?",
          totalAmount: Number(cluster.reduce((s, x) => s + x.amount, 0).toFixed(2)),
          txs: cluster.map((x) => ({
            id: x.id,
            type: x.type,
            amount: x.amount,
            description: x.description ?? "",
            occurredAt: x.occurredAt.toISOString(),
          })),
        });
      }
      cluster = [];
    };
    for (const t of list) {
      if (
        cluster.length === 0 ||
        t.occurredAt.getTime() - cluster[cluster.length - 1].occurredAt.getTime() < GAP_MS
      ) {
        cluster.push(t);
      } else {
        flush();
        cluster = [t];
      }
    }
    flush();
  }

  return NextResponse.json({ count: groups.length, groups });
}
