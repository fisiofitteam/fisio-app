import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getActiveProfessional } from "@/lib/session";
import { PatchesView } from "@/components/PatchesView";

export default async function ParchesPage({
  searchParams,
}: {
  searchParams: { view?: string };
}) {
  const user = (await getActiveProfessional())!;
  if (user.role !== "setter" && !user.isManager) redirect("/fisio");

  const view = searchParams.view === "sent" ? "sent" : "pending";

  const patients = await prisma.patient.findMany({
    where: { patchSent: view === "sent" },
    orderBy: view === "sent" ? { patchSentAt: "desc" } : { startedAt: "desc" },
    select: {
      id: true,
      fullName: true,
      startedAt: true,
      programType: true,
      patchSent: true,
      patchSentAt: true,
      shippingAddress: true,
      shippingCity: true,
      shippingPostalCode: true,
      shippingPhone: true,
    },
  });

  const counts = await Promise.all([
    prisma.patient.count({ where: { patchSent: false } }),
    prisma.patient.count({ where: { patchSent: true } }),
  ]);

  return (
    <PatchesView
      view={view}
      patients={patients.map((p) => ({
        id: p.id,
        fullName: p.fullName,
        startedAt: p.startedAt.toISOString(),
        programType: p.programType,
        patchSent: p.patchSent,
        patchSentAt: p.patchSentAt?.toISOString() ?? null,
        shippingAddress: p.shippingAddress,
        shippingCity: p.shippingCity,
        shippingPostalCode: p.shippingPostalCode,
        shippingPhone: p.shippingPhone,
      }))}
      counts={{ pending: counts[0], sent: counts[1] }}
    />
  );
}
