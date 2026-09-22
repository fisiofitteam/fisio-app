import { Metadata } from "next";
import { SemaforoClient } from "./SemaforoClient";
import { WHATSAPP_NUMBER, VIDEO_URLS, LEGAL_REVISADO } from "@/lib/semaforo/config";

export const metadata: Metadata = {
  title: "El Semáforo del Hombro · FisioFitCross",
  description:
    "Descubre qué movimientos del WOD puedes seguir haciendo, cuáles adaptar y cuáles parar. Sin quitar ejercicios a ciegas.",
  openGraph: {
    title: "El Semáforo del Hombro · FisioFitCross",
    description:
      "10 minutos. Un test para saber cómo está tu hombro antes de tu próximo WOD.",
    type: "website",
  },
  robots: { index: true, follow: true },
};

export const dynamic = "force-dynamic";

/**
 * Landing pública del lead magnet "El Semáforo del Hombro". Sin login.
 * El middleware ya excluye /semaforo. Es un client component grande
 * porque el test es 100 % interactivo.
 */
export default function SemaforoPage() {
  return (
    <SemaforoClient
      whatsappNumber={WHATSAPP_NUMBER}
      videoUrls={VIDEO_URLS}
      legalRevisado={LEGAL_REVISADO}
    />
  );
}
