import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// GET /api/renewal/[token] — datos de la landing de renovación (público).
export async function GET(_req: Request, { params }: { params: { token: string } }) {
  const checkout = await prisma.renewalCheckout.findUnique({
    where: { paymentToken: params.token },
    include: { patient: { select: { fullName: true } } },
  });

  if (!checkout) {
    return NextResponse.json({ error: "Link no válido" }, { status: 404 });
  }

  return NextResponse.json({
    status: checkout.status,
    expired: checkout.tokenExpiresAt < new Date(),
    patientName: checkout.patient.fullName,
    programType: checkout.programType,
    durationMonths: checkout.durationMonths,
    amountCents: checkout.amountCents,
    currency: checkout.currency,
    installmentCount: checkout.installmentCount ?? null,
  });
}
