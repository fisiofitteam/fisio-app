import Link from "next/link";

/**
 * Página que muestra el aviso cuando el magic link no es válido o caducó.
 * Recibe ?expired=1 cuando el token existía pero está pasado de fecha.
 *
 * El route handler /acceso/[token] redirige aquí en esos casos. Como esta
 * página NO toca cookies, puede ser un Server Component normal.
 */
export default function AccesoInvalido({
  searchParams,
}: {
  searchParams: { expired?: string };
}) {
  const expired = searchParams.expired === "1";
  return (
    <main
      className="min-h-screen flex items-center justify-center px-5 py-10"
      style={{ background: "#0A0A0A", color: "#FAFAFA" }}
    >
      <div className="max-w-sm w-full text-center">
        <div className="text-5xl mb-4">{expired ? "⌛" : "🔒"}</div>
        <h1 className="text-2xl font-bold mb-2" style={{ letterSpacing: "-0.03em" }}>
          {expired ? "Este enlace ha caducado" : "Enlace no válido"}
        </h1>
        <p className="text-sm mb-6" style={{ color: "#A3A3A3" }}>
          {expired
            ? "Pide a tu fisio que te envíe uno nuevo, o accede con tu email."
            : "Si crees que es un error, pide a tu fisio que te lo envíe de nuevo."}
        </p>
        <Link
          href="/paciente/login"
          className="inline-block text-sm font-semibold px-4 py-2.5 rounded-lg"
          style={{ background: "#FAFAFA", color: "#0A0A0A" }}
        >
          Entrar con mi email →
        </Link>
      </div>
    </main>
  );
}
