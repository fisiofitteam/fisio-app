import { redirect } from "next/navigation";
import { getActiveProfessional } from "@/lib/session";
import { AdvanceSubnav } from "@/components/AdvanceSubnav";

export default async function AdvanceLayout({ children }: { children: React.ReactNode }) {
  const user = await getActiveProfessional();
  if (!user) redirect("/login");
  if (user.role !== "ceo" && user.role !== "head_success") redirect("/fisio");

  return (
    <div>
      <header className="mb-4">
        <h1 className="text-xl font-semibold">⚡ Advance</h1>
        <p className="text-xs text-neutral-500 mt-0.5">
          Todo lo de los atletas ADVANCE: tendencias diarias, programas rolling y reto del mes.
        </p>
      </header>
      <AdvanceSubnav />
      {children}
    </div>
  );
}
