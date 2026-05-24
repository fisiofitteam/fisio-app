import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getActiveProfessional } from "@/lib/session";
import { generatePaymentToken } from "@/lib/stripe";

const TOKEN_VALIDITY_DAYS = 7;
const PROGRAMS = ["RECUPERA", "CONSOLIDA", "ADVANCE"];

// POST /api/patients/[id]/renewal-link
// Crea un enlace de pago de renovación para el paciente. Solo CEO/head_success.
// body: { programType, durationMonths, amountEuros }
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getActiveProfessional();
  if (!user || !(user.role === "ceo" || user.role === "head_success")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const patient = await prisma.patient.findUnique({ where: { id: params.id }, select: { id: true } });
  if (!patient) return NextResponse.json({ error: "Paciente no encontrado" }, { status: 404 });

  const body = await req.json().catch(() => ({}));
  const programType = String(body?.programType || "");
  const durationMonths = Math.round(Number(body?.durationMonths));
  const amountEuros = Number(body?.amountEuros);

  if (!PROGRAMS.includes(programType)) {
    return NextResponse.json({ error: "Programa no válido" }, { status: 400 });
  }
  if (!Number.isFinite(durationMonths) || durationMonths < 1 || durationMonths > 24) {
    return NextResponse.json({ error: "Duración no válida (1-24 meses)" }, { status: 400 });
  }
  if (!Number.isFinite(amountEuros) || amountEuros <= 0) {
    return NextResponse.json({ error: "Importe no válido" }, { status: 400 });
  }

  const amountCents = Math.round(amountEuros * 100);
  const tokenExpiresAt = new Date();
  tokenExpiresAt.setDate(tokenExpiresAt.getDate() + TOKEN_VALIDITY_DAYS);

  const checkout = await prisma.renewalCheckout.create({
    data: {
      patientId: patient.id,
      createdById: user.id,
      programType,
      durationMonths,
      amountCents,
      paymentToken: generatePaymentToken(),
      tokenExpiresAt,
      status: "pending",
    },
    select: { paymentToken: true },
  });

  return NextResponse.json({
    token: checkout.paymentToken,
    url: `/renovar/${checkout.paymentToken}`,
    amountCents,
  });
}
