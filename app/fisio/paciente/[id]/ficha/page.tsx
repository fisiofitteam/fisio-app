import { notFound } from "next/navigation";
import { headers } from "next/headers";
import { prisma } from "@/lib/prisma";
import { ClinicalFile } from "@/components/ClinicalFile";
import { PatientCallLinksCard } from "@/components/PatientCallLinksCard";
import { RefundSaleButton } from "@/components/RefundSaleButton";
import { getActiveProfessional } from "@/lib/session";
import { summarizeBodyZone } from "@/lib/onboarding-content";

export default async function PatientFichaTab({ params }: { params: { id: string } }) {
  const user = (await getActiveProfessional())!;
  const patient = await prisma.patient.findUnique({
    where: { id: params.id },
    include: { appliedLevel: { include: { profile: true } } },
  });
  if (!patient) notFound();

  // bodyZone (resumen de zona afectada) tiene 2 fuentes:
  //  - patient.bodyZone: cache denormalizado que escribe el endpoint de
  //    onboarding al guardar la anamnesis (POST /api/patient/onboarding).
  //  - patient.anamnesisData: el JSON crudo con bodyZones[]/bodySides[].
  // Históricamente había pacientes que rellenaban la anamnesis pero su
  // bodyZone quedaba vacío (el cache aún no existía cuando enviaron el form,
  // o un fisio editó la anamnesis a mano). Para que la ficha no mienta,
  // recalculamos al vuelo si tenemos los datos en anamnesisData.
  let resolvedBodyZone = patient.bodyZone ?? "";
  if (!resolvedBodyZone && patient.anamnesisData) {
    try {
      const parsed = JSON.parse(patient.anamnesisData);
      const fallback = summarizeBodyZone(parsed);
      if (fallback) resolvedBodyZone = fallback;
    } catch {
      // anamnesisData corrupto: lo ignoramos, mostramos vacío.
    }
  }

  const hasFiscalAddress = !!(
    patient.shippingStreet &&
    patient.shippingNumber &&
    patient.shippingCity &&
    patient.shippingPostalCode
  );

  // Última venta pagada del paciente (solo CEO): permite devolver el pago
  // con el botón de la zona admin. Si ya está refunded no mostramos botón.
  const isCeo = user.role === "ceo";
  const lastSale = isCeo
    ? await prisma.sale.findFirst({
        where: { patientId: params.id, status: "paid" },
        orderBy: { paidAt: "desc" },
        select: {
          id: true,
          amountCents: true,
          paidAt: true,
          paymentMethod: true,
          paypalCaptureId: true,
          paypalSubscriptionId: true,
        },
      })
    : null;

  // baseUrl para armar el link público que se copia/manda por WhatsApp.
  // Preferimos el host real que llegó en el request para que en previews de
  // Vercel salga el link del preview y no el de producción.
  const hdrs = headers();
  const host = hdrs.get("host") ?? "app.fisiofit.team";
  const proto = hdrs.get("x-forwarded-proto") ?? "https";
  const baseUrl = `${proto}://${host}`;

  const firstName = patient.fullName.split(" ")[0] ?? patient.fullName;

  return (
    <>
    <ClinicalFile
      isManager={user.isManager}
      isCeo={user.role === "ceo"}
      patient={{
        id: patient.id,
        fullName: patient.fullName,
        email: patient.email ?? null,
        phone: patient.phone ?? null,
        instagram: patient.instagram ?? null,
        diagnosis: patient.diagnosis ?? "",
        shippingStreet: patient.shippingStreet ?? null,
        shippingNumber: patient.shippingNumber ?? null,
        shippingFloor: patient.shippingFloor ?? null,
        shippingStaircase: patient.shippingStaircase ?? null,
        shippingDoor: patient.shippingDoor ?? null,
        shippingCity: patient.shippingCity ?? null,
        shippingProvince: patient.shippingProvince ?? null,
        shippingPostalCode: patient.shippingPostalCode ?? null,
        shippingPhone: patient.shippingPhone ?? null,
        bodyZone: resolvedBodyZone,
        appliedProfileName: patient.appliedLevel?.profile.name ?? "",
        appliedLevelName: patient.appliedLevel?.name ?? "",
        subscriptionStartDate: patient.subscriptionStartDate?.toISOString().split("T")[0] ?? "",
        subscriptionPeriodMonths: patient.subscriptionPeriodMonths,
        whatsappGroupUrl: patient.whatsappGroupUrl ?? "",
        programType: patient.programType ?? "",
        difficulty: patient.difficulty ?? "",
        programMode: patient.programMode ?? "fixed",
        rollingProgramId: patient.rollingProgramId ?? null,
        rollingAccessoriesId: patient.rollingAccessoriesId ?? null,
        rollingTrainingId: patient.rollingTrainingId ?? null,
        hasTaxId: !!patient.contractDNI,
        hasFiscalAddress,
      }}
    />
    <PatientCallLinksCard
      patientId={patient.id}
      patientPhone={patient.phone ?? null}
      patientFirstName={firstName}
      baseUrl={baseUrl}
    />
    {isCeo && lastSale && (
      <div className="mt-4 max-w-3xl mx-auto px-4">
        <div className="rounded-xl p-3 flex items-center justify-between gap-3" style={{ background: "#FAFAFA", border: "1px dashed #D4D4D4" }}>
          <div className="text-xs text-neutral-600">
            <div className="font-semibold text-neutral-900 mb-0.5">Zona CEO · Gestión de pago</div>
            Última venta pagada: {(lastSale.amountCents / 100).toFixed(2)} €
            {lastSale.paidAt && <> · {new Date(lastSale.paidAt).toLocaleDateString("es-ES", { day: "numeric", month: "short", year: "numeric" })}</>}
          </div>
          <RefundSaleButton
            saleId={lastSale.id}
            amount={lastSale.amountCents / 100}
            paidAt={lastSale.paidAt ? lastSale.paidAt.toISOString() : null}
            paymentMethod={lastSale.paymentMethod ?? null}
            hasPayPalCapture={!!lastSale.paypalCaptureId}
            hasPayPalSubscription={!!lastSale.paypalSubscriptionId}
          />
        </div>
      </div>
    )}
    </>
  );
}
