/**
 * Programador automático de llamadas del fisio a sus pacientes.
 *
 * Se ejecuta desde el cron diario `/api/cron/patient-calls-scheduler`. Crea
 * dos tipos de ScheduledCall según reglas de negocio:
 *
 *   1. Optimización — RECUPERA / CONSOLIDA únicamente. Se dispara cuando
 *      el paciente entra en su semana 5 desde `subscriptionStartDate`
 *      (28-34 días). Idempotente: solo se crea si el paciente NUNCA ha
 *      tenido antes una call de este tipo (una en la vida por atleta).
 *
 *   2. Renovación — RECUPERA / CONSOLIDA / ADVANCE. Se dispara cuando
 *      faltan 13-14 días para la renovación calculada a partir de
 *      subscriptionStartDate + subscriptionPeriodMonths. Idempotente:
 *      no se crea otra si ya existe una en los últimos 60 días (evita
 *      duplicar aunque el cron se dispare varios días seguidos).
 *
 * PREVENTION queda fuera de ambas (se maneja por su flujo de suscripción
 * Stripe). Los pacientes con `onboardingStatus != "active"` también.
 *
 * La `scheduledAt` NO se rellena: el aviso es solo "toca hacer llamada".
 * El fisio decide y agenda la fecha/hora concreta desde /fisio/llamadas
 * cuando quede con el paciente. Hasta entonces se muestra como
 * "Pendiente de agendar".
 */
import { prisma } from "@/lib/prisma";
import { activePatientCondition } from "@/lib/patient-active";

const OPT_PROGRAM_TYPES = ["RECUPERA", "CONSOLIDA"];
const REN_PROGRAM_TYPES = ["RECUPERA", "CONSOLIDA", "ADVANCE"];

// Ventanas de detección: usamos rango de días para tolerar que el cron
// se salte un día (Vercel puede fallar puntualmente, y las semanas
// tienen 7 días de holgura para no perder al paciente).
//
// Optimización: la LLAMADA se realiza en la semana 5, pero avisamos al
// fisio en la semana 4 para que pueda agendarla con margen. Por eso la
// ventana de detección es 21-27 días desde el alta (día 21 = inicio
// semana 4, día 27 = fin semana 4). scheduledAt se pone en semana 5.
const OPT_MIN_DAYS = 21;
const OPT_MAX_DAYS = 27;
const REN_MIN_DAYS_LEFT = 13;
const REN_MAX_DAYS_LEFT = 14;

// Anti-duplicados para renovación: no crear otra si ya se creó una en
// los últimos N días. 60 días cubre todo el periodo típico.
const REN_DEDUPE_WINDOW_DAYS = 60;

export type SchedulerResult = {
  optimizationCreated: number;
  renewalCreated: number;
  scanned: number;
};

export async function schedulePatientCalls(now: Date = new Date()): Promise<SchedulerResult> {
  const patients = await prisma.patient.findMany({
    where: {
      onboardingStatus: "active",
      isTest: false, // pacientes fantasma quedan fuera del scheduler
      subscriptionStartDate: { not: null },
      programType: { in: [...new Set([...OPT_PROGRAM_TYPES, ...REN_PROGRAM_TYPES])] },
      // Solo pacientes con renovación vigente. Los ventana-cierre tipo
      // renovación filtran por días naturales y podrían pillar a un
      // atleta ya terminado si aún guardara subscriptionStartDate — el
      // filtro explícito lo previene.
      ...activePatientCondition(),
    },
    select: {
      id: true,
      programType: true,
      subscriptionStartDate: true,
      subscriptionPeriodMonths: true,
    },
  });

  let optCreated = 0;
  let renCreated = 0;

  const dedupeCutoff = new Date(now.getTime() - REN_DEDUPE_WINDOW_DAYS * 86400_000);

  for (const p of patients) {
    if (!p.subscriptionStartDate) continue;

    // ─── Optimización (avisar en semana 4, agendar en semana 5) ───
    // Solo aplica en el PRIMER periodo del paciente. Si ya tiene un
    // segundo SubscriptionRenewal, la llamada de optimización perdió su
    // sentido — a estos ya se les hace renovación.
    if (OPT_PROGRAM_TYPES.includes(p.programType ?? "")) {
      const daysSinceStart = daysBetweenUtc(p.subscriptionStartDate, now);
      if (daysSinceStart >= OPT_MIN_DAYS && daysSinceStart <= OPT_MAX_DAYS) {
        const [alreadyCall, periodsCount] = await Promise.all([
          prisma.scheduledCall.count({
            where: { patientId: p.id, type: "optimizacion" },
          }),
          prisma.subscriptionRenewal.count({
            where: { patientId: p.id },
          }),
        ]);
        // periodsCount === 1 significa "solo tiene el alta inicial",
        // no ha renovado nunca todavía. Coincide con "primer periodo".
        const isFirstPeriod = periodsCount <= 1;
        if (alreadyCall === 0 && isFirstPeriod) {
          await prisma.scheduledCall.create({
            data: {
              patientId: p.id,
              type: "optimizacion",
              notes: "Llamada de optimización (semana 5) · aviso automático en semana 4",
            },
          });
          optCreated++;
        }
      }
    }

    // ─── Renovación (14 días antes) ───
    if (REN_PROGRAM_TYPES.includes(p.programType ?? "")) {
      const daysLeft = daysUntilRenewal(p.subscriptionStartDate, p.subscriptionPeriodMonths, now);
      if (daysLeft !== null && daysLeft >= REN_MIN_DAYS_LEFT && daysLeft <= REN_MAX_DAYS_LEFT) {
        const recent = await prisma.scheduledCall.count({
          where: {
            patientId: p.id,
            type: "renovacion",
            createdAt: { gte: dedupeCutoff },
          },
        });
        if (recent === 0) {
          await prisma.scheduledCall.create({
            data: {
              patientId: p.id,
              type: "renovacion",
              notes: "2 semanas antes de renovar · llamada programada automáticamente",
            },
          });
          renCreated++;
        }
      }
    }
  }

  return { optimizationCreated: optCreated, renewalCreated: renCreated, scanned: patients.length };
}

// ────────────────────────── Utilidades ──────────────────────────

/** Días completos entre dos fechas (UTC), redondeando hacia abajo. */
function daysBetweenUtc(from: Date, to: Date): number {
  const a = Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate());
  const b = Date.UTC(to.getUTCFullYear(), to.getUTCMonth(), to.getUTCDate());
  return Math.floor((b - a) / 86400_000);
}

/** Días que faltan hasta la fecha de renovación (start + periodMonths). */
function daysUntilRenewal(start: Date | null, periodMonths: number, now: Date): number | null {
  if (!start) return null;
  const renewal = new Date(start);
  renewal.setMonth(renewal.getMonth() + (periodMonths || 4));
  return daysBetweenUtc(now, renewal);
}
