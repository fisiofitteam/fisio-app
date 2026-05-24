import { ContractLandingClient } from "@/components/ContractLandingClient";
import { getContractLandingCopy } from "@/lib/landing-config";

export const metadata = {
  title: "Contratar programa · FisioFit Team",
  description: "Confirma la contratación de tu programa con FisioFit Team.",
};

export const dynamic = "force-dynamic";

export default async function ContratarPage({ params }: { params: { token: string } }) {
  const copy = await getContractLandingCopy();
  return <ContractLandingClient token={params.token} copy={copy} />;
}
