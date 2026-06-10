import Link from "next/link";

export const metadata = {
  title: "Eliminar tu cuenta · FisioFit Team",
  description:
    "Cómo solicitar la eliminación de tu cuenta y tus datos personales en FisioFit App.",
};

/**
 * Página pública con instrucciones para que un usuario solicite el borrado
 * de su cuenta de FisioFit App.
 *
 * Requerida por Google Play (política de eliminación de cuentas en la app)
 * y por el RGPD (derecho de supresión).
 *
 * URL pública: https://app.fisiofitteam.com/eliminar-cuenta
 *
 * Esta página no requiere login (está en PUBLIC_PATHS del middleware) para
 * que un usuario pueda llegar incluso sin poder iniciar sesión.
 */
export default function EliminarCuentaPage() {
  return (
    <main
      style={{
        background: "#FAFAFA",
        color: "#171717",
        minHeight: "100vh",
        padding: "48px 24px 96px",
      }}
    >
      <article
        style={{
          maxWidth: 720,
          margin: "0 auto",
          fontFamily:
            "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
          lineHeight: 1.6,
          fontSize: 15,
        }}
      >
        <Link
          href="/"
          style={{ fontSize: 12, color: "#737373", textDecoration: "none" }}
        >
          ← Volver
        </Link>

        <h1
          style={{
            fontSize: 32,
            fontWeight: 700,
            letterSpacing: "-0.025em",
            marginTop: 24,
            marginBottom: 8,
          }}
        >
          Eliminar tu cuenta
        </h1>
        <p
          style={{ color: "#737373", marginTop: 0, marginBottom: 32, fontSize: 13 }}
        >
          Aplicación: FisioFit App · Responsable: FisioFit Team
        </p>

        <Section title="Cómo solicitar la eliminación">
          <p>
            FisioFit App es la aplicación de pacientes del servicio FisioFit Team.
            Las cuentas no se crean ni se eliminan desde la propia app — el
            equipo clínico gestiona ese proceso por seguridad y por trazabilidad
            de tu historial clínico.
          </p>

          <p>Para solicitar la eliminación de tu cuenta y tus datos asociados:</p>

          <ol>
            <li>
              Envía un email a{" "}
              <a href="mailto:fisiofitteam@fisiofitteam.com">
                fisiofitteam@fisiofitteam.com
              </a>{" "}
              desde la misma dirección de correo con la que accedes a la app.
            </li>
            <li>
              En el asunto pon: <strong>"Solicitud de eliminación de cuenta"</strong>.
            </li>
            <li>
              En el cuerpo del mensaje confirma tu nombre completo y, opcionalmente,
              el motivo por el que dejas el servicio. Esto nos ayuda a mejorar pero
              no es obligatorio.
            </li>
          </ol>

          <p>
            Recibirás una confirmación por email en un plazo de <strong>72 horas</strong>{" "}
            laborables. Una vez confirmada tu identidad, el equipo procesará la
            eliminación en un máximo de <strong>30 días naturales</strong>.
          </p>
        </Section>

        <Section title="Qué datos se eliminan">
          <p>Al procesar tu solicitud, se eliminan de forma permanente:</p>
          <ul>
            <li>Tu cuenta de acceso a la app (email y dispositivos vinculados).</li>
            <li>
              Tus métricas, registros de WODs, PRs, daily logs, fotos que hayas
              subido y tu actividad en la comunidad (posts, comentarios, reacciones).
            </li>
            <li>
              Tu progreso en lecciones de comunidad y resultados de retos
              mensuales.
            </li>
            <li>Las notificaciones que la app te haya enviado.</li>
          </ul>
        </Section>

        <Section title="Qué datos se conservan (obligación legal)">
          <p>
            Aunque elimines tu cuenta, algunos datos se mantienen por
            obligaciones legales o por la naturaleza del servicio sanitario:
          </p>
          <ul>
            <li>
              <strong>Facturas y datos contables</strong>: 6 años (Ley General
              Tributaria de España). Tu cuenta queda desvinculada pero las
              facturas emitidas se conservan.
            </li>
            <li>
              <strong>Historia clínica</strong>: hasta <strong>5 años</strong> tras
              la última consulta (Ley 41/2002 de Autonomía del Paciente). Se
              guarda anonimizada en la medida de lo posible.
            </li>
            <li>
              <strong>Registros de pago</strong>: Stripe conserva los datos
              estrictamente necesarios para cumplir con su normativa anti-fraude
              y de prevención de blanqueo (consulta su política).
            </li>
          </ul>
        </Section>

        <Section title="Más información">
          <p>
            Consulta nuestra{" "}
            <Link href="/privacidad" style={{ color: "#0A0A0A", textDecoration: "underline" }}>
              política de privacidad
            </Link>{" "}
            para conocer todos los detalles sobre qué datos recogemos, para qué
            los usamos y tus derechos.
          </p>

          <p>
            Si tienes dudas sobre el proceso, escríbenos a{" "}
            <a href="mailto:fisiofitteam@fisiofitteam.com">
              fisiofitteam@fisiofitteam.com
            </a>{" "}
            antes de iniciar la solicitud.
          </p>
        </Section>

        <hr
          style={{
            border: 0,
            borderTop: "1px solid #E5E5E5",
            margin: "48px 0 24px",
          }}
        />
        <p style={{ color: "#737373", fontSize: 12, textAlign: "center" }}>
          © {new Date().getFullYear()} FisioFit Team · Ales Faus Sánchez
        </p>
      </article>
    </main>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section style={{ marginBottom: 32 }}>
      <h2
        style={{
          fontSize: 18,
          fontWeight: 600,
          letterSpacing: "-0.015em",
          marginTop: 0,
          marginBottom: 12,
        }}
      >
        {title}
      </h2>
      <div style={{ color: "#404040" }}>{children}</div>
    </section>
  );
}
