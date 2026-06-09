/**
 * Helpers para emitir y consultar PatientInvoice. Solo servidor.
 *
 * Reglas clave:
 *  - Numeración correlativa por año, sin huecos: "FF-2026-0001".
 *  - Cliente y emisor se guardan en SNAPSHOT (no FK) → la factura es
 *    inmutable jurídicamente. Si editas el perfil del paciente o el tuyo
 *    después, las facturas antiguas siguen mostrando los datos de cuando
 *    se emitieron.
 *  - Por defecto los servicios de fisioterapia están EXENTOS de IVA
 *    (Art. 20 Ley 37/1992 — igual que en tu factura del Professional).
 *  - Sin retención IRPF en facturas a particulares (default 0).
 */
import { prisma } from "@/lib/prisma";

export type IssueInvoiceInput = {
  patientId: string;
  issuerProfessionalId: string;
  concept: string;
  baseAmount: number;
  vatExempt?: boolean;
  vatRate?: number;     // % (0 si exento)
  irpfRate?: number;    // % (0 normalmente)
  issueDate?: Date;     // por defecto hoy
  saleId?: string | null;
  subscriptionRenewalId?: string | null;
  transactionId?: string | null;
};

/**
 * Crea una factura nueva con numeración correlativa segura. Reintenta hasta
 * 5 veces en caso de colisión por concurrencia (dos CEO emitiendo a la vez,
 * cosa improbable pero contemplada por el @@unique(year, sequence)).
 */
export async function issuePatientInvoice(input: IssueInvoiceInput) {
  const issueDate = input.issueDate ?? new Date();
  const year = issueDate.getUTCFullYear();

  // Cargar cliente (snapshot)
  const patient = await prisma.patient.findUnique({
    where: { id: input.patientId },
    select: {
      id: true,
      fullName: true,
      email: true,
      contractDNI: true,
      shippingStreet: true,
      shippingNumber: true,
      shippingFloor: true,
      shippingStaircase: true,
      shippingDoor: true,
      shippingCity: true,
      shippingProvince: true,
      shippingPostalCode: true,
    },
  });
  if (!patient) throw new Error("Paciente no encontrado");

  // Cargar emisor (CEO, snapshot)
  const issuer = await prisma.professional.findUnique({
    where: { id: input.issuerProfessionalId },
    select: { fullName: true, fiscalName: true, taxId: true, fiscalAddress: true, iban: true },
  });
  if (!issuer) throw new Error("Profesional emisor no encontrado");

  // Datos calculados
  const vatExempt = input.vatExempt ?? true;
  const vatRate = vatExempt ? 0 : input.vatRate ?? 0;
  const irpfRate = input.irpfRate ?? 0;
  const baseAmount = Number(input.baseAmount.toFixed(2));
  const vatAmount = Number((baseAmount * (vatRate / 100)).toFixed(2));
  const irpfAmount = Number((baseAmount * (irpfRate / 100)).toFixed(2));
  const totalAmount = Number((baseAmount + vatAmount - irpfAmount).toFixed(2));

  const clientAddress = formatAddress(patient);

  // Bucle de reintento para asignar sequence sin huecos ni colisiones.
  // Pedir el max actual, sumar 1, intentar crear; si choca unique, reintentar.
  for (let attempt = 0; attempt < 5; attempt++) {
    const last = await prisma.patientInvoice.findFirst({
      where: { year },
      orderBy: { sequence: "desc" },
      select: { sequence: true },
    });
    const sequence = (last?.sequence ?? 0) + 1;
    const number = `FF-${year}-${String(sequence).padStart(4, "0")}`;

    try {
      return await prisma.patientInvoice.create({
        data: {
          series: "FF",
          year,
          sequence,
          number,
          issueDate,
          patientId: patient.id,
          clientName: patient.fullName,
          clientTaxId: patient.contractDNI ?? null,
          clientAddress: clientAddress || null,
          clientEmail: patient.email ?? null,
          issuerName: issuer.fiscalName || issuer.fullName,
          issuerTaxId: issuer.taxId ?? null,
          issuerAddress: issuer.fiscalAddress ?? null,
          issuerIban: issuer.iban ?? null,
          concept: input.concept,
          baseAmount,
          vatExempt,
          vatRate,
          vatAmount,
          irpfRate,
          irpfAmount,
          totalAmount,
          saleId: input.saleId ?? null,
          subscriptionRenewalId: input.subscriptionRenewalId ?? null,
          transactionId: input.transactionId ?? null,
          createdById: input.issuerProfessionalId,
        },
        include: { patient: true },
      });
    } catch (e: any) {
      // P2002 = unique constraint (year, sequence). Reintenta.
      if (e?.code !== "P2002") throw e;
    }
  }
  throw new Error("No se pudo asignar número de factura tras 5 intentos");
}

function formatAddress(p: {
  shippingStreet: string | null;
  shippingNumber: string | null;
  shippingFloor: string | null;
  shippingStaircase: string | null;
  shippingDoor: string | null;
  shippingCity: string | null;
  shippingProvince: string | null;
  shippingPostalCode: string | null;
}): string {
  // Línea 1: Calle Y nº, X piso esc puerta
  const line1Parts: string[] = [];
  if (p.shippingStreet) {
    line1Parts.push(p.shippingStreet + (p.shippingNumber ? ` ${p.shippingNumber}` : ""));
  }
  const extra: string[] = [];
  if (p.shippingFloor) extra.push(p.shippingFloor);
  if (p.shippingStaircase) extra.push(`Esc. ${p.shippingStaircase}`);
  if (p.shippingDoor) extra.push(`Pta. ${p.shippingDoor}`);
  if (extra.length > 0) line1Parts.push(extra.join(", "));
  const line1 = line1Parts.join(", ");

  // Línea 2: CP, Ciudad, Provincia
  const line2Parts: string[] = [];
  if (p.shippingPostalCode) line2Parts.push(p.shippingPostalCode);
  if (p.shippingCity) line2Parts.push(p.shippingCity);
  if (p.shippingProvince && p.shippingProvince !== p.shippingCity) {
    line2Parts.push(`(${p.shippingProvince})`);
  }
  const line2 = line2Parts.join(" ");

  return [line1, line2].filter(Boolean).join("\n");
}
