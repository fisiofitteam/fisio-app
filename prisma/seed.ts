import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// Devuelve la próxima fecha donde el día de semana coincide con target (1=lun, 7=dom)
function getNextWeekday(target: number): Date {
  const now = new Date();
  const today = now.getDay() === 0 ? 7 : now.getDay();
  const daysToAdd = (target - today + 7) % 7 || 7;
  const result = new Date(now);
  result.setDate(now.getDate() + daysToAdd);
  result.setHours(9, 0, 0, 0);
  return result;
}

const CATEGORIES = [
  { name: "Empuje vertical cargado", slug: "vertical_push_loaded" },
  { name: "Olímpico overhead", slug: "olympic_overhead" },
  { name: "Gimnástico kipping", slug: "gymnastic_kipping" },
  { name: "Gimnástico estricto", slug: "gymnastic_strict" },
  { name: "Dominante de rodilla", slug: "knee_dominant" },
  { name: "Dominante de cadera", slug: "hip_dominant" },
  { name: "Tracción horizontal", slug: "horizontal_pull" },
  { name: "Pliométrico / impacto", slug: "plyometric_impact" },
  { name: "Monoestructural", slug: "monostructural" },
  { name: "Core / locomoción", slug: "core_locomotion" },
];

type MovDef = { canonical: string; display: string; aliases: string; category: string; overhead?: boolean; impact?: boolean; kipping?: boolean };

const MOVEMENTS: MovDef[] = [
  { canonical: "thruster", display: "Thruster", aliases: "thr,thrusters,th", category: "vertical_push_loaded", overhead: true },
  { canonical: "push_press", display: "Push press", aliases: "pp,push press", category: "vertical_push_loaded", overhead: true },
  { canonical: "push_jerk", display: "Push jerk", aliases: "pj", category: "vertical_push_loaded", overhead: true },
  { canonical: "split_jerk", display: "Split jerk", aliases: "sj", category: "vertical_push_loaded", overhead: true },
  { canonical: "strict_press", display: "Strict press", aliases: "sp,press", category: "vertical_push_loaded", overhead: true },
  { canonical: "snatch", display: "Snatch", aliases: "sn,arrancada", category: "olympic_overhead", overhead: true },
  { canonical: "power_snatch", display: "Power snatch", aliases: "psn", category: "olympic_overhead", overhead: true },
  { canonical: "squat_snatch", display: "Squat snatch", aliases: "ssn", category: "olympic_overhead", overhead: true },
  { canonical: "hang_snatch", display: "Hang snatch", aliases: "hsn", category: "olympic_overhead", overhead: true },
  { canonical: "overhead_squat", display: "Overhead squat", aliases: "ohs", category: "olympic_overhead", overhead: true },
  { canonical: "clean", display: "Clean", aliases: "cl,cargada", category: "knee_dominant" },
  { canonical: "power_clean", display: "Power clean", aliases: "pcl", category: "knee_dominant" },
  { canonical: "squat_clean", display: "Squat clean", aliases: "scl", category: "knee_dominant" },
  { canonical: "hang_clean", display: "Hang clean", aliases: "hcl", category: "knee_dominant" },
  { canonical: "clean_and_jerk", display: "Clean and jerk", aliases: "c&j", category: "vertical_push_loaded", overhead: true },
  { canonical: "pull_up", display: "Pull-up", aliases: "pu,dominada", category: "gymnastic_kipping", kipping: true },
  { canonical: "chest_to_bar", display: "Chest to bar", aliases: "c2b,ctb", category: "gymnastic_kipping", kipping: true },
  { canonical: "toes_to_bar", display: "Toes to bar", aliases: "t2b,ttb", category: "gymnastic_kipping", kipping: true },
  { canonical: "knees_to_elbows", display: "Knees to elbows", aliases: "k2e", category: "gymnastic_kipping", kipping: true },
  { canonical: "muscle_up", display: "Muscle-up", aliases: "mu", category: "gymnastic_kipping", kipping: true },
  { canonical: "bar_muscle_up", display: "Bar muscle-up", aliases: "bmu", category: "gymnastic_kipping", kipping: true },
  { canonical: "ring_muscle_up", display: "Ring muscle-up", aliases: "rmu", category: "gymnastic_kipping", kipping: true },
  { canonical: "hspu", display: "Handstand push-up", aliases: "hspu", category: "gymnastic_kipping", overhead: true, kipping: true },
  { canonical: "handstand_walk", display: "Handstand walk", aliases: "hsw", category: "gymnastic_kipping", overhead: true },
  { canonical: "strict_pull_up", display: "Strict pull-up", aliases: "strict pu", category: "gymnastic_strict" },
  { canonical: "ring_dip", display: "Ring dip", aliases: "rd", category: "gymnastic_strict" },
  { canonical: "push_up", display: "Push-up", aliases: "flexion", category: "gymnastic_strict" },
  { canonical: "ring_row", display: "Ring row", aliases: "rr", category: "horizontal_pull" },
  { canonical: "back_squat", display: "Back squat", aliases: "bs", category: "knee_dominant" },
  { canonical: "front_squat", display: "Front squat", aliases: "fs", category: "knee_dominant" },
  { canonical: "air_squat", display: "Air squat", aliases: "as", category: "knee_dominant" },
  { canonical: "lunge", display: "Lunge", aliases: "zancada", category: "knee_dominant" },
  { canonical: "wall_ball", display: "Wall ball", aliases: "wb", category: "vertical_push_loaded", overhead: true },
  { canonical: "goblet_squat", display: "Goblet squat", aliases: "goblet", category: "knee_dominant" },
  { canonical: "deadlift", display: "Deadlift", aliases: "dl,peso muerto", category: "hip_dominant" },
  { canonical: "kb_swing", display: "KB swing", aliases: "kbs", category: "hip_dominant" },
  { canonical: "rdl", display: "Romanian deadlift", aliases: "rdl", category: "hip_dominant" },
  { canonical: "hip_thrust", display: "Hip thrust", aliases: "ht", category: "hip_dominant" },
  { canonical: "barbell_row", display: "Barbell row", aliases: "br", category: "horizontal_pull" },
  { canonical: "kb_row", display: "KB row", aliases: "kbr", category: "horizontal_pull" },
  { canonical: "box_jump", display: "Box jump", aliases: "bj", category: "plyometric_impact", impact: true },
  { canonical: "burpee", display: "Burpee", aliases: "bp", category: "plyometric_impact", impact: true },
  { canonical: "double_under", display: "Double under", aliases: "du,dobles", category: "plyometric_impact", impact: true },
  { canonical: "run", display: "Run", aliases: "correr", category: "monostructural", impact: true },
  { canonical: "row_erg", display: "Row erg", aliases: "row", category: "monostructural" },
  { canonical: "bike_erg", display: "Bike erg", aliases: "bike", category: "monostructural" },
  { canonical: "sit_up", display: "Sit-up", aliases: "abdo", category: "core_locomotion" },
  { canonical: "plank", display: "Plank", aliases: "plancha", category: "core_locomotion" },
  { canonical: "farmer_carry", display: "Farmer carry", aliases: "fc", category: "core_locomotion" },
];

type RuleSeed = { mov: string; state: "OK" | "CONDITIONAL" | "BLOCKED"; sub?: string; load?: string; warn?: string };

const IMPINGEMENT_L1: RuleSeed[] = [
  { mov: "snatch", state: "BLOCKED", sub: "Remo invertido en TRX" },
  { mov: "power_snatch", state: "BLOCKED", sub: "Remo invertido" },
  { mov: "overhead_squat", state: "BLOCKED", sub: "Goblet squat", load: "8 kg" },
  { mov: "thruster", state: "BLOCKED", sub: "Goblet squat sin press", load: "8 kg" },
  { mov: "push_press", state: "BLOCKED", sub: "Movilidad escapular en pared" },
  { mov: "strict_press", state: "BLOCKED", sub: "Pendulum escapular" },
  { mov: "pull_up", state: "BLOCKED", sub: "Ring row con pies adelantados" },
  { mov: "hspu", state: "BLOCKED", sub: "Plancha frontal" },
  { mov: "muscle_up", state: "BLOCKED", sub: "Excéntrico de dominada" },
  { mov: "wall_ball", state: "BLOCKED", sub: "Goblet squat", load: "8 kg" },
];

const IMPINGEMENT_L2: RuleSeed[] = [
  { mov: "snatch", state: "BLOCKED", sub: "Hang muscle snatch técnico", load: "barra vacía" },
  { mov: "thruster", state: "CONDITIONAL", sub: "Goblet squat + press unilateral", load: "12 kg" },
  { mov: "push_press", state: "CONDITIONAL", sub: "Landmine press", load: "10 kg" },
  { mov: "strict_press", state: "CONDITIONAL", sub: "Strict press KB unilateral", load: "8 kg" },
  { mov: "pull_up", state: "BLOCKED", sub: "Strict pull-up asistido", load: "BW" },
  { mov: "hspu", state: "BLOCKED", sub: "Pike push-up" },
  { mov: "muscle_up", state: "BLOCKED", sub: "Pull-up + dip por separado" },
  { mov: "wall_ball", state: "CONDITIONAL", load: "4 kg" },
];

const IMPINGEMENT_L3: RuleSeed[] = [
  { mov: "snatch", state: "CONDITIONAL", sub: "Hang muscle snatch", load: "30 kg máx" },
  { mov: "thruster", state: "CONDITIONAL", load: "30 kg máx", warn: "Velocidad media" },
  { mov: "push_press", state: "CONDITIONAL", load: "40 kg máx" },
  { mov: "strict_press", state: "CONDITIONAL", load: "30 kg máx" },
  { mov: "pull_up", state: "CONDITIONAL", sub: "Strict pull-up", warn: "Sin kipping" },
  { mov: "hspu", state: "CONDITIONAL", sub: "Pike push-up" },
  { mov: "muscle_up", state: "BLOCKED", sub: "Strict pull-up + dip" },
  { mov: "wall_ball", state: "CONDITIONAL", load: "6 kg" },
];

const IMPINGEMENT_L4: RuleSeed[] = [
  { mov: "snatch", state: "CONDITIONAL", load: "60% 1RM máx" },
  { mov: "thruster", state: "OK", warn: "Calentar bien hombros" },
  { mov: "push_press", state: "OK" },
  { mov: "strict_press", state: "OK" },
  { mov: "pull_up", state: "CONDITIONAL", warn: "Empezar estricto" },
  { mov: "hspu", state: "CONDITIONAL", sub: "HSPU estricto" },
  { mov: "muscle_up", state: "CONDITIONAL", sub: "Strict MU si puede" },
];

const IMPINGEMENT_L5: RuleSeed[] = [
  { mov: "muscle_up", state: "OK", warn: "Calentar transición específica" },
  { mov: "snatch", state: "OK", warn: "Movilidad previa obligatoria" },
];

const TENDINOPATHY_L1: RuleSeed[] = [
  { mov: "snatch", state: "BLOCKED", sub: "Isométrico de RE con banda" },
  { mov: "thruster", state: "BLOCKED", sub: "Air squat" },
  { mov: "push_press", state: "BLOCKED", sub: "Isométrico de RE 45°" },
  { mov: "strict_press", state: "BLOCKED", sub: "Isométrico de press contra pared" },
  { mov: "pull_up", state: "BLOCKED", sub: "Retracción escapular en prono" },
  { mov: "hspu", state: "BLOCKED", sub: "Plancha frontal" },
  { mov: "wall_ball", state: "BLOCKED", sub: "Air squat" },
];

const TENDINOPATHY_L2: RuleSeed[] = [
  { mov: "thruster", state: "BLOCKED", sub: "Goblet squat", load: "10 kg" },
  { mov: "push_press", state: "BLOCKED", sub: "Press contra pared isométrico 45°" },
  { mov: "strict_press", state: "BLOCKED", sub: "Press KB unilateral muy lento", load: "6 kg" },
  { mov: "pull_up", state: "BLOCKED", sub: "Excéntrico de dominada 5 s bajada" },
  { mov: "hspu", state: "BLOCKED", sub: "Pike push-up con manos altas" },
];

const TENDINOPATHY_L3: RuleSeed[] = [
  { mov: "thruster", state: "CONDITIONAL", sub: "Goblet thruster lento", load: "12 kg" },
  { mov: "push_press", state: "CONDITIONAL", sub: "Landmine press", load: "15 kg" },
  { mov: "strict_press", state: "CONDITIONAL", load: "20 kg máx" },
  { mov: "pull_up", state: "CONDITIONAL", sub: "Strict pull-up con banda" },
];

const TENDINOPATHY_L4: RuleSeed[] = [
  { mov: "thruster", state: "CONDITIONAL", load: "35 kg máx" },
  { mov: "push_press", state: "CONDITIONAL", load: "45 kg máx" },
  { mov: "strict_press", state: "OK", load: "35 kg máx" },
];

const TENDINOPATHY_L5: RuleSeed[] = [
  { mov: "snatch", state: "OK", warn: "Calentamiento específico obligatorio" },
];

const PROFILES = [
  {
    name: "Hombro: Impingement subacromial",
    bodyZone: "hombro",
    description: "Síndrome de pinzamiento subacromial. Limitación principal en demandas overhead y kipping.",
    levels: [
      { name: "Nivel 1 - Fase aguda", description: "Dolor en reposo o nocturno.", rules: IMPINGEMENT_L1 },
      { name: "Nivel 2 - Recuperación temprana", description: "Dolor solo en gestos provocativos.", rules: IMPINGEMENT_L2 },
      { name: "Nivel 3 - Reintegración técnica", description: "Sin dolor en gestos básicos.", rules: IMPINGEMENT_L3 },
      { name: "Nivel 4 - Reentrada al box", description: "Tolerancia a carga overhead.", rules: IMPINGEMENT_L4 },
      { name: "Nivel 5 - Alta progresiva", description: "Sin restricciones salvo seguimiento.", rules: IMPINGEMENT_L5 },
    ],
  },
  {
    name: "Hombro: Tendinopatía del manguito",
    bodyZone: "hombro",
    description: "Tendinopatía del supraespinoso o infraespinoso.",
    levels: [
      { name: "Nivel 1 - Fase reactiva", description: "Dolor agudo. Solo isométricos.", rules: TENDINOPATHY_L1 },
      { name: "Nivel 2 - Disipación", description: "Isométricos cargados + isotónicos lentos.", rules: TENDINOPATHY_L2 },
      { name: "Nivel 3 - Construcción de fuerza", description: "Fuerza progresiva.", rules: TENDINOPATHY_L3 },
      { name: "Nivel 4 - Reentrada técnica", description: "Técnica con carga moderada.", rules: TENDINOPATHY_L4 },
      { name: "Nivel 5 - Alta deportiva", description: "Vuelta completa.", rules: TENDINOPATHY_L5 },
    ],
  },
];

// ============================================================================
// Biblioteca de ejercicios para los programas
// ============================================================================

type LibExercise = { name: string; category: string; tags: string; youtubeUrl: string; description: string };

const EXERCISE_LIBRARY: LibExercise[] = [
  // Movilidad
  { name: "Cat-camel", category: "Movilidad", tags: "lumbar,columna,calentamiento", youtubeUrl: "https://www.youtube.com/watch?v=K9bK0BwKFjs", description: "Movimiento lento entre flexión y extensión de columna. 10 repeticiones, sin forzar." },
  { name: "Sleeper stretch", category: "Movilidad", tags: "hombro,rotación interna,manguito", youtubeUrl: "https://www.youtube.com/watch?v=A5d3T_4N9SY", description: "En decúbito lateral, brazo en 90°, presionar antebrazo hacia el suelo. Mantener 30s." },
  { name: "Wall slides", category: "Movilidad", tags: "hombro,escapular,técnica", youtubeUrl: "https://www.youtube.com/watch?v=Dbm5dDl5fc8", description: "Espalda contra pared, manos pegadas, deslizar arriba sin perder contacto." },
  { name: "CARs de hombro", category: "Movilidad", tags: "hombro,articular", youtubeUrl: "https://www.youtube.com/watch?v=SC0NS7Hot8M", description: "Círculos controlados de hombro buscando máximo rango sin dolor." },

  // Activación
  { name: "Y-T-W prono", category: "Activación", tags: "escapular,manguito,trapecio inferior", youtubeUrl: "https://www.youtube.com/watch?v=WulnzWcphsM", description: "Tumbado boca abajo, formar las letras Y, T y W con los brazos. Pulgares al techo." },
  { name: "Face pull con banda", category: "Activación", tags: "hombro,trapecio,banda elástica", youtubeUrl: "https://www.youtube.com/watch?v=eIq5CB9JfKE", description: "Tirar de la banda hacia la cara, codos altos, retracción escapular." },
  { name: "Pallof press", category: "Activación", tags: "core,antirrotación", youtubeUrl: "https://www.youtube.com/watch?v=AH_QZLm_0-s", description: "De pie, banda lateral, empujar al frente sin permitir que el tronco rote." },
  { name: "Dead bug", category: "Activación", tags: "core,lumbar,estabilidad", youtubeUrl: "https://www.youtube.com/watch?v=g_BYB0R-4Ws", description: "Boca arriba, brazos al techo, extender brazo y pierna contraria sin perder contacto lumbar." },

  // Fuerza
  { name: "Strict press con KB unilateral", category: "Fuerza", tags: "hombro,unilateral,kettlebell", youtubeUrl: "https://www.youtube.com/watch?v=N6JLF7Fi3VM", description: "KB en posición rack, empujar overhead sin elevar hombro. Tempo 2-1-2." },
  { name: "Landmine press", category: "Fuerza", tags: "hombro,unilateral,barra", youtubeUrl: "https://www.youtube.com/watch?v=LWMxbVo9_KU", description: "Barra fijada en esquina, empujar oblicuo desde rack. Plano más amigable que el press vertical." },
  { name: "Cuban press", category: "Fuerza", tags: "hombro,manguito,rotación externa", youtubeUrl: "https://www.youtube.com/watch?v=z3lJ8nGKEyc", description: "KB liviano. Remo alto, rotación externa, press. Trabaja todo el cinturón escapular." },
  { name: "Ring row", category: "Fuerza", tags: "espalda,tracción horizontal", youtubeUrl: "https://www.youtube.com/watch?v=oad8j-_z5cQ", description: "Anillas, cuerpo recto, tirar pecho hacia las anillas. Variar dificultad con altura de pies." },
  { name: "Goblet squat", category: "Fuerza", tags: "piernas,técnica,kettlebell", youtubeUrl: "https://www.youtube.com/watch?v=MeIiIdhvXT4", description: "KB pegado al pecho, sentadilla profunda con tronco vertical. Tempo controlado." },
  { name: "Hip thrust", category: "Fuerza", tags: "glúteo,cadera", youtubeUrl: "https://www.youtube.com/watch?v=LM8XHLYJoYs", description: "Espalda apoyada en banco, barra sobre cadera, empujar hasta extensión total." },

  // Técnica
  { name: "Hang muscle snatch", category: "Técnica", tags: "olímpico,técnica,barra", youtubeUrl: "https://www.youtube.com/watch?v=A3K_-CRJ-O8", description: "Desde hang, snatch sin pasar por sentadilla. Trabaja recepción y velocidad de barra." },
  { name: "Pike push-up", category: "Técnica", tags: "hombro,gimnástico,progresión", youtubeUrl: "https://www.youtube.com/watch?v=4UpRyVbR6GY", description: "Pies en banco o cajón, manos en suelo formando V invertida. Empuje vertical sin handstand." },

  // Estiramiento
  { name: "Estiramiento pectoral en puerta", category: "Estiramiento", tags: "pectoral,hombro,postura", youtubeUrl: "https://www.youtube.com/watch?v=fNqM1NMz_Sk", description: "Antebrazo en marco de puerta, paso al frente. 30s cada lado." },
  { name: "Sleeper stretch + RE banda", category: "Estiramiento", tags: "hombro,rotación interna,manguito", youtubeUrl: "https://www.youtube.com/watch?v=A5d3T_4N9SY", description: "Variante del sleeper con banda añadiendo activación de RE en isométrico." },

  // Educacional / Cardio / Otros
  { name: "Bear crawl", category: "Cardio", tags: "core,coordinación,calentamiento", youtubeUrl: "https://www.youtube.com/watch?v=mtcWa6n3-WE", description: "Caminar en cuadrupedia, rodillas elevadas sin tocar suelo. 30s." },
  { name: "Dead hang", category: "Técnica", tags: "colgado,hombro,tolerancia tisular", youtubeUrl: "https://www.youtube.com/watch?v=zfQ8Ye3M-WI", description: "Colgado pasivo en barra. Empezar con pies apoyados si es necesario." },
];

async function main() {
  console.log("🧹 Limpiando datos antiguos...");
  await prisma.messageTemplate.deleteMany();
  await prisma.transaction.deleteMany();
  await prisma.subscriptionRenewal.deleteMany();
  await prisma.scheduledCall.deleteMany();
  await prisma.fisioTask.deleteMany();
  await prisma.formLibrary.deleteMany();
  await prisma.videoLibrary.deleteMany();
  await prisma.metricEntry.deleteMany();
  await prisma.patientMetric.deleteMany();
  await prisma.programSession.deleteMany();
  await prisma.programAssignment.deleteMany();
  await prisma.workoutExercise.deleteMany();
  await prisma.taskWorkout.deleteMany();
  await prisma.taskVideo.deleteMany();
  await prisma.taskForm.deleteMany();
  await prisma.taskEvolution.deleteMany();
  await prisma.programTask.deleteMany();
  await prisma.programDay.deleteMany();
  await prisma.programWeek.deleteMany();
  await prisma.program.deleteMany();
  await prisma.exerciseLibrary.deleteMany();
  await prisma.wodLog.deleteMany();
  await prisma.patientAdaptation.deleteMany();
  await prisma.clinicalLevelRule.deleteMany();
  await prisma.clinicalLevel.deleteMany();
  await prisma.clinicalProfile.deleteMany();
  await prisma.contentIdea.deleteMany();
  await prisma.winningHook.deleteMany();
  await prisma.clinicalCase.deleteMany();
  await prisma.leadMagnet.deleteMany();
  await prisma.contentStory.deleteMany();
  await prisma.contentPiece.deleteMany();
  await prisma.contentWeek.deleteMany();
  await prisma.lead.deleteMany();
  await prisma.session.deleteMany();
  await prisma.loginCode.deleteMany();
  await prisma.patient.deleteMany();
  await prisma.professional.deleteMany();
  await prisma.movement.deleteMany();
  await prisma.movementCategory.deleteMany();

  console.log("👥 Creando equipo de profesionales...");
  const proAles = await prisma.professional.create({
    data: { fullName: "Ales Faus", email: "fisiofitteam@fisiofitteam.com", role: "ceo" },
  });
  const proMiguel = await prisma.professional.create({
    data: { fullName: "Miguel Castro", email: "miguelcastro@fisiofitteam.com", role: "head_success" },
  });
  const proAlberto = await prisma.professional.create({
    data: { fullName: "Alberto Melis", email: "albertomelis@fisiofitteam.com", role: "fisio" },
  });
  const proSofia = await prisma.professional.create({
    data: { fullName: "Sofía Cáliz", email: "sofiacaliz@fisiofitteam.com", role: "fisio" },
  });
  const proBlanca = await prisma.professional.create({
    data: { fullName: "Blanca Garrido", email: "blancagarrido@fisiofitteam.com", role: "fisio" },
  });
  const proSetter = await prisma.professional.create({
    data: { fullName: "Niki Boykova", email: "nikiboykova.1997@gmail.com", role: "setter" },
  });
  const proCloser = await prisma.professional.create({
    data: { fullName: "Alba Maldonado", email: "videoconsultas@fisiofitteam.com", role: "closer" },
  });

  console.log("📚 Cargando categorías de movimientos CrossFit...");
  const catMap: Record<string, string> = {};
  for (const cat of CATEGORIES) {
    const created = await prisma.movementCategory.create({ data: cat });
    catMap[cat.slug] = created.id;
  }

  console.log(`💪 Cargando ${MOVEMENTS.length} movimientos CrossFit...`);
  const movByCanonical: Record<string, string> = {};
  for (const m of MOVEMENTS) {
    const created = await prisma.movement.create({
      data: {
        canonicalName: m.canonical,
        displayName: m.display,
        aliases: m.aliases,
        categoryId: catMap[m.category],
        isOverhead: m.overhead ?? false,
        isImpact: m.impact ?? false,
        isKipping: m.kipping ?? false,
      },
    });
    movByCanonical[m.canonical] = created.id;
  }

  console.log("🏥 Creando perfiles clínicos con sus niveles...");
  for (const profile of PROFILES) {
    const createdProfile = await prisma.clinicalProfile.create({
      data: { name: profile.name, bodyZone: profile.bodyZone, description: profile.description },
    });
    for (let i = 0; i < profile.levels.length; i++) {
      const level = profile.levels[i];
      const createdLevel = await prisma.clinicalLevel.create({
        data: { profileId: createdProfile.id, name: level.name, order: i + 1, description: level.description },
      });
      for (const rule of level.rules) {
        const movId = movByCanonical[rule.mov];
        if (!movId) continue;
        await prisma.clinicalLevelRule.create({
          data: {
            levelId: createdLevel.id,
            movementId: movId,
            state: rule.state,
            substitutionText: rule.sub || null,
            loadConstraint: rule.load || null,
            physioWarning: rule.warn || null,
          },
        });
      }
    }
  }

  console.log(`🎥 Cargando biblioteca de ${EXERCISE_LIBRARY.length} ejercicios...`);
  const libByName: Record<string, string> = {};
  for (const ex of EXERCISE_LIBRARY) {
    const t = (ex.tags ?? "").toLowerCase();
    const bodyZone = t.includes("hombro") || t.includes("escapular")
      ? "hombro"
      : t.includes("lumbar") || t.includes("core")
      ? "lumbar"
      : t.includes("rodilla")
      ? "rodilla"
      : "otros";
    const created = await prisma.exerciseLibrary.create({ data: { ...ex, bodyZone } });
    libByName[ex.name] = created.id;
  }

  console.log("📋 Creando programas demo con estructura semana × 7 días...");

  // PROGRAMA 1: Movilidad escapular
  const programaMovilidad = await prisma.program.create({
    data: {
      name: "Movilidad escapular",
      bodyZone: "hombro",
      type: "Movilidad",
      level: 3,
      description: "Rutina de movilidad y control escapular. 3 sesiones por semana.",
      weeksCount: 2,
    },
  });

  // Función auxiliar para crear día con tareas
  async function createDay(weekId: string, dayOfWeek: number, tasks: Array<any>) {
    const day = await prisma.programDay.create({ data: { weekId, dayOfWeek } });
    for (let i = 0; i < tasks.length; i++) {
      const t = tasks[i];
      const task = await prisma.programTask.create({
        data: { dayId: day.id, type: t.type, order: i, title: t.title },
      });
      if (t.type === "WORKOUT") {
        const w = await prisma.taskWorkout.create({
          data: { taskId: task.id, bodyText: t.bodyText },
        });
        if (t.exercises) {
          for (let j = 0; j < t.exercises.length; j++) {
            const exName = t.exercises[j];
            const exId = libByName[exName];
            if (exId) {
              await prisma.workoutExercise.create({
                data: { workoutId: w.id, exerciseId: exId, order: j },
              });
            }
          }
        }
      } else if (t.type === "VIDEO") {
        await prisma.taskVideo.create({
          data: { taskId: task.id, youtubeUrl: t.youtubeUrl, description: t.description ?? null },
        });
      } else if (t.type === "FORM") {
        await prisma.taskForm.create({
          data: { taskId: task.id, questions: JSON.stringify(t.questions) },
        });
      } else if (t.type === "EVOLUTION") {
        await prisma.taskEvolution.create({
          data: { taskId: task.id, instructions: t.instructions ?? null },
        });
      }
    }
  }

  // Semana 1 - Movilidad
  const w1 = await prisma.programWeek.create({
    data: { programId: programaMovilidad.id, weekNumber: 1, notes: "Semana de adaptación. Rangos suaves, sin forzar." },
  });

  await createDay(w1.id, 1, [
    {
      type: "WORKOUT",
      title: "Movilidad de hombro - 25 min",
      bodyText: `A) Calentamiento (5 min)
3 rondas:
- 10 cat-camel
- 10 wall slides
- 30s respiración diafragmática

B) Bloque principal (15 min)
4 rondas, sin prisa:
- 6 CARs de hombro cada lado
- 30s sleeper stretch cada lado
- 10 Y-T-W prono sin peso
- 30s descanso

C) Cierre (5 min)
- 2 min estiramiento pectoral en puerta
- 1 min cada lado wall slides lentos`,
      exercises: ["Cat-camel", "Wall slides", "CARs de hombro", "Sleeper stretch", "Y-T-W prono", "Estiramiento pectoral en puerta"],
    },
  ]);

  await createDay(w1.id, 3, [
    {
      type: "WORKOUT",
      title: "Activación escapular - 20 min",
      bodyText: `A) Calentamiento (5 min)
2 rondas:
- 6 CARs de hombro cada lado
- 30s plancha

B) Activación (12 min)
EMOM 12:
- Par: 12 face pull con banda
- Impar: 10 Y-T-W prono con peso 1kg

C) Cierre (3 min)
- 1 min cada lado sleeper stretch`,
      exercises: ["CARs de hombro", "Face pull con banda", "Y-T-W prono", "Sleeper stretch"],
    },
    {
      type: "EVOLUTION",
      title: "¿Cómo te has notado?",
      instructions: "Registra RPE de la sesión y si has notado dolor o rigidez en el hombro.",
    },
  ]);

  await createDay(w1.id, 5, [
    {
      type: "WORKOUT",
      title: "Integración - 25 min",
      bodyText: `A) Calentamiento (5 min)
- 10 wall slides
- 10 cat-camel
- 30s plank

B) Bloque principal (18 min)
4 rondas:
- 8 Cuban press KB ligero (4-6 kg)
- 10 face pull con banda
- 12 dead bug (6 cada lado)
- 30s descanso

C) Estiramiento (2 min)`,
      exercises: ["Wall slides", "Cat-camel", "Cuban press", "Face pull con banda", "Dead bug"],
    },
  ]);

  await createDay(w1.id, 6, [
    {
      type: "VIDEO",
      title: "Mini-clase: cómo funciona el hombro",
      youtubeUrl: "https://www.youtube.com/watch?v=Y8XEqCMfagU",
      description: "10 minutos explicando la anatomía básica del hombro y por qué el control escapular es la clave de la readaptación.",
    },
    {
      type: "FORM",
      title: "Cuestionario semanal",
      questions: [
        { id: "q1", text: "¿Cómo valoras tu dolor de hombro esta semana?", type: "scale", min: 0, max: 10 },
        { id: "q2", text: "¿Has notado mejora en la movilidad?", type: "yesno" },
        { id: "q3", text: "Notas adicionales", type: "text" },
      ],
    },
  ]);

  // Semana 2 - aumentamos carga
  const w2 = await prisma.programWeek.create({
    data: { programId: programaMovilidad.id, weekNumber: 2, notes: "Subimos carga. Misma estructura, más volumen." },
  });

  await createDay(w2.id, 1, [
    {
      type: "WORKOUT",
      title: "Movilidad con carga - 30 min",
      bodyText: `A) Calentamiento (5 min)
3 rondas:
- 10 cat-camel
- 10 wall slides
- 6 CARs de hombro cada lado

B) Bloque principal (20 min)
5 rondas:
- 8 Cuban press KB 6kg
- 12 face pull con banda media
- 10 Y-T-W prono con peso 2kg
- 30s plank
- 45s descanso

C) Cierre (5 min)
- 90s estiramiento pectoral en puerta
- 2 min sleeper stretch cada lado`,
      exercises: ["Cat-camel", "Wall slides", "CARs de hombro", "Cuban press", "Face pull con banda", "Y-T-W prono", "Estiramiento pectoral en puerta", "Sleeper stretch"],
    },
  ]);

  await createDay(w2.id, 3, [
    {
      type: "WORKOUT",
      title: "Fuerza tren superior - 30 min",
      bodyText: `A) Calentamiento (5 min)
2 rondas:
- 8 wall slides
- 10 face pull con banda

B) Fuerza (20 min)
4 rondas:
- 8 strict press KB unilateral cada lado, 6-8kg
- 10 ring row tempo 3-1-3
- 15 dead bug
- 60s descanso

C) Cierre (5 min)
- 2 min sleeper stretch
- 90s estiramiento pectoral`,
      exercises: ["Wall slides", "Face pull con banda", "Strict press con KB unilateral", "Ring row", "Dead bug", "Sleeper stretch", "Estiramiento pectoral en puerta"],
    },
    { type: "EVOLUTION", title: "Registro post-sesión" },
  ]);

  await createDay(w2.id, 5, [
    {
      type: "WORKOUT",
      title: "Integración avanzada - 30 min",
      bodyText: `A) Calentamiento (5 min)
- 10 wall slides
- 8 CARs cada lado

B) Bloque principal (22 min)
AMRAP 22:
- 6 landmine press cada lado, 15kg
- 8 ring row
- 10 pallof press cada lado, banda media
- 30s plank lateral cada lado

C) Cierre (3 min) - estiramientos`,
      exercises: ["Wall slides", "CARs de hombro", "Landmine press", "Ring row", "Pallof press"],
    },
  ]);

  // PROGRAMA 2: Trabajo tendinoso
  const programaTendinoso = await prisma.program.create({
    data: {
      name: "Trabajo tendinoso supraespinoso",
      bodyZone: "hombro",
      type: "Tendinoso",
      level: 2,
      description: "Protocolo isométrico + isotónico lento. 2 sesiones por semana.",
      weeksCount: 2,
    },
  });

  const tw1 = await prisma.programWeek.create({
    data: { programId: programaTendinoso.id, weekNumber: 1, notes: "Isométricos al 70%. Sin dolor > 3/10." },
  });

  await createDay(tw1.id, 2, [
    {
      type: "WORKOUT",
      title: "Isométricos - 25 min",
      bodyText: `A) Calentamiento (5 min)
- 2 min bike erg suave
- 10 CARs hombro cada lado
- 10 wall slides

B) Isométricos (17 min)
5 rondas:
- 45s isométrico RE banda 0°
- 45s isométrico RE banda 45°
- 2 min descanso completo

Nota: intensidad 70%, sin dolor > 3/10.

C) Cierre - 3 min sleeper stretch`,
      exercises: ["CARs de hombro", "Wall slides", "Sleeper stretch"],
    },
    {
      type: "EVOLUTION",
      title: "Registro de sesión",
      instructions: "Importante: si el dolor superó 3/10 en cualquier serie, anótalo en las notas.",
    },
  ]);

  await createDay(tw1.id, 5, [
    {
      type: "WORKOUT",
      title: "Isométricos + tempo - 25 min",
      bodyText: `A) Calentamiento (5 min)
3 rondas:
- 8 cat-camel
- 8 wall slides

B) Bloque tendinoso (18 min)
3 rondas:
- 3×45s isométrico RE banda
- 12 RE banda elástica tempo 3-1-3
- 10 Cuban press KB ligero
- 60s descanso entre rondas

C) Cierre (2 min)`,
      exercises: ["Cat-camel", "Wall slides", "Cuban press"],
    },
  ]);

  await createDay(tw1.id, 7, [
    {
      type: "VIDEO",
      title: "Por qué hacemos isométricos en tendinopatía",
      youtubeUrl: "https://www.youtube.com/watch?v=KtrqcbXSj48",
      description: "Explicación del mecanismo de los isométricos en el tratamiento de la tendinopatía y por qué son la primera fase del protocolo.",
    },
  ]);

  const tw2 = await prisma.programWeek.create({
    data: { programId: programaTendinoso.id, weekNumber: 2, notes: "Progresión a fuerza con tempo 2-1-2." },
  });

  await createDay(tw2.id, 2, [
    {
      type: "WORKOUT",
      title: "Fuerza con tempo - 30 min",
      bodyText: `A) Calentamiento (5 min)

B) Fuerza tendinosa (22 min)
4 rondas:
- 10 RE con banda tempo 2-1-2
- 8 strict press KB unilateral, tempo 2-1-2, 6-8kg
- 12 face pull con banda
- 90s descanso

C) Cierre (3 min)`,
      exercises: ["Strict press con KB unilateral", "Face pull con banda"],
    },
    { type: "EVOLUTION", title: "Registro post-sesión" },
  ]);

  await createDay(tw2.id, 5, [
    {
      type: "WORKOUT",
      title: "Carga progresiva - 30 min",
      bodyText: `A) Calentamiento (5 min)

B) Bloque principal (22 min)
5 rondas:
- 8 landmine press cada lado, 12-15kg
- 10 ring row
- 12 pull-apart con banda
- 8 Cuban press KB 6kg
- 60s descanso

C) Cierre - estiramientos`,
      exercises: ["Landmine press", "Ring row", "Cuban press"],
    },
    {
      type: "FORM",
      title: "Cuestionario fin de semana 2",
      questions: [
        { id: "p1", text: "Dolor de hombro esta semana (peor momento)", type: "scale", min: 0, max: 10 },
        { id: "p2", text: "Rigidez al despertar (0 = ninguna, 10 = mucha)", type: "scale", min: 0, max: 10 },
        { id: "p3", text: "¿Notas mejora respecto a la semana 1?", type: "yesno" },
        { id: "p4", text: "Notas adicionales", type: "text" },
      ],
    },
  ]);

  console.log("🧑‍⚕️ Creando pacientes demo...");
  const impingementProfile = await prisma.clinicalProfile.findFirst({
    where: { name: { contains: "Impingement" } },
    include: { levels: { orderBy: { order: "asc" } } },
  });
  const mariaLevel = impingementProfile?.levels[2];

  const maria = await prisma.patient.create({
    data: {
      fullName: "María García",
      sport: "CrossFit",
      diagnosis: "Impingement subacromial derecho",
      appliedLevelId: mariaLevel?.id,
      whatsappGroupUrl: "https://chat.whatsapp.com/DEMO_GROUP_LINK_MARIA",
      assignedProfessionalId: proAlberto.id, // María → Alberto
      programType: "CONSOLIDA",
      difficulty: "MEDIO",
      // Dirección de envío + parche ya enviado
      shippingAddress: "C/ Mayor 23, 3ºB",
      shippingCity: "Madrid",
      shippingPostalCode: "28013",
      shippingPhone: "+34 612 345 678",
      patchSent: true,
      patchSentAt: new Date(Date.now() - 12 * 86400000),
    },
  });

  if (mariaLevel) {
    const rules = await prisma.clinicalLevelRule.findMany({ where: { levelId: mariaLevel.id } });
    for (const r of rules) {
      await prisma.patientAdaptation.create({
        data: {
          patientId: maria.id,
          movementId: r.movementId,
          state: r.state,
          substitutionText: r.substitutionText,
          loadConstraint: r.loadConstraint,
          physioWarning: r.physioWarning,
        },
      });
    }
  }

  await prisma.patient.create({
    data: {
      fullName: "Javi Ramos",
      sport: "CrossFit",
      diagnosis: "Pendiente de evaluación",
      assignedProfessionalId: proSofia.id, // Javi → Sofía
      programType: "RECUPERA",
      difficulty: "FACIL",
    },
  });

  // Pacientes demo extra (algunos asignados, otros sin asignar)
  await prisma.patient.createMany({
    data: [
      {
        fullName: "Laura Sanz",
        sport: "CrossFit",
        diagnosis: "Tendinopatía rotuliana",
        subscriptionStartDate: new Date(Date.now() - 60 * 86400000),
        subscriptionPeriodMonths: 4,
        subscriptionTotalMonths: 4,
        assignedProfessionalId: proMiguel.id,
        programType: "ADVANCE",
        difficulty: "DIFICIL",
        shippingAddress: "Av. de la Paz 47",
        shippingCity: "Valencia",
        shippingPostalCode: "46010",
        shippingPhone: "+34 654 321 987",
      },
      {
        fullName: "Carlos Reyes",
        sport: "Hyrox",
        diagnosis: "Dolor lumbar crónico",
        subscriptionStartDate: new Date(Date.now() - 30 * 86400000),
        subscriptionPeriodMonths: 4,
        subscriptionTotalMonths: 4,
        assignedProfessionalId: proBlanca.id,
        programType: "CONSOLIDA",
        difficulty: "MEDIO",
        shippingAddress: "C/ Sant Jordi 12, 2º",
        shippingCity: "Barcelona",
        shippingPostalCode: "08010",
        shippingPhone: "+34 633 222 111",
      },
      {
        fullName: "Andrea Pons",
        sport: "CrossFit",
        diagnosis: "Cervicalgia mecánica",
        subscriptionStartDate: new Date(Date.now() - 15 * 86400000),
        subscriptionPeriodMonths: 4,
        subscriptionTotalMonths: 4,
        programType: "RECUPERA",
        difficulty: "FACIL",
        // sin asignar
      },
      {
        fullName: "Iván Moreno",
        sport: "CrossFit",
        diagnosis: "Pendiente de evaluación",
        // sin asignar, sin suscripción aún
      },
    ],
  });

  console.log("📈 Creando métricas precargadas...");
  const PRESET_METRICS = [
    { key: "pain", name: "Dolor", unit: "0-10" },
    { key: "rpe", name: "RPE percibido", unit: "0-10" },
    { key: "stiffness", name: "Rigidez", unit: "0-10" },
    { key: "strength", name: "Fuerza percibida", unit: "0-10" },
  ];

  const allPatients = await prisma.patient.findMany();
  for (const p of allPatients) {
    for (let i = 0; i < PRESET_METRICS.length; i++) {
      const m = PRESET_METRICS[i];
      await prisma.patientMetric.create({
        data: {
          patientId: p.id,
          key: m.key,
          name: m.name,
          unit: m.unit,
          isPreset: true,
          isVisible: true,
          order: i,
        },
      });
    }
  }

  // Datos demo de evolución para María (3 meses de dolor + RPE + rigidez)
  const mariaForMetrics = await prisma.patient.findFirst({ where: { fullName: "María García" } });
  if (mariaForMetrics) {
    const mariaPain = await prisma.patientMetric.findUnique({
      where: { patientId_key: { patientId: mariaForMetrics.id, key: "pain" } },
    });
    const mariaRpe = await prisma.patientMetric.findUnique({
      where: { patientId_key: { patientId: mariaForMetrics.id, key: "rpe" } },
    });
    const mariaStiff = await prisma.patientMetric.findUnique({
      where: { patientId_key: { patientId: mariaForMetrics.id, key: "stiffness" } },
    });

    // 12 semanas de evolución descendente para dolor y rigidez, RPE estable
    const today = new Date();
    today.setHours(12, 0, 0, 0);
    const painSeries = [7, 7, 6, 6, 5, 5, 4, 4, 3, 3, 2, 2];
    const rpeSeries = [6, 6, 7, 7, 7, 8, 8, 8, 7, 7, 8, 8];
    const stiffSeries = [8, 7, 7, 6, 6, 5, 5, 4, 4, 3, 3, 2];

    for (let i = 0; i < 12; i++) {
      const d = new Date(today);
      d.setDate(today.getDate() - (11 - i) * 7);

      if (mariaPain) await prisma.metricEntry.create({ data: { metricId: mariaPain.id, value: painSeries[i], recordedAt: d, source: "session" } });
      if (mariaRpe) await prisma.metricEntry.create({ data: { metricId: mariaRpe.id, value: rpeSeries[i], recordedAt: d, source: "session" } });
      if (mariaStiff) await prisma.metricEntry.create({ data: { metricId: mariaStiff.id, value: stiffSeries[i], recordedAt: d, source: "session" } });
    }
  }

  console.log("📋 Creando datos para el panel...");

  // Asignar suscripción a los pacientes existentes
  const allPatientsForSub = await prisma.patient.findMany();
  const now2 = new Date();
  for (let i = 0; i < allPatientsForSub.length; i++) {
    const p = allPatientsForSub[i];
    // María: empezó hace 7 meses (lleva ya 1 ciclo renovado, 3.5m del actual) → total 8m
    // Javi: empezó hace 1 mes (ciclo único de 4m) → total 4m
    const monthsAgo = i === 0 ? 7 : 1;
    const start = new Date(now2);
    start.setMonth(start.getMonth() - Math.floor(monthsAgo));
    start.setDate(start.getDate() - Math.round((monthsAgo % 1) * 30));
    await prisma.patient.update({
      where: { id: p.id },
      data: {
        subscriptionStartDate: start,
        subscriptionPeriodMonths: 4,
        subscriptionTotalMonths: i === 0 ? 8 : 4,
      },
    });
  }

  const mariaP = await prisma.patient.findFirst({ where: { fullName: "María García" } });
  const javiP = await prisma.patient.findFirst({ where: { fullName: "Javi Ramos" } });

  // Tareas demo
  await prisma.fisioTask.createMany({
    data: [
      { title: "Revisar evolución de María tras semana 4", patientId: mariaP?.id, dueDate: new Date(now2.getTime() + 2 * 86400000), source: "own", priority: "high" },
      { title: "Subir programa nuevo para tendinopatía rotuliana", description: "Inspirado en el de supraespinoso, adaptar a rodilla", dueDate: new Date(now2.getTime() + 5 * 86400000), source: "own", priority: "medium" },
      { title: "Grabar vídeo de técnica de KB swing", description: "Necesario para la biblioteca, no hay vídeo actual claro", source: "own", priority: "low" },
      { title: "Llamar a Javi para alta nivel 2", patientId: javiP?.id, dueDate: new Date(now2.getTime() + 1 * 86400000), source: "own", priority: "high" },
      // Tareas del equipo
      { title: "Revisar plan estratégico Q2", description: "Asignada por CEO en la última reunión", source: "team", assignedBy: "Ales (CEO)", assignedTo: "Miguel Castro,Alberto Melis", dueDate: new Date(now2.getTime() + 7 * 86400000), priority: "high" },
      { title: "Completar formación interna de RPE", description: "Marcado como prioritario por el head coach", source: "team", assignedBy: "Miguel (Head)", assignedTo: "Sofía Cáliz", dueDate: new Date(now2.getTime() + 3 * 86400000), priority: "medium" },
      // Recurrente: revisar bandeja todos los lunes
      { title: "Revisar formularios pendientes de la semana", description: "Tarea recurrente cada lunes", source: "own", recurrenceType: "weekly", recurrenceDay: 1, dueDate: getNextWeekday(1), priority: "medium" },
    ],
  });

  // Llamadas demo
  if (mariaP && javiP) {
    const today1800 = new Date(now2);
    today1800.setHours(18, 0, 0, 0);
    const monday1030 = new Date(now2);
    monday1030.setDate(now2.getDate() + ((1 - now2.getDay() + 7) % 7 || 7));
    monday1030.setHours(10, 30, 0, 0);
    const friday1700 = new Date(now2);
    friday1700.setDate(now2.getDate() + ((5 - now2.getDay() + 7) % 7));
    friday1700.setHours(17, 0, 0, 0);

    await prisma.scheduledCall.createMany({
      data: [
        { patientId: mariaP.id, scheduledAt: today1800, type: "optimizacion", notes: "Revisar progresión y siguiente fase del programa" },
        { patientId: javiP.id, scheduledAt: monday1030, type: "optimizacion", notes: "Anamnesis y plan de inicio" },
        { patientId: mariaP.id, scheduledAt: friday1700, type: "renovacion", notes: "Cierre del trimestre actual, propuesta de renovación" },
      ],
    });
  }

  // Biblioteca de formularios demo
  await prisma.formLibrary.createMany({
    data: [
      {
        name: "Cuestionario semanal de seguimiento",
        description: "Para enviar al final de cada semana al paciente",
        questions: JSON.stringify([
          { id: "q1", text: "Dolor esta semana (peor momento)", type: "scale", min: 0, max: 10 },
          { id: "q2", text: "Rigidez al despertar", type: "scale", min: 0, max: 10 },
          { id: "q3", text: "¿Has notado mejora respecto a la semana anterior?", type: "yesno" },
          { id: "q4", text: "Notas y observaciones", type: "text" },
        ]),
      },
      {
        name: "Anamnesis inicial - hombro",
        description: "Formulario completo para el primer contacto con paciente de hombro",
        questions: JSON.stringify([
          { id: "q1", text: "¿Cuándo empezó el dolor?", type: "text" },
          { id: "q2", text: "Intensidad del dolor actual (0-10)", type: "scale", min: 0, max: 10 },
          { id: "q3", text: "¿Aparece en gestos específicos?", type: "yesno" },
          { id: "q4", text: "Mecanismo lesional", type: "choice", options: ["Traumatismo", "Sobrecarga", "Desconocido", "Postoperatorio"] },
          { id: "q5", text: "Tratamientos previos", type: "text" },
        ]),
      },
      {
        name: "Test funcional de hombro",
        description: "Para evaluación de control escapular",
        questions: JSON.stringify([
          { id: "q1", text: "Wall slide sin compensación (rango)", type: "choice", options: ["Completo", "Parcial", "No realiza"] },
          { id: "q2", text: "Dolor durante test", type: "scale", min: 0, max: 10 },
        ]),
      },
    ],
  });

  // Biblioteca de vídeos demo
  await prisma.videoLibrary.createMany({
    data: [
      {
        title: "Anatomía básica del hombro",
        youtubeUrl: "https://www.youtube.com/watch?v=Y8XEqCMfagU",
        description: "Mini-clase explicativa de 10 minutos sobre la articulación glenohumeral y el rol de la escápula.",
        category: "Educación en entrenamiento",
        tags: "hombro,anatomía,escápula",
      },
      {
        title: "Por qué hacemos isométricos en tendinopatía",
        youtubeUrl: "https://www.youtube.com/watch?v=KtrqcbXSj48",
        description: "Mecanismo neurofisiológico de los isométricos y por qué son primera fase del protocolo.",
        category: "Píldoras y gestión del dolor",
        tags: "tendinopatía,isométricos,protocolo",
      },
      {
        title: "Cómo aplicar hielo correctamente",
        youtubeUrl: "https://www.youtube.com/watch?v=fNqM1NMz_Sk",
        description: "Cuándo, cuánto tiempo, dónde sí y dónde no.",
        category: "Píldoras y gestión del dolor",
        tags: "crioterapia,recuperación",
      },
      {
        title: "Cómo funciona nuestro programa de readaptación",
        youtubeUrl: "https://www.youtube.com/watch?v=Y8XEqCMfagU",
        description: "Las fases del programa, qué esperar en cada una y cómo medimos tu progreso.",
        category: "Proceso y programa",
        tags: "programa,fases,proceso",
      },
      {
        title: "Testimonio: vuelta al CrossFit tras impingement",
        youtubeUrl: "https://www.youtube.com/watch?v=KtrqcbXSj48",
        description: "El caso de un atleta que volvió a Rx 4 meses después de empezar el programa.",
        category: "Éxitos",
        tags: "testimonio,hombro,caso",
      },
    ],
  });

  // Renovaciones demo repartidas por fisios (con importes para ver ingresos en panel CEO)
  if (mariaP) {
    const renewedDate = new Date(now2);
    renewedDate.setMonth(renewedDate.getMonth() - 1);
    await prisma.subscriptionRenewal.create({
      data: {
        patientId: mariaP.id,
        outcome: "renewed",
        decidedAt: renewedDate,
        amountPaid: 480,
        notes: "Cierre del primer ciclo. Sigue con misma frecuencia y mismo programa de hombro.",
      },
    });
  }

  // Renovaciones de pacientes demo de otros fisios (últimos 90d)
  const laura = await prisma.patient.findFirst({ where: { fullName: "Laura Sanz" } });
  const carlos = await prisma.patient.findFirst({ where: { fullName: "Carlos Reyes" } });
  if (laura) {
    await prisma.subscriptionRenewal.create({
      data: {
        patientId: laura.id,
        outcome: "renewed",
        decidedAt: new Date(Date.now() - 20 * 86400000),
        amountPaid: 520,
        notes: "Cierra ciclo y amplía a 4 meses más",
      },
    });
  }
  if (carlos) {
    await prisma.subscriptionRenewal.create({
      data: {
        patientId: carlos.id,
        outcome: "lost",
        decidedAt: new Date(Date.now() - 45 * 86400000),
        notes: "Decide pausar por mudanza, abierto a volver más adelante",
      },
    });
  }

  // Transacciones demo (gastos + nuevas altas + otros ingresos)
  const andrea = await prisma.patient.findFirst({ where: { fullName: "Andrea Pons" } });
  const ivan = await prisma.patient.findFirst({ where: { fullName: "Iván Moreno" } });
  const now3 = new Date();
  const thisMonth = (offsetDays: number) => {
    const d = new Date(now3);
    d.setDate(d.getDate() - offsetDays);
    return d;
  };

  await prisma.transaction.createMany({
    data: [
      // Nuevas altas (este mes)
      { type: "income_new", amount: 480, description: "Alta - Andrea Pons", occurredAt: thisMonth(15), patientId: andrea?.id ?? null, professionalId: proAlberto.id },
      { type: "income_new", amount: 480, description: "Alta - Iván Moreno", occurredAt: thisMonth(8), patientId: ivan?.id ?? null, professionalId: proSofia.id },
      // Otros ingresos
      { type: "income_other", amount: 350, description: "Formación online de readaptación CrossFit", occurredAt: thisMonth(10), professionalId: proAles.id },
      { type: "income_other", amount: 80, description: "Comisión afiliado app de nutrición", occurredAt: thisMonth(5) },
      // Gastos
      { type: "expense", category: "software", amount: 49, description: "Notion - Plan equipo", occurredAt: thisMonth(2) },
      { type: "expense", category: "software", amount: 120, description: "Anthropic API + hostings", occurredAt: thisMonth(1) },
      { type: "expense", category: "marketing", amount: 250, description: "Instagram Ads - campaña hombro", occurredAt: thisMonth(7) },
      { type: "expense", category: "marketing", amount: 400, description: "Producción reel anuncio", occurredAt: thisMonth(12) },
      { type: "expense", category: "sueldos", amount: 2200, description: "Sueldo mensual - Alberto", occurredAt: thisMonth(20), professionalId: proAlberto.id },
      { type: "expense", category: "sueldos", amount: 2200, description: "Sueldo mensual - Sofía", occurredAt: thisMonth(20), professionalId: proSofia.id },
      { type: "expense", category: "sueldos", amount: 2200, description: "Sueldo mensual - Blanca", occurredAt: thisMonth(20), professionalId: proBlanca.id },
      { type: "expense", category: "otros", amount: 90, description: "Material papelería oficina", occurredAt: thisMonth(18) },
    ],
  });

  // Mensajes prefijados demo
  await prisma.messageTemplate.createMany({
    data: [
      {
        name: "Bienvenida nuevo paciente",
        category: "Bienvenida",
        body: "Hola {nombre}, soy Alex de FisioFit Team. ¡Bienvenida! Para empezar bien, te paso el cuestionario de anamnesis para que lo rellenes con calma. Cualquier duda, por aquí.",
      },
      {
        name: "Recordatorio anamnesis",
        category: "Bienvenida",
        body: "Hola {nombre}, te paso el formulario de anamnesis que tienes pendiente. Lo necesito antes de tu primera llamada para preparar bien la sesión.",
      },
      {
        name: "Pre-renovación (15 días antes)",
        category: "Renovación",
        body: "Hola {nombre}, en {dias_renovacion} días termina tu trimestre conmigo. ¿Tienes un hueco esta semana para hablar y ver cómo seguimos? Si te encajan los progresos, podemos planear el siguiente bloque.",
      },
      {
        name: "Seguimiento semanal",
        category: "Seguimiento",
        body: "Hola {nombre}, ¿cómo va la semana? ¿Has podido completar las sesiones? Recuerda registrarme cualquier molestia para ajustar lo que sea necesario.",
      },
      {
        name: "Alta del programa",
        category: "Alta",
        body: "Hola {nombre}, ¡felicidades! Has terminado el programa con muy buenos progresos. Te paso un resumen de tu evolución y las recomendaciones para mantenerlo.",
      },
    ],
  });

  // Asignar programa de movilidad a María con sesiones reales (algunas completadas)
  if (mariaP) {
    const programa = await prisma.program.findFirst({ where: { name: "Movilidad escapular" } });
    if (programa) {
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - 10); // empezó hace 10 días
      // Asegurar que sea lunes (el modelo lo requiere conceptualmente)
      const dow = startDate.getDay();
      const daysToMonday = dow === 0 ? -6 : 1 - dow;
      startDate.setDate(startDate.getDate() + daysToMonday);

      const assignment = await prisma.programAssignment.create({
        data: {
          patientId: mariaP.id,
          programId: programa.id,
          startDate,
          weeksCount: programa.weeksCount,
          isActive: true,
        },
      });

      // Crear sesiones reales: 2 semanas × 5 días = 10 sesiones
      const weeks = await prisma.programWeek.findMany({
        where: { programId: programa.id },
        include: { days: { include: { tasks: { include: { workout: true, video: true, form: true, evolution: true } } } } },
        orderBy: { weekNumber: "asc" },
      });

      let dayOffset = 0;
      let pastCount = 0;
      for (const w of weeks) {
        for (const d of w.days) {
          if (d.dayOfWeek > 5) continue; // solo L-V
          if (d.tasks.length === 0) continue;
          const sessionDate = new Date(startDate);
          sessionDate.setDate(startDate.getDate() + dayOffset);
          dayOffset++;
          const isPast = sessionDate < new Date();
          const tasksSnapshot = d.tasks.map((t) => ({
            id: t.id,
            type: t.type,
            title: t.title,
            order: t.order,
            ...(t.workout && { bodyText: t.workout.bodyText, exerciseIds: [] }),
            ...(t.video && { youtubeUrl: t.video.youtubeUrl, description: t.video.description }),
            ...(t.form && { questions: t.form.questions }),
            ...(t.evolution && { instructions: t.evolution.instructions }),
          }));
          const shouldComplete = isPast && pastCount % 5 !== 0;
          if (isPast) pastCount++;
          await prisma.programSession.create({
            data: {
              assignmentId: assignment.id,
              scheduledDate: sessionDate,
              weekNumber: w.weekNumber,
              dayOfWeek: d.dayOfWeek,
              tasksSnapshot: JSON.stringify(tasksSnapshot),
              completedAt: shouldComplete ? new Date(sessionDate.getTime() + 3600000) : null,
            },
          });
        }
      }
    }
  }

  console.log("📞 Creando leads demo...");
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(10, 0, 0, 0);

  const today11 = new Date();
  today11.setHours(11, 30, 0, 0);

  const inTwoDays = new Date();
  inTwoDays.setDate(inTwoDays.getDate() + 2);
  inTwoDays.setHours(17, 0, 0, 0);

  const lastWeek = new Date();
  lastWeek.setDate(lastWeek.getDate() - 5);

  await prisma.lead.createMany({
    data: [
      {
        fullName: "Roberto Sáez",
        contactType: "phone",
        contactValue: "+34 612 345 678",
        aiSummary: "Atleta de CrossFit con dolor de hombro desde hace 3 meses. Hace 5 sesiones/semana. Le interesa empezar YA. Urgencia alta.",
        callScheduledAt: today11,
        closerId: proAles.id,
        setterId: proSetter.id,
        status: "scheduled",
      },
      {
        fullName: "Patricia Núñez",
        contactType: "instagram",
        contactValue: "@patrinp_crossfit",
        aiSummary: "Box partner. Lesión lumbar recurrente, ha probado 2 fisios sin resultados. Muy escéptica pero abierta. Pide info de precio antes.",
        callScheduledAt: tomorrow,
        closerId: proCloser.id,
        setterId: proSetter.id,
        status: "scheduled",
      },
      {
        fullName: "Diego Marín",
        contactType: "phone",
        contactValue: "+34 698 765 432",
        aiSummary: "Recomendado por María García. Tendinopatía rotuliana. Compite en septiembre.",
        callScheduledAt: inTwoDays,
        closerId: proAles.id,
        setterId: proSetter.id,
        status: "scheduled",
      },
      {
        fullName: "Elena Cobo",
        contactType: "instagram",
        contactValue: "@elenacb",
        aiSummary: "Webinar de hombros. Le encantó la metodología. Cierra sin objeción.",
        callScheduledAt: lastWeek,
        closerId: proCloser.id,
        setterId: proSetter.id,
        status: "won",
        decidedAt: lastWeek,
      },
      {
        fullName: "Pablo Marí",
        contactType: "phone",
        contactValue: "+34 655 555 555",
        aiSummary: "Dolor cervical. Tras llamada dice que el precio se le va de presupuesto.",
        callScheduledAt: lastWeek,
        closerId: proCloser.id,
        setterId: proSetter.id,
        status: "lost",
        lostReason: "precio",
        decidedAt: lastWeek,
      },
      {
        fullName: "Sara Vidal",
        contactType: "instagram",
        contactValue: "@sarvi_wod",
        aiSummary: "Interesada pero quiere consultar con su pareja. Que la llamemos en 2 semanas.",
        callScheduledAt: new Date(Date.now() - 3 * 86400000),
        closerId: proAles.id,
        setterId: proSetter.id,
        status: "cancelled",
        inFollowUp: true,
        followUpNote: "Llamar en 2 semanas tras hablar con pareja",
        followUpDate: new Date(Date.now() + 10 * 86400000),
        decidedAt: new Date(Date.now() - 3 * 86400000),
      },
      {
        fullName: "Hugo Sancho",
        contactType: "phone",
        contactValue: "+34 622 111 222",
        aiSummary: "Atleta intermedio, lesión de rodilla. La IA agendó pero no se presentó a la llamada.",
        callScheduledAt: new Date(Date.now() - 2 * 86400000),
        closerId: proCloser.id,
        setterId: proSetter.id,
        status: "no_show",
        decidedAt: new Date(Date.now() - 2 * 86400000),
      },
    ],
  });

  console.log("🎬 Creando semanas de contenido demo...");

  // Importar templates en el seed sería raro porque seed es JS-only, así que copio los formatos clave.
  const FORMATS_BY_DAY: Record<number, { key: string; goal: string; cta: string; kw: string; blocks: any[]; stories: string[] }> = {
    1: {
      key: "belief_carousel",
      goal: "Desmontar una creencia limitante de la audiencia",
      cta: "Suave (guardar / seguir)",
      kw: "",
      blocks: [
        { id: "hook", label: "Slide 1 · Hook", content: "", order: 0 },
        { id: "validation", label: "Slide 2 · Validación", content: "", order: 1 },
        { id: "desmonte1", label: "Slide 3 · Desmonte", content: "", order: 2 },
        { id: "desmonte2", label: "Slide 4 · Desmonte (continúa)", content: "", order: 3 },
        { id: "desmonte3", label: "Slide 5 · Desmonte (cierre)", content: "", order: 4 },
        { id: "que_hacer1", label: "Slide 6 · Qué hacer en su lugar", content: "", order: 5 },
        { id: "que_hacer2", label: "Slide 7 · Qué hacer (detalle)", content: "", order: 6 },
        { id: "expert_nuance", label: "Slide 8 · Matiz experto", content: "", order: 7 },
        { id: "recap", label: "Slide 9 · Recap", content: "", order: 8 },
        { id: "cta", label: "Slide 10 · CTA suave", content: "", order: 9 },
      ],
      stories: ["Caja de preguntas sobre el tema", "Encuesta: ¿lo creías tú también?", "Story con cita del carrusel"],
    },
    2: {
      key: "case_reel",
      goal: "Mostrar transformación real de un atleta",
      cta: "DM con palabra clave",
      kw: "CASO",
      blocks: [
        { id: "t0_3", label: "0–3s · Hook visual + dolor inicial", content: "", order: 0 },
        { id: "t3_10", label: "3–10s · Contexto del atleta", content: "", order: 1 },
        { id: "t10_35", label: "10–35s · Proceso (qué hicimos)", content: "", order: 2 },
        { id: "t35_50", label: "35–50s · Resultado tangible", content: "", order: 3 },
        { id: "t50_60", label: "50–60s · CTA: DM con palabra clave", content: "", order: 4 },
      ],
      stories: ["Story del atleta entrenando hoy", "Caja de preguntas: ¿quieres este resultado?"],
    },
    3: {
      key: "value_carousel",
      goal: "Educar profundamente sobre un tema clínico",
      cta: "Guardar + comentar",
      kw: "",
      blocks: [
        { id: "cover", label: "Slide 1 · Portada (promesa clara)", content: "", order: 0 },
        { id: "point1", label: "Slide 2 · Punto 1", content: "", order: 1 },
        { id: "point2", label: "Slide 3 · Punto 2", content: "", order: 2 },
        { id: "point3", label: "Slide 4 · Punto 3", content: "", order: 3 },
        { id: "point4", label: "Slide 5 · Punto 4", content: "", order: 4 },
        { id: "point5", label: "Slide 6 · Punto 5", content: "", order: 5 },
        { id: "expert_nuance", label: "Slide 7 · Matiz experto", content: "", order: 6 },
        { id: "cta", label: "Slide 8 · CTA: guarda y comenta", content: "", order: 7 },
      ],
      stories: ["Story con un punto clave del carrusel", "Caja de preguntas para resolver dudas"],
    },
    4: {
      key: "value_reel",
      goal: "Idea potente en menos de 45s",
      cta: "Comentar palabra clave",
      kw: "INFO",
      blocks: [
        { id: "t0_3", label: "0–3s · Hook directo", content: "", order: 0 },
        { id: "t3_25", label: "3–25s · Idea principal", content: "", order: 1 },
        { id: "t25_40", label: "25–40s · Ejemplo / aplicación", content: "", order: 2 },
        { id: "t40_45", label: "40–45s · CTA cierre", content: "", order: 3 },
        { id: "bonus_stories", label: "Bonus · Idea para stories", content: "", order: 4 },
      ],
      stories: ["Story con el reel anclado arriba", "Caja de preguntas para profundizar"],
    },
    5: {
      key: "exercises_carousel",
      goal: "Mostrar ejercicios concretos para un objetivo",
      cta: "DM lead magnet",
      kw: "PLAN",
      blocks: [
        { id: "cover", label: "Slide 1 · Portada", content: "", order: 0 },
        { id: "ex1", label: "Slide 2 · Ejercicio 1 (nombre / series-reps / detalle)", content: "", order: 1 },
        { id: "ex2", label: "Slide 3 · Ejercicio 2", content: "", order: 2 },
        { id: "ex3", label: "Slide 4 · Ejercicio 3", content: "", order: 3 },
        { id: "ex4", label: "Slide 5 · Ejercicio 4", content: "", order: 4 },
        { id: "ex5", label: "Slide 6 · Ejercicio 5", content: "", order: 5 },
        { id: "cta", label: "Slide 7 · CTA lead magnet", content: "", order: 6 },
      ],
      stories: ["Story demo de uno de los ejercicios", "Story con el lead magnet en encuesta"],
    },
    6: {
      key: "infographic",
      goal: "Resumir info denso en imagen visual",
      cta: "Guardar",
      kw: "",
      blocks: [
        { id: "format", label: "Formato (tabla / esquema / diagrama / lista)", content: "", order: 0 },
        { id: "title", label: "Título", content: "", order: 1 },
        { id: "block1", label: "Bloque 1", content: "", order: 2 },
        { id: "block2", label: "Bloque 2", content: "", order: 3 },
        { id: "block3", label: "Bloque 3", content: "", order: 4 },
        { id: "block4", label: "Bloque 4", content: "", order: 5 },
        { id: "caption", label: "Caption con CTA", content: "", order: 6 },
      ],
      stories: ["Story con un trozo zoom de la infografía"],
    },
    7: {
      key: "closing_reel",
      goal: "Cierre semanal con CTA fuerte",
      cta: "DM palabra clave (alta intención)",
      kw: "EMPEZAR",
      blocks: [
        { id: "t0_5", label: "0–5s · Hook de urgencia", content: "", order: 0 },
        { id: "t5_40", label: "5–40s · Argumento principal", content: "", order: 1 },
        { id: "t40_55", label: "40–55s · Prueba / caso breve", content: "", order: 2 },
        { id: "t55_60", label: "55–60s · CTA fuerte (DM palabra clave)", content: "", order: 3 },
      ],
      stories: ["Story con el reel anclado", "Caja de preguntas: ¿quieres empezar?", "Encuesta cierre de semana"],
    },
  };

  function isoWeekFromDateSeed(date: Date) {
    const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
    const dayNum = d.getUTCDay() || 7;
    d.setUTCDate(d.getUTCDate() + 4 - dayNum);
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    const weekNumber = Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
    return { year: d.getUTCFullYear(), weekNumber };
  }

  function mondayOfWeek(year: number, weekNumber: number): Date {
    const simple = new Date(Date.UTC(year, 0, 1 + (weekNumber - 1) * 7));
    const dow = simple.getUTCDay();
    const monday = new Date(simple);
    if (dow <= 4) monday.setUTCDate(simple.getUTCDate() - simple.getUTCDay() + 1);
    else monday.setUTCDate(simple.getUTCDate() + 8 - simple.getUTCDay());
    return monday;
  }

  async function createDemoWeek(opts: {
    year: number;
    weekNumber: number;
    centralTheme: string;
    bodyZone: string;
    weekType: string;
    leadMagnetName: string;
    leadMagnetKeyword: string;
    kpiName: string;
    kpiTarget: number;
    status: "planning" | "production" | "publishing" | "closed";
    closingNotes?: string;
    pieceStatesByDay: Record<number, string>; // dow -> piece status
    sampleHooks?: Record<number, string>;
    sampleCaptions?: Record<number, string>;
    sampleMetrics?: Record<number, { reach: number; saves: number; shares: number; comments: number; dm: number; conv: number }>;
  }) {
    const monday = mondayOfWeek(opts.year, opts.weekNumber);
    const sunday = new Date(monday);
    sunday.setUTCDate(monday.getUTCDate() + 6);

    const week = await prisma.contentWeek.create({
      data: {
        year: opts.year,
        weekNumber: opts.weekNumber,
        startDate: monday,
        endDate: sunday,
        centralTheme: opts.centralTheme,
        bodyZone: opts.bodyZone,
        weekType: opts.weekType,
        limitingBeliefs: JSON.stringify([]),
        leadMagnetName: opts.leadMagnetName,
        leadMagnetKeyword: opts.leadMagnetKeyword,
        mixValue: 50,
        mixBeliefs: 30,
        mixConversion: 20,
        kpiName: opts.kpiName,
        kpiTarget: opts.kpiTarget,
        status: opts.status,
        closingNotes: opts.closingNotes ?? null,
        closedAt: opts.status === "closed" ? new Date() : null,
      },
    });

    for (let dow = 1; dow <= 7; dow++) {
      const f = FORMATS_BY_DAY[dow];
      const scheduled = new Date(monday);
      scheduled.setUTCDate(monday.getUTCDate() + (dow - 1));
      scheduled.setUTCHours(19, 0, 0, 0);

      const m = opts.sampleMetrics?.[dow];
      await prisma.contentPiece.create({
        data: {
          weekId: week.id,
          dayOfWeek: dow,
          format: f.key,
          goal: f.goal,
          ctaType: f.cta,
          dmKeyword: f.kw || opts.leadMagnetKeyword,
          blocks: JSON.stringify(f.blocks),
          hook: opts.sampleHooks?.[dow] ?? null,
          caption: opts.sampleCaptions?.[dow] ?? null,
          status: opts.pieceStatesByDay[dow] ?? "idea",
          metricsReach: m?.reach ?? null,
          metricsSaves: m?.saves ?? null,
          metricsShares: m?.shares ?? null,
          metricsComments: m?.comments ?? null,
          metricsDmKeyword: m?.dm ?? null,
          metricsConversions: m?.conv ?? null,
          metricsFilledAt: m ? new Date() : null,
        },
      });
    }
  }

  // === Semana 1: la pasada cerrada con métricas ===
  const lastWeekDate = new Date();
  lastWeekDate.setDate(lastWeekDate.getDate() - 7);
  const { year: lastYear, weekNumber: lastWeekIso } = isoWeekFromDateSeed(lastWeekDate);

  await createDemoWeek({
    year: lastYear,
    weekNumber: lastWeekIso,
    centralTheme: "Impingement subacromial en CrossFitters",
    bodyZone: "hombro",
    weekType: "educativa",
    leadMagnetName: "Guía hombro CrossFit",
    leadMagnetKeyword: "HOMBRO",
    kpiName: "DMs con palabra clave",
    kpiTarget: 25,
    status: "closed",
    closingNotes: "El reel del martes (caso éxito) fue el que más DMs trajo. El carrusel del miércoles funcionó muy bien en guardados.",
    pieceStatesByDay: { 1: "published", 2: "published", 3: "published", 4: "published", 5: "published", 6: "published", 7: "published" },
    sampleHooks: {
      1: "Si tu hombro duele en HSPU, esto no es culpa de tu técnica.",
      2: "Pablo hacía Murph con dolor. Esto es lo que pasó en 8 semanas.",
      3: "5 errores que sostienen tu dolor de hombro sin que lo sepas.",
      4: "El movimiento que la mayoría hace mal y arruina su hombro.",
      5: "5 ejercicios para hombro estable en CrossFit.",
      6: "Anatomía del impingement: lo que pasa por dentro.",
      7: "Si llevas 3 meses con dolor, no es 'normal'. Esto sí.",
    },
    sampleMetrics: {
      1: { reach: 4200, saves: 187, shares: 23, comments: 31, dm: 4, conv: 0 },
      2: { reach: 8100, saves: 92, shares: 65, comments: 48, dm: 18, conv: 2 },
      3: { reach: 5300, saves: 312, shares: 19, comments: 22, dm: 3, conv: 1 },
      4: { reach: 6900, saves: 154, shares: 41, comments: 33, dm: 7, conv: 1 },
      5: { reach: 3800, saves: 245, shares: 28, comments: 18, dm: 12, conv: 1 },
      6: { reach: 2400, saves: 178, shares: 15, comments: 9, dm: 1, conv: 0 },
      7: { reach: 7200, saves: 64, shares: 38, comments: 41, dm: 21, conv: 3 },
    },
  });

  // === Semana 2: la actual en producción ===
  const todayDate = new Date();
  const { year: curYear, weekNumber: curWeek } = isoWeekFromDateSeed(todayDate);

  await createDemoWeek({
    year: curYear,
    weekNumber: curWeek,
    centralTheme: "Lumbar y peso muerto: técnica vs miedo",
    bodyZone: "lumbar",
    weekType: "objeciones",
    leadMagnetName: "Checklist deadlift seguro",
    leadMagnetKeyword: "DEADLIFT",
    kpiName: "DMs con palabra clave",
    kpiTarget: 30,
    status: "production",
    pieceStatesByDay: { 1: "scheduled", 2: "edited", 3: "recorded", 4: "script", 5: "idea", 6: "idea", 7: "idea" },
    sampleHooks: {
      1: "El 'core fuerte' no protege tu lumbar como crees.",
      2: "Laura no podía hacer deadlift sin dolor. Hoy levanta 100kg.",
      3: "Por qué la zona neutral es el mayor mito del deadlift.",
    },
  });

  console.log(`   - 2 semanas de contenido demo creadas (W${lastWeekIso}/${lastYear} cerrada, W${curWeek}/${curYear} en producción)`);
  console.log("🗂  Creando datos demo del banco de recursos...");

  // Lead magnets
  await prisma.leadMagnet.createMany({
    data: [
      {
        name: "Guía hombro CrossFit",
        keyword: "HOMBRO",
        description: "PDF con los 5 ejercicios de prevención y readaptación para hombro en atletas de CrossFit.",
        url: "https://drive.google.com/file/d/demo-hombro",
        active: true,
        lastPromotedAt: new Date(Date.now() - 7 * 86400000),
      },
      {
        name: "Checklist deadlift seguro",
        keyword: "DEADLIFT",
        description: "Lista de control técnica + activación previa para hacer deadlift sin riesgo lumbar.",
        url: "https://drive.google.com/file/d/demo-deadlift",
        active: true,
        lastPromotedAt: new Date(),
      },
      {
        name: "Plan rodilla 4 semanas",
        keyword: "RODILLA",
        description: "Programa progresivo para tendinopatía rotuliana en atletas que entrenan 5+ días/semana.",
        url: "https://drive.google.com/file/d/demo-rodilla",
        active: false,
        lastPromotedAt: new Date(Date.now() - 90 * 86400000),
      },
    ],
  });

  // Casos clínicos demo
  const mariaPatient = await prisma.patient.findFirst({ where: { fullName: "María García" } });
  await prisma.clinicalCase.createMany({
    data: [
      {
        athleteName: "María García",
        injury: "Impingement subacromial derecho",
        insight: "El trabajo de rotadores externos en posición de scaption fue lo que disparó la mejora. El descanso solo no funcionaba.",
        consentSigned: true,
        consentSignedAt: new Date(Date.now() - 30 * 86400000),
        videoUrls: JSON.stringify(["https://drive.google.com/demo-maria-1", "https://drive.google.com/demo-maria-2"]),
        notes: "Reutilizar para semanas educativas de hombro.",
        patientId: mariaPatient?.id ?? null,
      },
      {
        athleteName: "Pablo M.",
        injury: "Lumbalgia recurrente con deadlift",
        insight: "Modificar dominante de cadera vs rodilla durante 4 semanas le permitió volver a 1RM sin dolor.",
        consentSigned: true,
        consentSignedAt: new Date(Date.now() - 60 * 86400000),
        videoUrls: JSON.stringify([]),
        notes: "Posible reel cierre para semana de lumbar.",
      },
      {
        athleteName: "Atleta sin nombrar",
        injury: "Tendinopatía rotuliana",
        insight: "Aprendí que añadir isométrico antes del trabajo isotónico aceleró la respuesta clínica 2 semanas.",
        consentSigned: false,
        videoUrls: JSON.stringify([]),
        notes: "Pedir permiso antes de usar públicamente.",
      },
    ],
  });

  // Hooks ganadores demo
  await prisma.winningHook.createMany({
    data: [
      {
        text: "Si tu hombro duele en HSPU, esto no es culpa de tu técnica.",
        format: "belief_carousel",
        bodyZone: "hombro",
        reach: 4200,
        saves: 187,
        dmKeyword: 4,
        conversions: 0,
        notes: "El más alto en guardados. Reutilizable cambiando movimiento.",
      },
      {
        text: "Pablo hacía Murph con dolor. Esto es lo que pasó en 8 semanas.",
        format: "case_reel",
        bodyZone: "hombro",
        reach: 8100,
        saves: 92,
        dmKeyword: 18,
        conversions: 2,
        notes: "Top conversiones del trimestre. Patrón: nombre + benchmark + tiempo.",
      },
      {
        text: "Si llevas 3 meses con dolor, no es 'normal'. Esto sí.",
        format: "closing_reel",
        bodyZone: "hombro",
        reach: 7200,
        saves: 64,
        dmKeyword: 21,
        conversions: 3,
        notes: "Mejor cierre de semana hasta ahora. Patrón: tiempo + creencia + reframe.",
      },
    ],
  });

  console.log("   - 3 lead magnets · 3 casos clínicos · 3 hooks ganadores");

  // Ideas de contenido demo
  await prisma.contentIdea.createMany({
    data: [
      // ATRAER (top funnel)
      {
        title: "Los 3 movimientos de CrossFit que más lesionan el hombro",
        description: "Lista provocadora: HSPU mal hechos, kipping pull-ups sin estabilidad, snatch sin movilidad. Para reel de captación.",
        funnelStage: "attract",
        bodyZone: "hombro",
        suggestedFormat: "value_reel",
      },
      {
        title: "Por qué hacer Murph con dolor te puede dejar 3 meses fuera",
        description: "Ángulo de miedo + dato clínico. Buen hook para fechas próximas a Murph (Memorial Day).",
        funnelStage: "attract",
        bodyZone: "hombro",
        suggestedFormat: "belief_carousel",
      },
      {
        title: "El error de movilidad lumbar que el 80% comete en deadlift",
        description: "Top funnel. Apuntar a quien busca rendir más sin tener dolor todavía.",
        funnelStage: "attract",
        bodyZone: "lumbar",
        suggestedFormat: "value_reel",
      },

      // EDUCAR (mid funnel)
      {
        title: "Cómo entrenar con dolor de hombro sin empeorarlo",
        description: "Carrusel valor pesado. 5-7 reglas concretas: cargas, ROM, frecuencia. Material para guardar.",
        funnelStage: "educate",
        bodyZone: "hombro",
        suggestedFormat: "value_carousel",
      },
      {
        title: "Diferencia entre dolor protector y dolor de lesión",
        description: "Carrusel educativo profundo. Útil para audiencias mid funnel que ya saben que tienen dolor.",
        funnelStage: "educate",
        bodyZone: "mixta",
        suggestedFormat: "value_carousel",
      },
      {
        title: "5 ejercicios de activación para lumbar antes de pesado",
        description: "Aplicable. Para que guarden. Vincular al lead magnet DEADLIFT.",
        funnelStage: "educate",
        bodyZone: "lumbar",
        suggestedFormat: "exercises_carousel",
      },
      {
        title: "Por qué tu rodilla cruje (y cuándo deberías preocuparte)",
        description: "Mito común. Carrusel de 7-8 slides con desmonte clínico claro.",
        funnelStage: "educate",
        bodyZone: "rodilla",
        suggestedFormat: "belief_carousel",
      },

      // CONVERTIR (bottom funnel)
      {
        title: "Lo que cambia cuando un atleta entra al programa Recupera",
        description: "Día 1 vs día 30 vs día 90. Concreto y emocional. Para reel cierre de semana.",
        funnelStage: "convert",
        bodyZone: "mixta",
        suggestedFormat: "closing_reel",
      },
      {
        title: "Caso María: de no poder hacer HSPU a 10 reps sin dolor",
        description: "Caso éxito completo. Tiene permiso firmado. Reel de 60s con su progreso.",
        funnelStage: "convert",
        bodyZone: "hombro",
        suggestedFormat: "case_reel",
        used: true, // ya se usó en la semana anterior
      },
      {
        title: "Tres cosas que pasan si sigues entrenando con dolor crónico",
        description: "Reel urgente con CTA fuerte. Apuntar a quien lleva meses postponiendo.",
        funnelStage: "convert",
        bodyZone: "mixta",
        suggestedFormat: "closing_reel",
      },
    ],
  });

  console.log("   - 10 ideas de contenido");
  console.log("✅ Seed completado.");
  console.log(`   - ${MOVEMENTS.length} movimientos · ${PROFILES.length} perfiles clínicos`);
  console.log(`   - ${EXERCISE_LIBRARY.length} ejercicios en biblioteca · 2 programas demo`);
  console.log(`   - 2 pacientes`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
