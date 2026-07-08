/**
 * GET /api/cron/prevention-daily
 *
 * Cron diario de FisioFit Prevention. Tres tareas independientes:
 *
 *   1. ACTIVAR scheduled → active
 *      Busca PatientSubscription con status="scheduled" y scheduledStartAt
 *      pasado o hoy. Activa (currentPeriodStart=now) y manda email de
 *      bienvenida "tu Prevention ha empezado".
 *
 *   2. RECORDATORIO fin de trial (24h antes)
 *      Busca las que están en "trialing" y trialEndsAt cae mañana (rango
 *      24-48h desde ahora). Manda email trialEndingSoon.
 *
 *   3. RECORDATORIO pre-renovación (7 días antes)
 *      Busca las "active" con currentPeriodEnd entre 6.5 y 7.5 días desde
 *      ahora, sin cancelAtPeriodEnd. Manda email renewalSoon.
 *
 * Protección: Vercel Cron envía Authorization: Bearer $CRON_SECRET.
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { activateScheduledSubscription } from "@/lib/prevention";
import { sendEmail } from "@/lib/email";
import {
  welcomeEmail,
  trialEndingSoonEmail,
  renewalSoonEmail,
} from "@/lib/emails/prevention";
import { isPreventionPlan } from "@/lib/stripe";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

async function handler(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization") ?? "";
  const isLocal = process.env.NODE_ENV !== "production";
  const isTest = req.nextUrl.searchParams.get("test") === "1";
  if (cronSecret && auth !== `Bearer ${cronSecret}` && !(isTest && isLocal)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const now = new Date();

  // ─── 1. Activar scheduled → active ────────────────────────────────────
  const toActivate = await prisma.patientSubscription.findMany({
    where: {
      productType: "prevention",
      status: "scheduled",
      scheduledStartAt: { lte: now },
    },
    include: { patient: true },
  });
  let activated = 0;
  for (const s of toActivate) {
    try {
      await activateScheduledSubscription(s.id);
      activated++;
      // Email "tu Prevention ha empezado" — reusamos welcome (mismo copy
      // funciona igual cuando arranca diferido).
      if (s.patient.email && isPreventionPlan(s.plan)) {
        const first = s.patient.fullName.split(" ")[0];
        const mail = welcomeEmail({
          firstName: first,
          plan: s.plan,
          patientId: s.patient.id,
          trialEndsAt: null,
          scheduledStartAt: null,
        });
        await sendEmail({ to: s.patient.email, subject: mail.subject, html: mail.html, text: mail.text });
      }
    } catch (e) {
      console.error("[prevention-daily] error activando", s.id, e);
    }
  }

  // ─── 2. Recordatorio fin de trial (mañana) ────────────────────────────
  const trialWindowStart = new Date(now.getTime() + 20 * 3600_000);
  const trialWindowEnd = new Date(now.getTime() + 48 * 3600_000);
  const endingTrials = await prisma.patientSubscription.findMany({
    where: {
      productType: "prevention",
      status: "trialing",
      trialEndsAt: { gte: trialWindowStart, lte: trialWindowEnd },
    },
    include: { patient: true },
  });
  let trialReminders = 0;
  for (const s of endingTrials) {
    try {
      if (!s.patient.email || !isPreventionPlan(s.plan) || !s.trialEndsAt) continue;
      const first = s.patient.fullName.split(" ")[0];
      const mail = trialEndingSoonEmail({
        firstName: first,
        plan: s.plan,
        trialEndsAt: s.trialEndsAt.toISOString(),
        patientId: s.patient.id,
      });
      await sendEmail({ to: s.patient.email, subject: mail.subject, html: mail.html, text: mail.text });
      trialReminders++;
    } catch (e) {
      console.error("[prevention-daily] error recordatorio trial", s.id, e);
    }
  }

  // ─── 3. Recordatorio pre-renovación (7 días) ─────────────────────────
  const renewalWindowStart = new Date(now.getTime() + 6.5 * 86400_000);
  const renewalWindowEnd = new Date(now.getTime() + 7.5 * 86400_000);
  const upcomingRenewals = await prisma.patientSubscription.findMany({
    where: {
      productType: "prevention",
      status: "active",
      cancelAtPeriodEnd: false,
      currentPeriodEnd: { gte: renewalWindowStart, lte: renewalWindowEnd },
    },
    include: { patient: true },
  });
  let renewalReminders = 0;
  for (const s of upcomingRenewals) {
    try {
      if (!s.patient.email || !isPreventionPlan(s.plan) || !s.currentPeriodEnd) continue;
      const first = s.patient.fullName.split(" ")[0];
      const mail = renewalSoonEmail({
        firstName: first,
        plan: s.plan,
        renewalDate: s.currentPeriodEnd.toISOString(),
        patientId: s.patient.id,
      });
      await sendEmail({ to: s.patient.email, subject: mail.subject, html: mail.html, text: mail.text });
      renewalReminders++;
    } catch (e) {
      console.error("[prevention-daily] error recordatorio renovación", s.id, e);
    }
  }

  return NextResponse.json({
    ok: true,
    activated,
    trialReminders,
    renewalReminders,
  });
}

export async function GET(req: NextRequest) { return handler(req); }
export async function POST(req: NextRequest) { return handler(req); }
