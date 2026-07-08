// Lectura de la config de landings desde BD (modelo LandingConfig), con caída a
// los valores por defecto de lib/landing-content.ts. Solo servidor (prisma).
import { prisma } from "@/lib/prisma";
import {
  normalizeRenewalCopy,
  normalizeContractCopy,
  normalizeAgendaCopy,
  normalizeAgendaGraciasCopy,
  normalizePreventionCopy,
  type RenewalLandingCopy,
  type ContractLandingCopy,
  type AgendaLandingCopy,
  type AgendaGraciasCopy,
  type PreventionLandingCopy,
} from "@/lib/landing-content";

async function readContent(id: string): Promise<unknown> {
  const row = await prisma.landingConfig.findUnique({ where: { id } });
  if (!row) return null;
  try {
    return JSON.parse(row.content);
  } catch {
    return null;
  }
}

// Copy efectivo de cada landing (BD o defaults).
export async function getRenewalLandingCopy(): Promise<RenewalLandingCopy> {
  return normalizeRenewalCopy(await readContent("renewal"));
}
export async function getContractLandingCopy(): Promise<ContractLandingCopy> {
  return normalizeContractCopy(await readContent("contract"));
}
export async function getAgendaLandingCopy(): Promise<AgendaLandingCopy> {
  return normalizeAgendaCopy(await readContent("agenda"));
}
export async function getAgendaGraciasCopy(): Promise<AgendaGraciasCopy> {
  return normalizeAgendaGraciasCopy(await readContent("agenda_gracias"));
}
export async function getPreventionLandingCopy(): Promise<PreventionLandingCopy> {
  return normalizePreventionCopy(await readContent("prevention"));
}
