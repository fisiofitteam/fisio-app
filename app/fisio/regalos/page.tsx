import { prisma } from "@/lib/prisma";
import { PatchesView } from "@/components/PatchesView";

// /fisio/regalos — pestaña Parches. El gate de rol ya lo hace el layout.
export default async function RegalosParchesPage({
  searchParams,
}: {
  searchParams: { view?: string };
}) {
  const view = searchParams.view === "sent" ? "sent" : "pending";

  // Solo enviamos a España (logística). Legacy (country=null) se asume España.
  const countryFilter = { OR: [{ country: "España" }, { country: null }] } as const;

  const patients = await prisma.patient.findMany({
    where: { ...countryFilter, patchSent: view === "sent" },
    orderBy: view === "sent" ? { patchSentAt: "desc" } : { startedAt: "desc" },
    select: {
      id: true,
      fullName: true,
      startedAt: true,
      programType: true,
      patchSent: true,
      patchSentAt: true,
      shippingAddress: true,
      shippingStreet: true,
      shippingNumber: true,
      shippingFloor: true,
      shippingStaircase: true,
      shippingDoor: true,
      shippingCity: true,
      shippingProvince: true,
      shippingPostalCode: true,
      shippingPhone: true,
    },
  });

  const counts = await Promise.all([
    prisma.patient.count({ where: { ...countryFilter, patchSent: false } }),
    prisma.patient.count({ where: { ...countryFilter, patchSent: true } }),
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
        shippingStreet: p.shippingStreet,
        shippingNumber: p.shippingNumber,
        shippingFloor: p.shippingFloor,
        shippingStaircase: p.shippingStaircase,
        shippingDoor: p.shippingDoor,
        shippingCity: p.shippingCity,
        shippingProvince: p.shippingProvince,
        shippingPostalCode: p.shippingPostalCode,
        shippingPhone: p.shippingPhone,
      }))}
      counts={{ pending: counts[0], sent: counts[1] }}
    />
  );
}
