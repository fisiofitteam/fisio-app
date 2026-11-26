import { redirect } from "next/navigation";
import { getActiveProfessional } from "@/lib/session";
import { LegacyCeoRedirect } from "@/components/LegacyCeoRedirect";
export const dynamic = "force-dynamic";
export default async function LegacyCeoPage() {
  const user = await getActiveProfessional();
  if (!user || user.role !== "ceo") redirect("/fisio");
  return <LegacyCeoRedirect />;
}
