import { ContractLandingClient } from "@/components/ContractLandingClient";

export const metadata = {
  title: "Contratar programa · FisioFit Team",
  description: "Confirma la contratación de tu programa con FisioFit Team.",
};

export const dynamic = "force-dynamic";

export default function ContratarPage({ params }: { params: { token: string } }) {
  return <ContractLandingClient token={params.token} />;
}
