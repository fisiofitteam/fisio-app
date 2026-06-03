/**
 * scripts/reset-prelaunch.ts
 *
 * Vacía la BD para el lanzamiento real, manteniendo todo lo configurable:
 *   - Equipo (Professional + Compensation + plantillas de horario)
 *   - Biblioteca (programas, ejercicios, vídeos, mensajes, casos clínicos, hooks, leadmagnets, ...)
 *   - Pestaña de Contenido (ContentWeek, ContentPiece, ScriptTemplate, WeeklyTemplate, CommunityPost, CommunityIdea, ...)
 *   - Cursos y módulos de comunidad (CommunityModule / Section / Lesson)
 *   - Configs de landings, onboarding, mensaje bienvenida
 *   - Plantillas de tareas semanales y ad-hoc
 *   - Tags de campañas Meta
 *   - Conexión Google Calendar (OAuth)
 *   - Programas rolling y sus semanas/días/tareas
 *   - Plantillas de movimiento, métricas, formularios, vídeos
 *   - Plantillas de monthly challenge
 *   - Calendar events curados por el equipo, agenda blocks, week overrides
 *
 * Borra:
 *   - Pacientes y todo lo derivado (sesiones, métricas, WODs, PRs, daily logs,
 *     pausas, adaptaciones, notificaciones, login codes, sesiones auth)
 *   - Leads, ventas, renovaciones, transacciones, payroll
 *   - Datos comunitarios de pacientes (posts feed, comentarios, reacciones, progreso lecciones)
 *   - Resultados de monthly challenge
 *   - Histórico equipo: vacaciones, turnos de cierre, reuniones, completados de tareas
 *   - Notificaciones equipo + paciente
 *   - Inputs y objetivos del Cuadro de Mandos
 *
 * Uso:
 *   - Dry-run (no toca nada, solo enseña counts):
 *     DATABASE_URL=... npx tsx scripts/reset-prelaunch.ts
 *   - Aplicar de verdad:
 *     DATABASE_URL=... CONFIRM=YES_DELETE_ALL npx tsx scripts/reset-prelaunch.ts --apply
 *
 * IMPORTANTE: siempre dry-run primero. El --apply requiere ADEMÁS el env var
 * CONFIRM=YES_DELETE_ALL como segundo cinturón de seguridad.
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const APPLY = process.argv.includes("--apply");
const CONFIRMED = process.env.CONFIRM === "YES_DELETE_ALL";

// Lista ordenada de modelos a borrar. El orden importa por las FK:
// hijos antes que padres, junctions antes que tablas referenciadas.
// El nombre es exactamente el del modelo Prisma en camelCase del cliente.
const DELETE_PLAN: Array<{ model: string; reason: string }> = [
  // ─── Tablas de unión y completados (sin dependencias salientes) ───
  { model: "weeklyTeamTaskCompletion", reason: "completados de tareas semanales del equipo" },
  { model: "teamTaskAdHocCompletion", reason: "completados de tareas ad-hoc del equipo" },
  { model: "monthlyChallengeResult", reason: "resultados de challenge mensual de pacientes" },
  { model: "communityLessonProgress", reason: "progreso de lecciones de comunidad por paciente" },
  { model: "communityReaction", reason: "reacciones de pacientes en comunidad" },
  { model: "communityComment", reason: "comentarios de pacientes en comunidad" },
  { model: "communityFeedPost", reason: "posts del feed de comunidad (pacientes + equipo)" },

  // ─── Datos generados por paciente ───
  { model: "patientPR", reason: "PRs del paciente" }, // Prisma preserva las 2 mayúsculas finales
  { model: "patientDailyLog", reason: "daily logs del paciente" },
  { model: "wodLog", reason: "logs de WOD del paciente" },
  { model: "metricEntry", reason: "entradas de métricas del paciente" },
  { model: "patientMetric", reason: "métricas del paciente" },
  { model: "programSession", reason: "sesiones generadas del paciente" },
  { model: "programAssignment", reason: "asignaciones de programa al paciente" },
  { model: "fisioTask", reason: "tareas del fisio sobre paciente" },
  { model: "patientAdaptation", reason: "adaptaciones del paciente" },
  { model: "programPause", reason: "pausas del paciente" },
  { model: "clinicalSessionCase", reason: "casos clínicos en sesión (1 por paciente)" },
  { model: "patientNotification", reason: "notificaciones al paciente" },
  { model: "scheduledCall", reason: "llamadas programadas a pacientes" },
  { model: "loginCode", reason: "códigos de login del paciente" },
  { model: "session", reason: "sesiones de auth (cualquier login)" },

  // ─── Renovaciones y suscripciones ───
  { model: "subscriptionRenewal", reason: "renovaciones de suscripción del paciente" },
  { model: "renewalCheckout", reason: "checkouts de renovación pendientes" },

  // ─── Ventas, leads, finanzas ───
  { model: "sale", reason: "ventas (links de pago + cerradas)" },
  { model: "transaction", reason: "transacciones financieras (ingresos, sueldos, gastos)" },
  { model: "payrollPayment", reason: "pagos de nómina" },

  // ─── Equipo histórico ───
  { model: "professionalLeave", reason: "vacaciones del equipo" },
  { model: "closingShift", reason: "turnos de cierre concretos" },
  { model: "teamMeeting", reason: "reuniones registradas (preparación + resumen)" },
  { model: "teamNotification", reason: "notificaciones in-app del equipo" },

  // ─── Cuadro de mandos ───
  { model: "businessMonthlyInput", reason: "inputs mensuales del Cuadro de mandos" },
  { model: "businessQuarterlyGoal", reason: "objetivos trimestrales del Cuadro de mandos" },

  // ─── Padres (al final) ───
  { model: "patient", reason: "PACIENTES" },
  { model: "lead", reason: "LEADS" },
];

/**
 * Lista de modelos que se MANTIENEN (para verificación visual). Si algún
 * modelo nuevo aparece en el schema y no está aquí ni en DELETE_PLAN,
 * conviene revisarlo a mano antes de lanzar el reset.
 */
const KEPT_MODELS = [
  "Professional", "Compensation",
  "ClinicalProfile", "ClinicalLevel", "ClinicalLevelRule",
  "MovementCategory", "Movement", "ExerciseLibrary",
  "Program", "ProgramWeek", "ProgramDay", "ProgramTask",
  "TaskWorkout", "WorkoutExercise", "TaskVideo", "TaskForm", "TaskEvolution",
  "WorkoutTemplate", "MetricDefinition",
  "FormLibrary", "VideoLibrary", "MessageTemplate",
  "WeeklyTemplate", "ScriptTemplate",
  "ContentWeek", "ContentPiece",
  "LeadMagnet", "ClinicalCase", "WinningHook", "ContentIdea",
  "RollingProgram", "RollingWeek", "RollingDay", "RollingTask",
  "CalendarEvent", "AgendaBlock", "WeekOverride", "DefaultClosingShift",
  "AdCampaignTag", "MonthlyChallenge",
  "CommunityModule", "CommunitySection", "CommunityLesson",
  "CommunityIdea", "CommunityPost",
  "OnboardingConfig", "LandingConfig", "WelcomeMessageConfig",
  "WeeklyTeamTask", "TeamTaskAdHoc",
  "GoogleCalendarConnection",
];

function fmtCount(n: number): string {
  return n.toString().padStart(6, " ");
}

async function countAll(): Promise<Map<string, number>> {
  const counts = new Map<string, number>();
  for (const step of DELETE_PLAN) {
    const n = await (prisma as any)[step.model].count();
    counts.set(step.model, n);
  }
  return counts;
}

async function main() {
  console.log("\n═══════════════════════════════════════════════════════════════");
  console.log("  RESET PRE-LAUNCH — modo:", APPLY ? "🔴 APPLY (borra de verdad)" : "🟢 DRY-RUN (no toca nada)");
  console.log("═══════════════════════════════════════════════════════════════\n");

  if (APPLY && !CONFIRMED) {
    console.error(
      "❌ --apply requiere también CONFIRM=YES_DELETE_ALL en el entorno.\n" +
      "   Ejemplo:\n" +
      "     CONFIRM=YES_DELETE_ALL npx tsx scripts/reset-prelaunch.ts --apply\n"
    );
    process.exit(1);
  }

  console.log("Conteo actual de filas en los modelos a borrar:\n");
  const before = await countAll();
  let total = 0;
  for (const step of DELETE_PLAN) {
    const n = before.get(step.model) ?? 0;
    total += n;
    console.log(`  ${fmtCount(n)}  ${step.model.padEnd(34, " ")}  · ${step.reason}`);
  }
  console.log(`  ${"─".repeat(6)}`);
  console.log(`  ${fmtCount(total)}  TOTAL filas a borrar`);

  console.log("\nSe MANTIENEN intactos estos modelos (resumen):");
  console.log("  " + KEPT_MODELS.join(", "));
  console.log();

  if (!APPLY) {
    console.log("🟢 DRY-RUN: ninguna fila modificada. Para aplicar:");
    console.log("   CONFIRM=YES_DELETE_ALL npx tsx scripts/reset-prelaunch.ts --apply\n");
    return;
  }

  console.log("🔴 Aplicando reset en transacción única…\n");

  // Lo hacemos en una transacción para que sea atómico: si algo falla, no
  // queda la BD en estado intermedio.
  await prisma.$transaction(
    async (tx) => {
      for (const step of DELETE_PLAN) {
        const result = await (tx as any)[step.model].deleteMany({});
        console.log(`  ✓ ${step.model.padEnd(34, " ")}  → ${fmtCount(result.count)} filas borradas`);
      }
    },
    { timeout: 120_000 } // 2 minutos por si la BD es grande
  );

  console.log("\nConteo final (debe ser 0 en todas):\n");
  const after = await countAll();
  for (const step of DELETE_PLAN) {
    const n = after.get(step.model) ?? 0;
    const marker = n === 0 ? "✓" : "⚠";
    console.log(`  ${marker} ${step.model.padEnd(34, " ")}  → ${fmtCount(n)}`);
  }

  console.log("\n✅ Reset completado. La BD está lista para el lanzamiento.\n");
}

main()
  .catch((err) => {
    console.error("\n❌ Error durante el reset:", err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
