import { redirect } from "next/navigation";
import { getActiveProfessional } from "@/lib/session";
import { getWelcomeConfig } from "@/lib/welcome-config";
import { WelcomeMessageEditor } from "@/components/WelcomeMessageEditor";

export default async function WelcomeMessagesPage() {
  const user = await getActiveProfessional();
  if (!user) redirect("/login");
  if (user.role !== "ceo") redirect("/fisio/biblioteca");

  const config = await getWelcomeConfig();

  return <WelcomeMessageEditor initial={config} />;
}
