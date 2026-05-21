import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getActiveProfessional } from "@/lib/session";

export async function POST(req: NextRequest) {
  const user = await getActiveProfessional();
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const {
    leadId,
    assignedProfessionalId,
    amountPaid,
    subscriptionPeriodMonths,
    programType,
    email,
    phone,
  } = await req.json();

  const lead = await prisma.lead.findUnique({ where: { id: leadId } });
  if (!lead) return NextResponse.json({ error: "Lead not found" }, { status: 404 });

  // Closer solo puede convertir SUS leads
  if (user.role === "closer" && lead.closerId !== user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Email obligatorio para que el paciente pueda hacer login
  if (!email || !email.trim()) {
    return NextResponse.json(
      { error: "El email del paciente es obligatorio para que pueda acceder a la app" },
      { status: 400 }
    );
  }

  const normalizedEmail = email.trim().toLowerCase();

  // Validar email único (otro paciente no tiene ese email ya)
  const conflict = await prisma.patient.findUnique({ where: { email: normalizedEmail } });
  if (conflict) {
    return NextResponse.json(
      { error: `Ya existe otro paciente con ese email: ${conflict.fullName}` },
      { status: 409 }
    );
  }

  // 1) Crear paciente
  const patient = await prisma.patient.create({
    data: {
      fullName: lead.fullName,
      email: normalizedEmail,
      sport: "CrossFit",
      diagnosis: lead.aiSummary ?? null,
      shippingPhone: phone?.trim() || null,
      subscriptionStartDate: new Date(),
      subscriptionPeriodMonths: Number(subscriptionPeriodMonths) || 4,
      subscriptionTotalMonths: Number(subscriptionPeriodMonths) || 4,
      assignedProfessionalId: assignedProfessionalId || null,
      programType: programType || null,
    },
  });

  // 2) Marcar lead como won + linkear paciente
  await prisma.lead.update({
    where: { id: leadId },
    data: {
      status: "won",
      decidedAt: new Date(),
      convertedPatientId: patient.id,
      inFollowUp: false,
    },
  });

  // 3) Crear ingreso "Nueva alta" en Transaction
  if (amountPaid && Number(amountPaid) > 0) {
    await prisma.transaction.create({
      data: {
        type: "income_new",
        amount: Number(amountPaid),
        description: `Alta - ${lead.fullName}`,
        occurredAt: new Date(),
        patientId: patient.id,
        professionalId: lead.closerId,
      },
    });
  }

  return NextResponse.json({ ok: true, patientId: patient.id });
}
