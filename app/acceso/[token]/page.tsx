import Link from "next/link";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { prisma } from "@/lib/prisma";
import { createSessionForPatient, setSessionCookie } from "@/lib/auth";

// /acceso/[token] — Magic link 1-clic.
// El paciente pulsa el link de WhatsApp → server-side validamos el token
// del paciente, creamos sesión y redirigimos a /paciente/[id]. Si el token
// no existe o caducó, mostramos una pantalla con un link al login normal.
export default async function AccesoPage({ params }: { params: { token: string } }) {
  const token = params.token;
  if (!token || token.length < 16) {
    return <InvalidLink />;
  }

  const patient = await prisma.patient.findUnique({
    where: { accessToken: token },
    select: { id: true, accessTokenExpiresAt: true },
  });

  if (!patient || !patient.accessTokenExpiresAt) {
    return <InvalidLink />;
  }
  if (patient.accessTokenExpiresAt.getTime() < Date.now()) {
    return <InvalidLink expired />;
  }

  // Token válido → creamos sesión de paciente y redirigimos al home.
  const h = headers();
  const ua = h.get("user-agent") || undefined;
  const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() || undefined;
  const sessionToken = await createSessionForPatient(patient.id, { userAgent: ua, ipAddress: ip });
  setSessionCookie(sessionToken);
  redirect(`/paciente/${patient.id}`);
}

function InvalidLink({ expired = false }: { expired?: boolean }) {
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
