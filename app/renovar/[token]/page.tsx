import { RenewalLandingClient } from "@/components/RenewalLandingClient";
import { getRenewalLandingCopy } from "@/lib/landing-config";

export default async function RenewalLandingPage({ params }: { params: { token: string } }) {
  const copy = await getRenewalLandingCopy();
  return <RenewalLandingClient token={params.token} copy={copy} />;
}
