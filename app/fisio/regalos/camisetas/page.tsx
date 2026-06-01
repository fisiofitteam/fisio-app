import { prisma } from "@/lib/prisma";
import { getActiveProfessional } from "@/lib/session";
import { ShirtsView } from "@/components/ShirtsView";

// /fisio/regalos/camisetas — atletas ADVANCE con su talla + dirección.
// Gate de rol ya aplicado por app/fisio/regalos/layout.tsx.
export default async function RegalosCamisetasPage({
  searchParams,
}: {
  searchParams: { view?: string };
}) {
  const user = (await getActiveProfessional())!;
  const view = searchParams.view === "sent" ? "sent" : "pending";

  // Solo pacientes en ADVANCE (es a quienes va la camiseta)
  const baseWhere = { programType: "ADVANCE", shirtSent: view === "sent" } as const;

  const patients = await prisma.patient.findMany({
    where: baseWhere,
    orderBy: view === "sent" ? { shirtSentAt: "desc" } : { startedAt: "desc" },
    select: {
      id: true,
      fullName: true,
      programType: true,
      startedAt: true,
      shirtSize: true,
      shirtSent: true,
      shirtSentAt: true,
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
    prisma.patient.count({ where: { programType: "ADVANCE", shirtSent: false } }),
    prisma.patient.count({ where: { programType: "ADVANCE", shirtSent: true } }),
  ]);

  return (
    <ShirtsView
      view={view}
      isManager={user.isManager}
      patients={patients.map((p) => ({
        id: p.id,
        fullName: p.fullName,
        programType: p.programType,
        programStartedAt: p.startedAt?.toISOString() ?? null,
        shirtSize: p.shirtSize,
        shirtSent: p.shirtSent,
        shirtSentAt: p.shirtSentAt?.toISOString() ?? null,
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
