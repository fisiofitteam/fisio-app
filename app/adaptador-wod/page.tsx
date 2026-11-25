import type { Metadata, Viewport } from "next";
import { getAutotestConfig } from "@/lib/autotest-hombro/get-config";
import { PublicWodApp } from "@/components/public-wod/PublicWodApp";
export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Adapta tu WOD · Hombro · FisioFitCross",
  description: "Una propuesta para ajustar tu WOD a las molestias de hombro y a cómo te encuentras hoy. Gratis, con tu perfil e historial.",
  referrer: "no-referrer",
};
export const viewport: Viewport = { width: "device-width", initialScale: 1, maximumScale: 5, userScalable: true, themeColor: "#111111" };
export default async function Page() {
  const config = await getAutotestConfig();
  return <PublicWodApp videos={config.videoUrls} />;
}
