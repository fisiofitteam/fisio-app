import { Metadata } from "next";
import { SemaforoClient } from "../SemaforoClient";
import { WHATSAPP_NUMBER, LEGAL_REVISADO } from "@/lib/semaforo/config";
import { getSemaforoConfig } from "@/lib/semaforo/get-config";
import { SEMAFORO_TIPOS } from "@/lib/semaforo/tipos";

const META = SEMAFORO_TIPOS.lumbar;

export const metadata: Metadata = {
  title: META.pageTitle,
  description: META.pageDescription,
  openGraph: {
    title: META.pageTitle,
    description:
      "10 minutos. Un test para saber cómo está tu zona lumbar antes de tu próximo WOD.",
    type: "website",
  },
  robots: { index: true, follow: true },
};

export const dynamic = "force-dynamic";

export default async function SemaforoLumbarPage() {
  const cfg = await getSemaforoConfig("lumbar");
  return (
    <SemaforoClient
      whatsappNumber={WHATSAPP_NUMBER}
      videoUrls={cfg.videoUrls}
      legalRevisado={LEGAL_REVISADO}
      quizFunnelMode={cfg.quizFunnelEnabled}
      tipo="lumbar"
    />
  );
}
