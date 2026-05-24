import { RenewalLandingClient } from "@/components/RenewalLandingClient";

export default function RenewalLandingPage({ params }: { params: { token: string } }) {
  return <RenewalLandingClient token={params.token} />;
}
