// ============================================================================
// Contenido del onboarding del paciente: anamnesis (cuestionario por pasos) +
// texto del contrato. Editable aquí sin tocar lógica.
// ============================================================================

export type AnamnesisFieldType =
  | "text"
  | "textarea"
  | "number"
  | "select"
  | "radio"
  | "scale" // 0-10
  | "date";

export type AnamnesisField = {
  key: string;
  label: string;
  type: AnamnesisFieldType;
  required?: boolean;
  placeholder?: string;
  help?: string;
  options?: string[]; // para select/radio
};

export type AnamnesisStep = {
  id: string;
  title: string;
  description?: string;
  fields: AnamnesisField[];
};

// Cuestionario inicial. Pensado para fisio + deporte (CrossFit). Edítalo libremente.
export const ANAMNESIS_STEPS: AnamnesisStep[] = [
  {
    id: "personal",
    title: "Datos personales",
    description: "Para conocerte y ajustar tu programa.",
    fields: [
      { key: "birthDate", label: "Fecha de nacimiento", type: "date" },
      { key: "sex", label: "Sexo", type: "radio", options: ["Hombre", "Mujer", "Otro"] },
      { key: "weightKg", label: "Peso (kg)", type: "number", placeholder: "Ej: 72" },
      { key: "heightCm", label: "Altura (cm)", type: "number", placeholder: "Ej: 178" },
      { key: "occupation", label: "Profesión / ocupación", type: "text", placeholder: "Ej: Oficina, sedentario" },
    ],
  },
  {
    id: "sport",
    title: "Actividad deportiva",
    description: "Tu nivel y volumen de entrenamiento.",
    fields: [
      { key: "mainSport", label: "Deporte principal", type: "text", placeholder: "CrossFit" },
      { key: "yearsTraining", label: "Años entrenando", type: "number", placeholder: "Ej: 3" },
      {
        key: "weeklyFrequency",
        label: "Días de entreno por semana",
        type: "select",
        options: ["1-2", "3-4", "5-6", "7+"],
      },
      {
        key: "level",
        label: "Nivel",
        type: "radio",
        options: ["Principiante", "Intermedio", "Avanzado", "Competición"],
      },
      { key: "otherSports", label: "Otros deportes o actividades", type: "textarea", placeholder: "Opcional" },
    ],
  },
  {
    id: "complaint",
    title: "Motivo de consulta",
    description: "Cuéntanos qué te trae y desde cuándo.",
    fields: [
      {
        key: "mainComplaint",
        label: "¿Qué te trae? Describe tu lesión o molestia principal",
        type: "textarea",
        required: true,
      },
      { key: "bodyZone", label: "Zona del cuerpo afectada", type: "text", required: true, placeholder: "Ej: Hombro derecho" },
      { key: "onsetWhen", label: "¿Desde cuándo?", type: "text", placeholder: "Ej: Hace 2 meses" },
      { key: "howHappened", label: "¿Cómo ocurrió?", type: "textarea", placeholder: "Gesto, accidente, progresivo..." },
      { key: "medicalDiagnosis", label: "¿Tienes diagnóstico médico?", type: "radio", options: ["Sí", "No"] },
      { key: "medicalDiagnosisDetail", label: "¿Cuál? (si aplica)", type: "text" },
    ],
  },
  {
    id: "pain",
    title: "Dolor actual",
    fields: [
      {
        key: "painLevel",
        label: "Nivel de dolor actual",
        type: "scale",
        required: true,
        help: "0 = sin dolor, 10 = el peor imaginable",
      },
      { key: "painWhen", label: "¿Cuándo aparece el dolor?", type: "textarea", placeholder: "En reposo, al moverte, por la noche..." },
      { key: "painAggravators", label: "¿Qué lo empeora?", type: "textarea" },
      { key: "painRelievers", label: "¿Qué lo alivia?", type: "textarea" },
    ],
  },
  {
    id: "history",
    title: "Antecedentes médicos",
    description: "Información relevante para tu seguridad.",
    fields: [
      { key: "surgeries", label: "Cirugías previas (cuáles y cuándo)", type: "textarea", placeholder: "Ninguna" },
      { key: "conditions", label: "Enfermedades o condiciones relevantes", type: "textarea", placeholder: "Ninguna" },
      { key: "medication", label: "Medicación actual", type: "textarea", placeholder: "Ninguna" },
      { key: "allergies", label: "Alergias", type: "text", placeholder: "Ninguna" },
    ],
  },
  {
    id: "goals",
    title: "Objetivos",
    description: "Qué esperas conseguir.",
    fields: [
      { key: "goals", label: "¿Qué quieres conseguir con el programa?", type: "textarea", required: true },
      { key: "timeframe", label: "¿En qué plazo te gustaría?", type: "text", placeholder: "Ej: 3 meses" },
      { key: "extra", label: "¿Algo más que debamos saber?", type: "textarea", placeholder: "Opcional" },
    ],
  },
];

// Devuelve las claves obligatorias que falten en las respuestas dadas.
// `steps` por defecto son los del código, pero se pueden pasar los editables (BD).
export function missingRequiredAnamnesis(
  answers: Record<string, unknown>,
  steps: AnamnesisStep[] = ANAMNESIS_STEPS
): string[] {
  const missing: string[] = [];
  for (const step of steps) {
    for (const f of step.fields) {
      if (!f.required) continue;
      const v = answers[f.key];
      if (v === undefined || v === null || String(v).trim() === "") missing.push(f.key);
    }
  }
  return missing;
}

// ============================================================================
// Contrato — texto base editable. Al firmar se guarda un snapshot del texto que
// estuviera activo en ese momento (evidencia legal). Sube CONTRACT_VERSION si
// cambias el contenido de forma sustancial.
// ============================================================================

export const CONTRACT_VERSION = "v1";

export const CONTRACT_TEXT = `CONTRATO DE PRESTACIÓN DE SERVICIOS DE FISIOTERAPIA Y ENTRENAMIENTO ONLINE

1. OBJETO
El presente contrato regula la prestación de servicios de valoración, planificación y seguimiento de fisioterapia y entrenamiento en modalidad online por parte de FisioFit Team al cliente (en adelante, "el Paciente").

2. NATURALEZA DEL SERVICIO
El servicio se presta de forma remota mediante una plataforma digital. Las recomendaciones, programas y ejercicios facilitados se basan en la información aportada por el Paciente en la anamnesis y en el seguimiento. El servicio NO sustituye el diagnóstico ni el tratamiento médico presencial cuando este sea necesario.

3. RESPONSABILIDAD DEL PACIENTE
El Paciente declara que la información facilitada es veraz y se compromete a comunicar cualquier cambio en su estado de salud. El Paciente realizará los ejercicios bajo su propia responsabilidad, deteniéndose ante cualquier dolor agudo o síntoma de alarma y consultando con un profesional sanitario presencial cuando proceda.

4. DURACIÓN Y PAGO
La duración y el importe del programa son los indicados en el momento de la contratación. El pago da acceso al programa durante el periodo contratado.

5. PROTECCIÓN DE DATOS
Los datos personales y de salud facilitados se tratarán conforme a la normativa vigente (RGPD y LOPDGDD), con la única finalidad de prestar el servicio contratado, y no se cederán a terceros salvo obligación legal.

6. CONSENTIMIENTO INFORMADO
El Paciente declara haber sido informado sobre la naturaleza online del servicio, sus limitaciones y los riesgos inherentes a la actividad física, y consiente expresamente la prestación del servicio en estos términos.

7. FIRMA ELECTRÓNICA
La aceptación de este contrato mediante la introducción del DNI y la confirmación expresa equivale a la firma del mismo, quedando registrados la fecha, la hora y los datos técnicos de la conexión como evidencia.`;

// ============================================================================
// Estado del onboarding
// ============================================================================

export type OnboardingTasks = {
  anamnesis?: boolean;
  contract?: boolean;
  firstSession?: boolean;
};

// Parsea el campo onboardingTasks (Json?) a un objeto seguro.
export function parseOnboardingTasks(raw: unknown): OnboardingTasks {
  if (raw && typeof raw === "object") return raw as OnboardingTasks;
  return {};
}

// El gate de acceso exige anamnesis + contrato. La "primera sesión" la marca el fisio
// y NO bloquea el acceso a la app.
export function isOnboardingComplete(tasks: OnboardingTasks): boolean {
  return Boolean(tasks.anamnesis) && Boolean(tasks.contract);
}

// ¿Hay que enviar al paciente al onboarding?
// - onboardingTasks === null  → paciente legacy/demo (creado antes del flujo de
//   pago v57): NO se le obliga al onboarding.
// - objeto presente pero incompleto → SÍ.
export function needsOnboarding(rawTasks: unknown): boolean {
  if (rawTasks == null) return false;
  return !isOnboardingComplete(parseOnboardingTasks(rawTasks));
}
