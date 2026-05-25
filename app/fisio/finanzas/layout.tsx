import { redirect } from "next/navigation";
import { getActiveProfessional } from "@/lib/session";
import { FinanzasNav } from "@/components/FinanzasNav";

export default async function FinanzasLayout({ children }: { children: React.ReactNode }) {
  const user = await getActiveProfessional();
  if (!user || user.role !== "ceo") redirect("/fisio");

  return (
    <div>
      <FinanzasNav />
      {children}
    </div>
  );
}
