import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getActiveProfessional } from "@/lib/session";

/**
 * POST /api/patients
 * Crea un paciente desde cero (fuera del flow CRM).
 * Solo CEO y Head of Success pueden usarlo.
 */
export async function POST(req: NextRequest) {
  const user = await getActiveProfessional();
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (!(user.role === "ceo" || user.role === "head_success")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json();
  const {
    fullName,
    email,
    shippingPhone,
    diagnosis,
    assignedProfessionalId,
    programType,
    subscriptionPeriodMonths,
    amountPaid,
  } = body;

  // Validaciones mínimas
  if (!fullName || !fullName.trim()) {
    return NextResponse.json({ error: "El nombre es obligatorio" }, { status: 400 });
  }
  if (!email || !email.trim()) {
    return NextResponse.json({ error: "El email es obligatorio" }, { status: 400 });
  }

  const normalizedEmail = email.trim().toLowerCase();

  // Validar email único (no haya otro paciente con ese email)
  const existing = await prisma.patient.findUnique({ where: { email: normalizedEmail } });
  if (existing) {
    return NextResponse.json(
      { error: `Ya existe un paciente con ese email: ${existing.fullName}` },
      { status: 409 }
    );
  }

  // 1) Crear paciente
  const patient = await prisma.patient.create({
    data: {
      fullName: fullName.trim(),
      email: normalizedEmail,
      sport: "CrossFit",
      diagnosis: diagnosis?.trim() || null,
      shippingPhone: shippingPhone?.trim() || null,
      subscriptionStartDate: new Date(),
      subscriptionPeriodMonths: Number(subscriptionPeriodMonths) || 4,
      subscriptionTotalMonths: Number(subscriptionPeriodMonths) || 4,
      assignedProfessionalId: assignedProfessionalId || null,
      programType: programType || null,
    },
  });

  // 2) Si se indicó importe, generar transacción
  if (amountPaid && Number(amountPaid) > 0) {
    await prisma.transaction.create({
      data: {
        type: "income_new",
        amount: Number(amountPaid),
        description: `Alta - ${patient.fullName}`,
        occurredAt: new Date(),
        patientId: patient.id,
        professionalId: assignedProfessionalId || user.id,
      },
    });
  }

  return NextResponse.json({ ok: true, patientId: patient.id });
}

export async function PATCH(req: NextRequest) {
  const body = await req.json();
  const {
    id,
    fullName,
    email,
    sport,
    diagnosis,
    subscriptionStartDate,
    subscriptionPeriodMonths,
    whatsappGroupUrl,
    assignedProfessionalId,
    programType,
    difficulty,
    shippingAddress,
    shippingCity,
    shippingPostalCode,
    shippingPhone,
  } = body;

  // Si se intenta cambiar email, validar que no esté ocupado por otro paciente
  if (email !== undefined) {
    const normalized = email?.trim().toLowerCase() || null;
    if (normalized) {
      const conflict = await prisma.patient.findFirst({
        where: { email: normalized, NOT: { id } },
      });
      if (conflict) {
        return NextResponse.json(
          { error: `Ya existe otro paciente con ese email: ${conflict.fullName}` },
          { status: 409 }
        );
      }
    }
  }

  const updated = await prisma.patient.update({
    where: { id },
    data: {
      ...(fullName !== undefined && { fullName }),
      ...(email !== undefined && { email: email?.trim().toLowerCase() || null }),
      ...(sport !== undefined && { sport: sport || "CrossFit" }),
      ...(diagnosis !== undefined && { diagnosis: diagnosis || null }),
      ...(subscriptionStartDate !== undefined && {
        subscriptionStartDate: subscriptionStartDate ? new Date(subscriptionStartDate) : null,
      }),
      ...(subscriptionPeriodMonths !== undefined && {
        subscriptionPeriodMonths: Number(subscriptionPeriodMonths) || 4,
      }),
      ...(whatsappGroupUrl !== undefined && {
        whatsappGroupUrl: whatsappGroupUrl || null,
      }),
      ...(assignedProfessionalId !== undefined && {
        assignedProfessionalId: assignedProfessionalId || null,
      }),
      ...(programType !== undefined && {
        programType: programType || null,
      }),
      ...(difficulty !== undefined && {
        difficulty: difficulty || null,
      }),
      ...(shippingAddress !== undefined && { shippingAddress: shippingAddress || null }),
      ...(shippingCity !== undefined && { shippingCity: shippingCity || null }),
      ...(shippingPostalCode !== undefined && { shippingPostalCode: shippingPostalCode || null }),
      ...(shippingPhone !== undefined && { shippingPhone: shippingPhone || null }),
    },
  });
  return NextResponse.json(updated);
}
