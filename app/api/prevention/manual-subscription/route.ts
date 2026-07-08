/**
 * POST /api/prevention/manual-subscription
 *
 * Alta manual de suscriptor Prevention sin pasar por Stripe. Casos de uso:
 *   - Regalo de acceso a un paciente RECUPERA/CONSOLIDA que termina.
 *   - Beta testers, familia, embajadores.
 *   - Migración manual de un cliente pre-existente.
 *
 * Dos modos:
 *   A) Paciente existente → { patientId, plan, startDate?, originSource? }
 *   B) Paciente nuevo    → { fullName, email?, phone?, plan, startDate?, originSource? }
 *
 * Plan puede ser "quarterly" | "semiannual" | "annual" (para calcular la
 * fecha de fin) o "indefinite" (currentPeriodEnd=null, no expira).
 *
 * No cobra nada — amountCents=0, stripeSubscriptionId=null, originSource
 * por defecto "manual". Estado inicial "active" (sin trial).
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getActiveProfessional } from "@/lib/session";
import { PREVENTION_PLAN_CONFIG, type PreventionPlan } from "@/lib/stripe";
import { getOrCreatePatientAccessPath } from "@/lib/auth";
import { sendEmail } from "@/lib/email";
import { welcomeEmail } from "@/lib/emails/prevention";

export const runtime = "nodejs";

type Plan = PreventionPlan | "indefinite";

function isPlan(v: unknown): v is Plan {
  return v === "quarterly" || v === "semiannual" || v === "annual" || v === "indefinite";
}

export async function POST(req: Request) {
  const user = await getActiveProfessional();
  if (!user || !user.isManager) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Body inválido" }, { status: 400 });
  }

  const plan = body?.plan;
  if (!isPlan(plan)) {
    return NextResponse.json({ error: "Plan inválido" }, { status: 400 });
  }

  const startDate = body?.startDate ? new Date(body.startDate) : new Date();
  if (isNaN(startDate.getTime())) {
    return NextResponse.json({ error: "startDate inválida" }, { status: 400 });
  }

  const originSource = typeof body?.originSource === "string" && body.originSource.trim()
    ? body.originSource.trim().slice(0, 60)
    : "manual";

  // ─── 1. Localizar o crear paciente ────────────────────────────────────
  const patientId = typeof body?.patientId === "string" ? body.patientId.trim() : "";
  let patient;
  if (patientId) {
    patient = await prisma.patient.findUnique({ where: { id: patientId } });
    if (!patient) {
      return NextResponse.json({ error: "Paciente no encontrado" }, { status: 404 });
    }
    // Nos aseguramos de que quede en modo Prevention. Si ya lo era, no-op.
    if (patient.programType !== "PREVENTION" || patient.programMode !== "rolling") {
      patient = await prisma.patient.update({
        where: { id: patient.id },
        data: {
          programType: "PREVENTION",
          programMode: "rolling",
          subscriptionPeriodMonths: 0,
          subscriptionTotalMonths: 0,
        },
      });
    }
  } else {
    const fullName = typeof body?.fullName === "string" ? body.fullName.trim() : "";
    if (!fullName) {
      return NextResponse.json({ error: "fullName obligatorio para paciente nuevo" }, { status: 400 });
    }
    const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
    const phone = typeof body?.phone === "string" ? body.phone.trim() : "";

    // Si aportan email, evitar duplicados.
    if (email) {
      const existing = await prisma.patient.findFirst({
        where: { email: { equals: email, mode: "insensitive" } },
      });
      if (existing) {
        return NextResponse.json(
          {
            error: `Ya existe un paciente con ese email (${existing.fullName}). Cámbialo a "paciente existente" y selecciónalo.`,
            existingPatientId: existing.id,
          },
          { status: 409 },
        );
      }
    }

    patient = await prisma.patient.create({
      data: {
        fullName,
        email: email || null,
        phone: phone || null,
        programType: "PREVENTION",
        programMode: "rolling",
        subscriptionPeriodMonths: 0,
        subscriptionTotalMonths: 0,
        // Prevention no pasa por onboarding: sin anamnesis ni contrato.
        onboardingTasks: undefined,
      },
    });
  }

  // ─── 2. Asignar programa Prevention si no lo tiene ────────────────────
  // Para que vea contenido semanal desde el minuto uno. Toma el primer
  // rolling con role="prevention" isActive=true.
  if (!patient.rollingProgramId) {
    const rp = await prisma.rollingProgram.findFirst({
      where: { role: "prevention", isActive: true },
      orderBy: { createdAt: "asc" },
      select: { id: true },
    });
    if (rp) {
      patient = await prisma.patient.update({
        where: { id: patient.id },
        data: { rollingProgramId: rp.id },
      });
    }
  }

  // ─── 3. Crear PatientSubscription ─────────────────────────────────────
  let currentPeriodEnd: Date | null = null;
  let amountCents = 0;
  let planKey = plan;
  if (plan !== "indefinite") {
    const cfg = PREVENTION_PLAN_CONFIG[plan];
    const end = new Date(startDate);
    end.setMonth(end.getMonth() + cfg.intervalMonths);
    currentPeriodEnd = end;
    amountCents = 0; // manual = cortesía, marcamos 0 para no ensuciar MRR
  } else {
    planKey = "indefinite" as PreventionPlan; // etiqueta interna
  }

  const subscription = await prisma.patientSubscription.create({
    data: {
      patientId: patient.id,
      productType: "prevention",
      plan: planKey,
      amountCents,
      currency: "eur",
      status: "active",
      currentPeriodStart: startDate,
      currentPeriodEnd,
      originSource,
    },
  });

  // Email de bienvenida con magic link 1-clic si el paciente tiene email
  // y no lo hemos deshabilitado explícitamente desde el modal.
  const sendWelcome = body?.sendWelcome !== false;
  let welcomeEmailSent = false;
  let welcomeEmailError: string | null = null;
  if (sendWelcome && patient.email) {
    try {
      const { path: accessPath } = await getOrCreatePatientAccessPath(patient.id);
      const first = patient.fullName.split(" ")[0];
      const mail = welcomeEmail({
        firstName: first,
        plan: planKey,
        patientId: patient.id,
        accessPath,
      });
      const res: any = await sendEmail({ to: patient.email, subject: mail.subject, html: mail.html, text: mail.text });
      welcomeEmailSent = !!res?.ok;
      welcomeEmailError = res?.error ?? null;
    } catch (err: any) {
      console.error("[manual-subscription] welcome email failed:", err);
      welcomeEmailError = err?.message ?? String(err);
    }
  }

  return NextResponse.json({
    ok: true,
    patientId: patient.id,
    subscriptionId: subscription.id,
    welcomeEmailSent,
    welcomeEmailError,
  });
}
