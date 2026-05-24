// Lectura del mensaje de bienvenida desde BD (WelcomeMessageConfig), con caída a
// los valores por defecto de lib/welcome-content.ts. Solo servidor (prisma).
import { prisma } from "@/lib/prisma";
import { normalizeWelcomeConfig, type WelcomeConfig } from "@/lib/welcome-content";

export async function getWelcomeConfig(): Promise<WelcomeConfig> {
  const row = await prisma.welcomeMessageConfig.findUnique({ where: { id: "singleton" } });
  if (!row) return normalizeWelcomeConfig(null);
  try {
    return normalizeWelcomeConfig(JSON.parse(row.content));
  } catch {
    return normalizeWelcomeConfig(null);
  }
}
