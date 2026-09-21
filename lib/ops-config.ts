import { prisma } from "@/lib/prisma";

/**
 * Config global del panel de capacidad operativa. Se guarda en un
 * singleton (`id="singleton"`). El helper garantiza que exista y aplica
 * clamps a los valores antes de guardarlos para que nunca se corrompan
 * los cálculos que usan estos umbrales.
 */

export type OpsConfigShape = {
  defaultMaxPatients: number;
  occupancyWarn: number;
  occupancyCrit: number;
  renewalRateWarn: number;
  renewalRateCrit: number;
  renewalHistoryMonths: number;
  expectedRenewDays: number;
  occupancyBasis: "active" | "assigned";
};

export const OPS_CONFIG_DEFAULTS: OpsConfigShape = {
  defaultMaxPatients: 35,
  occupancyWarn: 90,
  occupancyCrit: 100,
  renewalRateWarn: 70,
  renewalRateCrit: 40,
  renewalHistoryMonths: 6,
  expectedRenewDays: 30,
  occupancyBasis: "active",
};

function clampInt(v: unknown, min: number, max: number, fallback: number): number {
  const n = Math.round(Number(v));
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

/** Normaliza los valores de entrada aplicando clamps y coherencias
 *  cruzadas (occupancyCrit debe ser >= occupancyWarn; renewalRateWarn
 *  debe ser >= renewalRateCrit). */
export function normalizeOpsConfig(input: Partial<OpsConfigShape>): OpsConfigShape {
  const defaultMaxPatients = clampInt(input.defaultMaxPatients, 0, 1000, OPS_CONFIG_DEFAULTS.defaultMaxPatients);
  let occupancyWarn = clampInt(input.occupancyWarn, 0, 100, OPS_CONFIG_DEFAULTS.occupancyWarn);
  let occupancyCrit = clampInt(input.occupancyCrit, 0, 200, OPS_CONFIG_DEFAULTS.occupancyCrit);
  if (occupancyCrit < occupancyWarn) occupancyCrit = occupancyWarn;
  let renewalRateWarn = clampInt(input.renewalRateWarn, 0, 100, OPS_CONFIG_DEFAULTS.renewalRateWarn);
  let renewalRateCrit = clampInt(input.renewalRateCrit, 0, 100, OPS_CONFIG_DEFAULTS.renewalRateCrit);
  if (renewalRateWarn < renewalRateCrit) renewalRateWarn = renewalRateCrit;
  const renewalHistoryMonths = clampInt(input.renewalHistoryMonths, 1, 24, OPS_CONFIG_DEFAULTS.renewalHistoryMonths);
  const expectedRenewDays = clampInt(input.expectedRenewDays, 1, 180, OPS_CONFIG_DEFAULTS.expectedRenewDays);
  const occupancyBasis: "active" | "assigned" = input.occupancyBasis === "assigned" ? "assigned" : "active";
  return {
    defaultMaxPatients,
    occupancyWarn,
    occupancyCrit,
    renewalRateWarn,
    renewalRateCrit,
    renewalHistoryMonths,
    expectedRenewDays,
    occupancyBasis,
  };
}

/** Devuelve la config actual, creando el singleton con defaults si no
 *  existe. Idempotente. */
export async function getOpsConfig(): Promise<OpsConfigShape> {
  const row = await prisma.opsConfig.upsert({
    where: { id: "singleton" },
    create: { id: "singleton", ...OPS_CONFIG_DEFAULTS },
    update: {},
  });
  return {
    defaultMaxPatients: row.defaultMaxPatients,
    occupancyWarn: row.occupancyWarn,
    occupancyCrit: row.occupancyCrit,
    renewalRateWarn: row.renewalRateWarn,
    renewalRateCrit: row.renewalRateCrit,
    renewalHistoryMonths: row.renewalHistoryMonths,
    expectedRenewDays: row.expectedRenewDays,
    occupancyBasis: (row.occupancyBasis === "assigned" ? "assigned" : "active"),
  };
}

/** Guarda cambios normalizados en el singleton. Devuelve la config
 *  efectivamente persistida. */
export async function saveOpsConfig(patch: Partial<OpsConfigShape>): Promise<OpsConfigShape> {
  const current = await getOpsConfig();
  const merged = normalizeOpsConfig({ ...current, ...patch });
  await prisma.opsConfig.update({ where: { id: "singleton" }, data: merged });
  return merged;
}
