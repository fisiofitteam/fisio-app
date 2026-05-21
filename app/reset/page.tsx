import { ResetForm } from "./ResetForm";
import { PublicShell } from "@/components/PublicShell";

export default function ResetPage({
  searchParams,
}: {
  searchParams: { token?: string; welcome?: string };
}) {
  const isWelcome = searchParams.welcome === "1";

  return (
    <PublicShell
      title={isWelcome ? "Bienvenido al equipo" : "Restablece tu contraseña"}
      subtitle={
        isWelcome
          ? "Crea tu contraseña para empezar."
          : "Elige una nueva contraseña para entrar."
      }
      heroTitle={
        isWelcome ? (
          <>
            El equipo
            <br />
            que cuida
            <br />
            del <span className="brand-gradient-text">atleta.</span>
          </>
        ) : undefined
      }
      heroSubtitle={
        isWelcome ? "Bienvenido. Solo te queda elegir tu contraseña." : "Recuperar acceso."
      }
    >
      <ResetForm token={searchParams.token} isWelcome={isWelcome} />
    </PublicShell>
  );
}
