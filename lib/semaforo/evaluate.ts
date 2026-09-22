/**
 * Función evaluate() del Semáforo del Hombro. Portada 1:1 del prototipo
 * semaforo-hombro.html. Cliente y servidor la comparten: el cliente
 * la usa para pintar el resultado en tiempo real, el servidor la usa
 * para persistir el color/movimientos en /api/semaforo cuando cierra
 * el registro — así jamás confiamos en el color enviado por el navegador.
 *
 * Contrato: recibe el objeto `respuestas` tal cual lo tiene el cliente,
 * con la misma forma que produce el runtime del test. Salidas:
 *   - color: "verde" | "ambar" | "rojo"
 *   - flags: banderas rojas marcadas en la pregunta "seguridad"
 *   - why:   máx 3 motivos (para pintar la sección "Por qué te ha
 *            salido este color")
 *   - mov:   mapa de familia → valor (para pintar el mapa de movimientos)
 */

import { FAMILIES, TESTS, type FamilyValue } from "@/lib/semaforo/questions";

export type RespuestasSemaforo = {
  seguridad?: string[];
  tiempo?: { v: string; score: number };
  probado?: string[];
  recurrencia?: { v: string; score: number };
  "dia-siguiente"?: { v: string; score: number };
  noche?: { v: string; score: number };
  movimientos?: Partial<Record<string, FamilyValue>>;
  "t-pared"?: { v: string | number; score: number };
  "t-colgado"?: { v: string | number; score: number };
  "t-rotacion"?: { v: string | number; score: number };
  "t-espalda"?: { v: string | number; score: number };
  nombre?: string;
} & Record<string, unknown>;

export type EvaluationSeverity = "neg" | "mid" | "pos";

export type EvaluationReason = {
  sev: number; // orden de importancia (mayor = más grave)
  k: EvaluationSeverity;
  t: string;
};

export type EvaluationResult = {
  color: "verde" | "ambar" | "rojo";
  flags: string[];
  why: EvaluationReason[];
  mov: Partial<Record<string, FamilyValue>>;
};

function sc(answers: RespuestasSemaforo, id: string): number {
  const raw = (answers as Record<string, unknown>)[id];
  if (raw && typeof raw === "object" && "score" in (raw as any)) {
    const s = (raw as { score: unknown }).score;
    return typeof s === "number" ? s : 0;
  }
  return 0;
}

function listaEs(a: string[]): string {
  if (a.length === 1) return a[0];
  return a.slice(0, -1).join(", ") + " y " + a[a.length - 1];
}

export function evaluate(answers: RespuestasSemaforo): EvaluationResult {
  const flags = (answers.seguridad ?? []).filter((v) => v !== "ninguna");
  const probado = answers.probado ?? [];
  const tiempo = sc(answers, "tiempo");
  const recur = sc(answers, "recurrencia");
  const dia = sc(answers, "dia-siguiente");
  const noche = sc(answers, "noche");

  const testScores = TESTS.map((t) => {
    const raw = (answers as Record<string, unknown>)[t.id] as
      | { v: string | number; score: number }
      | undefined;
    return {
      ...t,
      s: raw?.score ?? 0,
      skip: raw?.v === "skip",
    };
  });
  const t2 = testScores.filter((t) => t.s === 2);
  const t1 = testScores.filter((t) => t.s === 1 && !t.skip);

  const mov = answers.movimientos ?? {};
  const famRed = FAMILIES.filter((f) => mov[f.id] === "duele");

  // Reglas de color — copiadas literalmente del prototipo.
  const rojo =
    flags.length > 0 ||
    dia === 2 ||
    noche === 2 ||
    t2.length >= 2 ||
    (recur === 2 && tiempo === 2) ||
    (t2.length >= 1 && famRed.length >= 2);

  const verde =
    !rojo &&
    dia === 0 &&
    noche <= 1 &&
    t2.length === 0 &&
    t1.length <= 1 &&
    famRed.length === 0 &&
    recur < 2;

  const color: "verde" | "ambar" | "rojo" = rojo ? "rojo" : verde ? "verde" : "ambar";

  const why: EvaluationReason[] = [];

  if (dia === 2)
    why.push({
      sev: 3,
      k: "neg",
      t: "Después de entrenar, tu hombro tarda más de 24–48 h en volver a como estaba. Es la señal más clara de que la carga actual le supera.",
    });
  if (dia === 1)
    why.push({
      sev: 1,
      k: "mid",
      t: "Tras entrenar lo notas algo peor, pero en 24 h se recupera. Está cerca de su límite, no por encima.",
    });
  if (dia === 0)
    why.push({
      sev: -1,
      k: "pos",
      t: "Tu hombro se recupera bien de un entreno a otro. Eso significa que tolera la carga que le estás dando.",
    });

  if (noche === 2)
    why.push({
      sev: 3,
      k: "neg",
      t: "El dolor te despierta por la noche: el hombro está irritado incluso sin carga.",
    });
  if (noche === 1)
    why.push({
      sev: 1,
      k: "mid",
      t: "Te molesta al dormir encima. Hay algo de irritación de base que conviene no alimentar.",
    });

  if (recur === 2) {
    const pas = probado.some((p) => ["pasivo", "descanso", "farmaco"].includes(p));
    why.push({
      sev: 2.5,
      k: "neg",
      t: pas
        ? "Has descansado o tratado la zona y el dolor ha vuelto al volver a cargar. Calmar el hombro no es lo mismo que prepararlo para el box."
        : "El dolor ha vuelto o nunca se ha ido del todo. Eso indica que al hombro le falta tolerancia a la carga, no solo reposo.",
    });
  }

  if (tiempo === 2)
    why.push({
      sev: 2,
      k: "neg",
      t: "Llevas más de 3 meses así. A estas alturas el problema ya no es solo el tejido, también cómo has ido adaptando el entreno.",
    });

  if (t2.length) {
    why.push({
      sev: t2.length >= 2 ? 3 : 2,
      k: "neg",
      t: `Has tenido dolor claro en ${t2.length === 1 ? "la prueba de" : "las pruebas de"} ${listaEs(t2.map((t) => t.name))}.`,
    });
  }
  if (t1.length)
    why.push({
      sev: 1,
      k: "mid",
      t: `Hay molestia o diferencia entre lados en ${listaEs(t1.map((t) => t.name))}.`,
    });
  if (!t2.length && !t1.length)
    why.push({
      sev: -1,
      k: "pos",
      t: "Has pasado las pruebas sin dolor ni diferencias entre lados.",
    });

  if (famRed.length)
    why.push({
      sev: 2,
      k: "neg",
      t: `Te duelen o ya has quitado: ${listaEs(famRed.map((f) => f.name.toLowerCase()))}.`,
    });

  // En verde queremos ver primero lo positivo; en el resto, priorizar
  // lo grave. (Mismo criterio del prototipo).
  why.sort((a, b) => (color === "verde" ? a.sev - b.sev : b.sev - a.sev));

  return { color, flags, why: why.slice(0, 3), mov };
}

/** Mapea el color en minúsculas (interno) al enum persistido en BD. */
export function colorToStored(color: "verde" | "ambar" | "rojo"): "VERDE" | "AMBAR" | "ROJO" {
  return color.toUpperCase() as "VERDE" | "AMBAR" | "ROJO";
}
