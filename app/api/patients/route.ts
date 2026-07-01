import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getActiveProfessional } from "@/lib/session";
import { notifyHeadSuccess } from "@/lib/notifications";

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
    phone,
    instagram,
    shippingPhone,
    diagnosis,
    assignedProfessionalId,
    programType,
    subscriptionPeriodMonths,
    amountPaid,
    programMode,        // "fixed" | "rolling"
    rollingProgramId,   // requerido si programMode = "rolling"
    // Flujo "paciente existente" (migración): si legacy=true, NO se genera la
    // Transaction de ingreso, se ignora amountPaid y se respeta la
    // subscriptionStartDate enviada (puede ser pasada). Hace que el alta no
    // contamine las métricas de "ingresos por altas".
    legacy,
    subscriptionStartDate: customStartDateIso,
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

  const isLegacy = legacy === true;
  // Fecha de inicio del periodo actual. Legacy puede pasar una fecha pasada.
  // Si no se pasa nada, hoy.
  let startDate = new Date();
  if (customStartDateIso && typeof customStartDateIso === "string") {
    const parsed = new Date(customStartDateIso);
    if (!isNaN(parsed.getTime())) {
      parsed.setHours(0, 0, 0, 0);
      startDate = parsed;
    }
  }

  // 1) Crear paciente. Los pacientes migrados (legacy=true) ya recibieron
  // sus regalos fuera de la plataforma → giftsAlreadySent oculta el selector
  // de talla y los excluye de "Camisetas/Parches pendientes".
  //
  // Onboarding (anamnesis + contrato): los pacientes NO legacy creados
  // manualmente deben pasar por el gate igual que los que llegan desde Stripe.
  // Si dejamos onboardingTasks = null el gate los considera legacy y NO les
  // exige nada — eso era el bug.
  // programStart/EndDate son la fuente que usa SubscriptionView para
  // "Fin previsto". Antes se dejaban null en el alta manual → los legacies
  // veían "—" y no reflejaban las extensiones por pausas. Los rellenamos
  // consistentes con el flujo Stripe.
  const months = Number(subscriptionPeriodMonths) || 4;
  const programEndDate = new Date(startDate);
  programEndDate.setMonth(programEndDate.getMonth() + months);

  const patient = await prisma.patient.create({
    data: {
      fullName: fullName.trim(),
      email: normalizedEmail,
      phone: phone?.trim() || null,
      instagram: instagram?.trim().replace(/^@+/, "") || null,
      sport: "CrossFit",
      diagnosis: diagnosis?.trim() || null,
      shippingPhone: shippingPhone?.trim() || null,
      subscriptionStartDate: startDate,
      subscriptionPeriodMonths: months,
      subscriptionTotalMonths: months,
      programStartDate: startDate,
      programEndDate: programEndDate,
      programDurationMonths: months,
      assignedProfessionalId: finalAssigneeId,
      programType: programType || null,
      programMode: mode,
      rollingProgramId: mode === "rolling" ? rollingProgramId : null,
      giftsAlreadySent: isLegacy,
      onboardingTasks: isLegacy
        ? undefined // se queda en null → el gate lo trata como legacy y no se lo pide
        : { anamnesis: false, contract: false, firstSession: false },
    },
  });

  // 1b) Crear automáticamente Periodo 1 en SubscriptionRenewal con la fecha
  // de inicio real (puede ser pasada para legacy). Esto es lo que alimenta
  // la lógica de "renueva en X días" y el flujo de RenewalCheckout.
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
      amountPaid: !isLegacy && amountPaid && Number(amountPaid) > 0 ? Number(amountPaid) : null,
      notes: isLegacy ? "Migración (paciente existente)" : "Alta inicial",
    },
  });

  // 2) Si NO es legacy y se indicó importe, generar transacción de ingreso.
  // En el flujo legacy nunca generamos Transaction para no contaminar métricas.
  if (!isLegacy && amountPaid && Number(amountPaid) > 0) {
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

  // 3) Notificar al head_success de que entra paciente nuevo. Aplicamos el
  // mismo tipo que en el webhook Stripe (patient_new_unassigned) para que
  // los head_success no tengan que configurar dos toggles. El body deja
  // claro si trae ya fisio asignado o no, para que sepan si tienen tarea.
  // Los pacientes legacy (migración) no notifican: se está vaciando el
  // histórico, no son altas reales.
  if (!isLegacy) {
    try {
      let fisioLabel = "Sin fisio asignado · falta asignarle uno";
      if (finalAssigneeId) {
        const fisio = await prisma.professional.findUnique({
          where: { id: finalAssigneeId },
          select: { fullName: true },
        });
        if (fisio) fisioLabel = `Fisio asignado: ${fisio.fullName}`;
      }
      await notifyHeadSuccess({
        type: "patient_new_unassigned",
        title: "Nuevo paciente (alta manual)",
        body: `${user.fullName} ha añadido a ${patient.fullName}. ${fisioLabel}.`,
        actionUrl: `/fisio/paciente/${patient.id}/ficha`,
      });
    } catch (err) {
      console.error("[patients] Error notificando a head_success:", err);
    }
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
    phone,
    instagram,
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
    anamnesisCallNotes,
    programMode,
    rollingProgramId,
    rollingAccessoriesId,
    rollingTrainingId,
    week0Completed,
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
      ...(phone !== undefined && { phone: phone?.trim() || null }),
      ...(instagram !== undefined && {
        instagram: instagram?.trim().replace(/^@+/, "") || null,
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
      ...(anamnesisCallNotes !== undefined && {
        anamnesisCallNotes: typeof anamnesisCallNotes === "string" && anamnesisCallNotes.trim() ? anamnesisCallNotes : null,
      }),
      ...(programMode !== undefined && { programMode: programMode === "rolling" ? "rolling" : "fixed" }),
      ...(rollingProgramId !== undefined && { rollingProgramId: rollingProgramId || null }),
      ...(rollingAccessoriesId !== undefined && { rollingAccessoriesId: rollingAccessoriesId || null }),
      ...(rollingTrainingId !== undefined && { rollingTrainingId: rollingTrainingId || null }),
      // Toggle "Semana 0 completada" desde la lista de pacientes. true →
      // fecha actual, false → null (por si el fisio quiere revertir).
      ...(week0Completed !== undefined && {
        week0CompletedAt: week0Completed ? new Date() : null,
      }),
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
