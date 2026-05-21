import { ResetForm } from "./ResetForm";

export default function ResetPage({ searchParams }: { searchParams: { token?: string; welcome?: string } }) {
  const isWelcome = searchParams.welcome === "1";

  return (
    <main className="min-h-screen flex items-center justify-center px-4 py-8" style={{ background: "linear-gradient(135deg, #FEF3C7 0%, #FCD34D 100%)" }}>
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-neutral-900 rounded-2xl mb-3">
            <span className="text-2xl">{isWelcome ? "👋" : "🔑"}</span>
          </div>
          <h1 className="text-2xl font-bold text-neutral-900">
            {isWelcome ? "Bienvenido a FisioFit App" : "Restablece tu contraseña"}
          </h1>
          {isWelcome && <p className="text-sm text-neutral-700 mt-1">Establece tu contraseña para empezar</p>}
        </div>

        <div className="bg-white rounded-2xl shadow-lg p-6">
          <ResetForm token={searchParams.token} isWelcome={isWelcome} />
        </div>
      </div>
    </main>
  );
}
