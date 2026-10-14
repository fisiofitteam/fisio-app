import type { Metadata } from "next";
import { AutotestHombroClient } from "@/components/autotest-hombro/AutotestHombroClient";
import { getAutotestConfig } from "@/lib/autotest-hombro/get-config";

export const metadata: Metadata = {
  title: "Autotest Funcional del Hombro para CrossFit · FisioFitCross",
  description:
    "Descubre tus 6 capacidades de hombro en 7 minutos, sin material. Al final te decimos a qué tipo de atleta perteneces y qué toca mejorar primero.",
  openGraph: {
    title: "Autotest Funcional del Hombro para CrossFit · FisioFitCross",
    description:
      "7 minutos. Un test para saber qué le falta a tu hombro antes de tu próximo WOD.",
    type: "website",
  },
  robots: { index: true, follow: true },
};

export const dynamic = "force-dynamic";

export default async function AutotestHombroPage() {
  const cfg = await getAutotestConfig();
  return <AutotestHombroClient videoUrls={cfg.videoUrls} />;
}
