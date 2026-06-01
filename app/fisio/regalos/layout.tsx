import { redirect } from "next/navigation";
import { getActiveProfessional } from "@/lib/session";
import { RegalosSubnav } from "@/components/RegalosSubnav";

export default async function RegalosLayout({ children }: { children: React.ReactNode }) {
  const user = await getActiveProfessional();
  if (!user) redirect("/login");
  if (user.role !== "setter" && !user.isManager) redirect("/fisio");

  return (
    <div>
      <header className="mb-4">
        <h1 className="text-xl font-semibold">🎁 Regalos</h1>
        <p className="text-xs text-neutral-500 mt-0.5">
          Parches de bienvenida y camisetas ADVANCE.
        </p>
      </header>
      <RegalosSubnav />
      {children}
    </div>
  );
}
