// Lectura de la config de landings desde BD (modelo LandingConfig), con caída a
// los valores por defecto de lib/landing-content.ts. Solo servidor (prisma).
import { prisma } from "@/lib/prisma";
import { normalizeRenewalCopy, type RenewalLandingCopy } from "@/lib/landing-content";

// Copy efectivo de la landing de renovación (BD o defaults).
export async function getRenewalLandingCopy(): Promise<RenewalLandingCopy> {
  const row = await prisma.landingConfig.findUnique({ where: { id: "renewal" } });
  if (!row) return normalizeRenewalCopy(null);
  try {
    return normalizeRenewalCopy(JSON.parse(row.content));
  } catch {
    return normalizeRenewalCopy(null);
  }
}
