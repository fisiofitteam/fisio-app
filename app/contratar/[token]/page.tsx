import { ContractLandingClient } from "@/components/ContractLandingClient";
import { getContractLandingCopy } from "@/lib/landing-config";

export const metadata = {
  title: "Tu pago · FisioFit Team",
  description: "Consulta los detalles y confirma tu pago a FisioFit Team.",
};

export const dynamic = "force-dynamic";

export default async function ContratarPage({ params }: { params: { token: string } }) {
  const copy = await getContractLandingCopy();
  return <ContractLandingClient token={params.token} copy={copy} />;
}
