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
  // CEO, Head of Success y fisios pueden crear pacientes (de momento).
  if (!(user.role === "ceo" || user.role === "head_success" || user.role === "fisio")) {
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
    programMode,        // "fixed" | "rolling"
    rollingProgramId,   // requerido si programMode = "rolling"
  } = body;

  // Validaciones mínimas
  if (!fullName || !fullName.trim()) {
    return NextResponse.json({ error: "El nombre es obligatorio" }, { status: 400 });
  }
  if (!email || !email.trim()) {
    return NextResponse.json({ error: "El email es obligatorio" }, { status: 400 });
  }

  // Validar coherencia de programMode
  const mode = programMode === "rolling" ? "rolling" : "fixed";
  if (mode === "rolling") {
    if (programType !== "ADVANCE") {
      return NextResponse.json(
        { error: "Solo los programas ADVANCE pueden ser rolling" },
        { status: 400 }
      );
    }
    if (!rollingProgramId) {
      return NextResponse.json(
        { error: "Selecciona a qué programa rolling se enchufa el paciente" },
        { status: 400 }
      );
    }
    // Verificar que el programa rolling existe y está activo
    const rp = await prisma.rollingProgram.findUnique({ where: { id: rollingProgramId } });
    if (!rp || !rp.isActive) {
      return NextResponse.json(
        { error: "El programa rolling seleccionado no existe o está archivado" },
        { status: 400 }
      );
    }
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

  // Auto-asignación: durante el traspaso de pacientes a la plataforma, si quien
  // crea es un fisio normal (no manager), se le auto-asigna como fisio del
  // paciente, ignorando lo que venga en el body. Los managers (CEO /
  // head_success) sí pueden asignar a quien quieran (o dejar sin asignar).
  const finalAssigneeId = user.role === "fisio"
    ? user.id
    : (assignedProfessionalId || null);

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
      assignedProfessionalId: finalAssigneeId,
      programType: programType || null,
      programMode: mode,
      rollingProgramId: mode === "rolling" ? rollingProgramId : null,
    },
  });

  // 1b) Crear automáticamente Periodo 1 en SubscriptionRenewal
  const periodStart = patient.subscriptionStartDate ?? new Date();
  const periodEnd = new Date(periodStart);
  periodEnd.setMonth(periodEnd.getMonth() + patient.subscriptionPeriodMonths);
  await prisma.subscriptionRenewal.create({
    data: {
      patientId: patient.id,
      programType: programType || null,
      periodMonths: patient.subscriptionPeriodMonths,
      startDate: periodStart,
      endDate: periodEnd,
      status: "active",
      amountPaid: amountPaid && Number(amountPaid) > 0 ? Number(amountPaid) : null,
      notes: "Alta inicial",
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
    bodyZone,
    subscriptionStartDate,
    subscriptionPeriodMonths,
    whatsappGroupUrl,
    assignedProfessionalId,
    programType,
    difficulty,
    shippingAddress,
    shippingStreet,
    shippingNumber,
    shippingFloor,
    shippingStaircase,
    shippingDoor,
    shippingCity,
    shippingProvince,
    shippingPostalCode,
    shippingPhone,
    shirtSize,
    country,
    loadReviewIntervalWeeks,
    loadReviewLastAt,
    fisioNotes,
    programMode,
    rollingProgramId,
    rollingAccessoriesId,
    rollingTrainingId,
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

  // Si se está cambiando a rolling, validar
  if (programMode === "rolling") {
    const currentProgramType = programType !== undefined ? programType : (await prisma.patient.findUnique({ where: { id }, select: { programType: true } }))?.programType;
    if (currentProgramType !== "ADVANCE") {
      return NextResponse.json(
        { error: "Solo los programas ADVANCE pueden ser rolling. Cambia primero el tipo a ADVANCE." },
        { status: 400 }
      );
    }
    // En modo rolling, ADVANCE necesita al menos UNO de los dos slots asignado.
    // Aceptamos cualquier combinación: solo accesorios, solo entrenamiento, o ambos.
    const accId = rollingAccessoriesId !== undefined ? rollingAccessoriesId : null;
    const trnId = rollingTrainingId !== undefined ? rollingTrainingId : null;
    const legacyId = rollingProgramId !== undefined ? rollingProgramId : null;
    if (!accId && !trnId && !legacyId) {
      return NextResponse.json(
        { error: "Asigna al menos un programa rolling (Accesorios o Entrenamiento)" },
        { status: 400 }
      );
    }
    // Validar que los rollings seleccionados existen y están activos
    for (const rid of [accId, trnId, legacyId].filter(Boolean) as string[]) {
      const rp = await prisma.rollingProgram.findUnique({ where: { id: rid } });
      if (!rp || !rp.isActive) {
        return NextResponse.json(
          { error: "Uno de los programas rolling seleccionados no existe o está archivado" },
          { status: 400 }
        );
      }
    }
  }

  // Coherencia: si cambian programType a algo distinto a ADVANCE, forzar fixed y limpiar rollings.
  // Esto previene estados inconsistentes (ej. RECUPERA con programMode="rolling").
  let forceFixedCleanup = false;
  if (programType !== undefined && programType !== null && programType !== "ADVANCE") {
    forceFixedCleanup = true;
  }

  const updated = await prisma.patient.update({
    where: { id },
    data: {
      ...(fullName !== undefined && { fullName }),
      ...(email !== undefined && { email: email?.trim().toLowerCase() || null }),
      ...(sport !== undefined && { sport: sport || "CrossFit" }),
      ...(diagnosis !== undefined && { diagnosis: diagnosis || null }),
      ...(bodyZone !== undefined && { bodyZone: bodyZone || null }),
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
      ...(shippingStreet !== undefined && { shippingStreet: shippingStreet || null }),
      ...(shippingNumber !== undefined && { shippingNumber: shippingNumber || null }),
      ...(shippingFloor !== undefined && { shippingFloor: shippingFloor || null }),
      ...(shippingStaircase !== undefined && { shippingStaircase: shippingStaircase || null }),
      ...(shippingDoor !== undefined && { shippingDoor: shippingDoor || null }),
      ...(shippingCity !== undefined && { shippingCity: shippingCity || null }),
      ...(shippingProvince !== undefined && { shippingProvince: shippingProvince || null }),
      ...(shippingPostalCode !== undefined && { shippingPostalCode: shippingPostalCode || null }),
      ...(shippingPhone !== undefined && { shippingPhone: shippingPhone || null }),
      ...(shirtSize !== undefined && { shirtSize: shirtSize || null }),
      ...(country !== undefined && { country: country || null }),
      ...(loadReviewIntervalWeeks !== undefined && {
        loadReviewIntervalWeeks: Math.max(2, Math.min(5, Number(loadReviewIntervalWeeks) || 4)),
      }),
      ...(loadReviewLastAt !== undefined && {
        loadReviewLastAt: loadReviewLastAt ? new Date(loadReviewLastAt) : null,
      }),
      ...(fisioNotes !== undefined && {
        fisioNotes: typeof fisioNotes === "string" && fisioNotes.trim() ? fisioNotes : null,
      }),
      ...(programMode !== undefined && { programMode: programMode === "rolling" ? "rolling" : "fixed" }),
      ...(rollingProgramId !== undefined && { rollingProgramId: rollingProgramId || null }),
      ...(rollingAccessoriesId !== undefined && { rollingAccessoriesId: rollingAccessoriesId || null }),
      ...(rollingTrainingId !== undefined && { rollingTrainingId: rollingTrainingId || null }),
      // Si se cambia a fixed, limpiamos los tres rollings
      ...(programMode === "fixed" && {
        rollingProgramId: null,
        rollingAccessoriesId: null,
        rollingTrainingId: null,
      }),
      // Si se cambia programType a uno no-ADVANCE, forzar fixed y limpiar rollings
      // (gana sobre el bloque anterior si está activo)
      ...(forceFixedCleanup && {
        programMode: "fixed",
        rollingProgramId: null,
        rollingAccessoriesId: null,
        rollingTrainingId: null,
      }),
    },
  });
  return NextResponse.json(updated);
}
