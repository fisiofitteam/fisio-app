/**
 * POST /api/sale/[token]/create-account
 *
 * Crea la cuenta del paciente tras un pago exitoso, deja sesión activa.
 *
 * Body: { password?: string }  (opcional - si llega, se guarda hash; si no, paciente
 *        usará login por código email en futuros accesos)
 *
 * Pre-condiciones:
 *   - Sale debe existir y estar en estado "paid"
 *   - Crea Patient si no existe (fallback antes de v57.3)
 *
 * Tras crear la cuenta, deja sesión activa usando el sistema oficial (cookie
 * "fisio_session" + tabla Session). Duración 90 días, refresh automático.
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";
import { createSessionForPatient, setSessionCookie } from "@/lib/auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: NextRequest, { params }: { params: { token: string } }) {
  const body = await req.json().catch(() => ({}));
  const password: string | null = body.password;

  // Si llega contraseña, validar
  if (password) {
    if (typeof password !== "string" || password.length < 8) {
      return NextResponse.json(
        { error: "La contraseña debe tener al menos 8 caracteres" },
        { status: 400 }
      );
    }
  }

  const sale = await prisma.sale.findUnique({
    where: { paymentToken: params.token },
    include: { lead: true, patient: true },
  });

  if (!sale) {
    return NextResponse.json({ error: "Link no válido" }, { status: 404 });
  }
  if (sale.status !== "paid") {
    return NextResponse.json(
      { error: "El pago todavía no se ha confirmado. Espera unos segundos." },
      { status: 409 }
    );
  }

  const passwordHash = password ? await bcrypt.hash(password, 10) : null;

  // Crear o vincular Patient
  let patient = sale.patient;
  if (!patient) {
    if (!sale.lead.email) {
      return NextResponse.json(
        { error: "El lead no tiene email. Contacta con el equipo." },
        { status: 400 }
      );
    }

    // Normalizamos: lead.email puede venir con mayúsculas/espacios y eso
    // rompe la búsqueda posterior por findUnique (Postgres es case-sensitive).
    const normalizedEmail = sale.lead.email.trim().toLowerCase();
    const existing = await prisma.patient.findFirst({
      where: { email: { equals: normalizedEmail, mode: "insensitive" } },
    });
    if (existing) {
      // Ya existe → actualizar y vincular
      patient = await prisma.patient.update({
        where: { id: existing.id },
        data: {
          ...(passwordHash ? { passwordHash } : {}),
          programType: sale.programType,
          programDurationMonths: sale.durationMonths,
          programStartDate: existing.programStartDate || new Date(),
          programEndDate:
            existing.programEndDate ||
            new Date(Date.now() + sale.durationMonths * 30 * 86400 * 1000),
          onboardingStatus: existing.onboardingStatus || "pending_assignment",
          onboardingTasks: existing.onboardingTasks || {
            anamnesis: false,
            contract: false,
            firstSession: false,
          },
        },
      });
    } else {
      const now = new Date();
      const endDate = new Date(now.getTime() + sale.durationMonths * 30 * 86400 * 1000);
      const leadPhoneRaw = sale.lead.contactType === "phone"
        ? sale.lead.contactValue
        : sale.lead.phone;
      patient = await prisma.patient.create({
        data: {
          fullName: sale.lead.fullName,
          email: normalizedEmail,
          phone: leadPhoneRaw?.trim() || null,
          instagram: sale.lead.instagram?.trim().replace(/^@+/, "") || null,
          ...(passwordHash ? { passwordHash } : {}),
          programType: sale.programType,
          programDurationMonths: sale.durationMonths,
          programStartDate: now,
          programEndDate: endDate,
          subscriptionStartDate: now,
          subscriptionPeriodMonths: sale.durationMonths,
          subscriptionTotalMonths: sale.durationMonths,
          onboardingStatus: "pending_assignment",
          onboardingTasks: { anamnesis: false, contract: false, firstSession: false },
        },
      });
      await prisma.sale.update({
        where: { id: sale.id },
        data: { patientId: patient.id },
      });
      await prisma.lead.update({
        where: { id: sale.leadId },
        data: { convertedPatientId: patient.id, status: "won", decidedAt: now },
      });
    }
  } else if (passwordHash) {
    // Patient ya existe (creado por webhook) → solo actualizar contraseña
    patient = await prisma.patient.update({
      where: { id: patient.id },
      data: { passwordHash },
    });
  }

  // Crear sesión oficial (cookie + tabla Session)
  const ua = req.headers.get("user-agent") || undefined;
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || undefined;
  const token = await createSessionForPatient(patient.id, { userAgent: ua, ipAddress: ip });
  setSessionCookie(token);

  return NextResponse.json({ ok: true, patientId: patient.id });
}
