import { RenewalThankYouClient } from "@/components/RenewalThankYouClient";

export default function RenewalThankYouPage({
  searchParams,
}: {
  searchParams: { token?: string };
}) {
  return <RenewalThankYouClient token={searchParams.token ?? ""} />;
}
