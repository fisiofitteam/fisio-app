import { redirect } from "next/navigation";
import { FisioSidebar } from "@/components/FisioSidebar";
import { getActiveProfessional } from "@/lib/session";
import { getThemeFromCookie } from "@/lib/theme";

export default async function FisioLayout({ children }: { children: React.ReactNode }) {
  const user = await getActiveProfessional();
  if (!user) {
    redirect("/");
  }
  const theme = getThemeFromCookie();
  return (
    <div className={`fisio-shell min-h-screen ${theme === "dark" ? "dark" : ""}`}>
      <div className="max-w-[1600px] px-3 py-6">
        <div className="flex flex-col md:flex-row gap-3">
          <FisioSidebar user={user} />
          <div className="flex-1 min-w-0">{children}</div>
        </div>
      </div>
    </div>
  );
}
