import Link from "next/link";

export const metadata = {
  title: "Política de Privacidad · FisioFit Team",
  description: "Política de privacidad y tratamiento de datos personales de FisioFit App y el servicio de fisioterapia online FisioFit Team.",
};

/**
 * Política de privacidad pública requerida por la App Store y RGPD.
 *
 * Ruta: /privacidad → URL pública: https://app.fisiofitteam.com/privacidad
 *
 * Esta página NO requiere login. Está incluida en PUBLIC_PATHS del middleware.
 *
 * Si actualizas el contenido, actualiza también la fecha de "Última
 * actualización" abajo para que los usuarios sepan cuándo cambió.
 */
export default function PrivacidadPage() {
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
          Política de Privacidad
        </h1>
        <p style={{ color: "#737373", marginTop: 0, marginBottom: 32, fontSize: 13 }}>
          Última actualización: 4 de junio de 2026
        </p>

        <Section title="1. Quién es el responsable del tratamiento">
          <p>
            El responsable del tratamiento de tus datos personales es{" "}
            <strong>Ales Faus Sánchez</strong>, con domicilio fiscal en España y
            actuando bajo la marca <strong>FisioFit Team</strong>.
          </p>
          <p>
            Para cualquier cuestión relativa a esta política o al ejercicio de tus
            derechos, puedes contactarnos en:
          </p>
          <ul>
            <li>
              Email:{" "}
              <a href="mailto:fisiofitteam@fisiofitteam.com">
                fisiofitteam@fisiofitteam.com
              </a>
            </li>
            <li>
              Web: <a href="https://fisiofitteam.com">fisiofitteam.com</a>
            </li>
          </ul>
        </Section>

        <Section title="2. Qué datos recogemos">
          <p>
            FisioFit Team es un servicio de fisioterapia online especializado en
            readaptación deportiva para atletas de CrossFit. Para prestarte el
            servicio, recogemos los siguientes datos:
          </p>
          <ul>
            <li>
              <strong>Datos identificativos y de contacto</strong>: nombre,
              apellidos, email, teléfono.
            </li>
            <li>
              <strong>Dirección postal</strong>: solo si vas a recibir material
              físico (camiseta, parches u otros envíos del programa).
            </li>
            <li>
              <strong>Datos clínicos relevantes</strong>: lesión o motivo de
              consulta, tratamientos previos, evolución, anamnesis y cuestionarios
              que rellenas durante el onboarding y las sesiones de seguimiento.
            </li>
            <li>
              <strong>Datos de actividad deportiva</strong>: peso movido,
              repeticiones, RPE (esfuerzo percibido), dolor, adherencia al
              programa, marcas personales (PRs) y otros registros que añadas tú.
            </li>
            <li>
              <strong>Fotos y vídeos opcionales</strong>: capturas que decidas
              subir voluntariamente a la comunidad o al feedback de tus
              entrenamientos.
            </li>
            <li>
              <strong>Datos de pago</strong>: gestionados íntegramente por{" "}
              <strong>PayPal</strong>. Nosotros nunca vemos ni almacenamos los
              datos completos de tu tarjeta — solo el resultado del cobro
              (importe, fecha, estado).
            </li>
            <li>
              <strong>Datos de uso de la app</strong>: cuándo entras, qué
              secciones visitas, sesiones completadas. Los usamos para mejorar el
              producto y dar seguimiento de tu adherencia.
            </li>
          </ul>
        </Section>

        <Section title="3. Para qué usamos tus datos">
          <ol>
            <li>
              <strong>Prestar el servicio</strong>: diseñar y entregar tu
              programa de readaptación personalizado.
            </li>
            <li>
              <strong>Comunicación contigo</strong>: emails de seguimiento,
              recordatorios, WhatsApp con tu fisio asignado.
            </li>
            <li>
              <strong>Facturación y obligaciones legales</strong>: emisión de
              facturas y cumplimiento fiscal.
            </li>
            <li>
              <strong>Mejora del producto</strong>: análisis interno agregado de
              cómo se usa la app, sin compartir tus datos individuales con
              terceros.
            </li>
          </ol>
          <p>
            <strong>NO usamos tus datos para publicidad ni los vendemos a
            terceros.</strong> No hay tracking publicitario en la app.
          </p>
        </Section>

        <Section title="4. Con quién compartimos tus datos">
          <p>
            Solo con los proveedores estrictamente necesarios para que la app
            funcione (procesadores de datos en términos del RGPD):
          </p>
          <ul>
            <li>
              <strong>Neon</strong> (PostgreSQL administrado, base de datos
              cifrada en servidores de la UE).
            </li>
            <li>
              <strong>Vercel</strong> (hosting del backend y la web, servidores
              en la UE).
            </li>
            <li>
              <strong>PayPal</strong> (procesamiento de pagos, certificado PCI
              DSS).
            </li>
            <li>
              <strong>Google Calendar</strong> (solo si agendas videoconsulta
              con el equipo comercial).
            </li>
            <li>
              <strong>Apple</strong> y <strong>Google</strong> (solo datos
              técnicos de la tienda de apps cuando descargas o actualizas
              FisioFit App).
            </li>
          </ul>
          <p>
            Todos los proveedores cumplen con el RGPD y han firmado los
            acuerdos de tratamiento correspondientes.
          </p>
        </Section>

        <Section title="5. Dónde se almacenan tus datos">
          <p>
            Todos tus datos personales se almacenan en servidores ubicados en la{" "}
            <strong>Unión Europea</strong> (Frankfurt para el hosting principal
            de la app y Países Bajos para la base de datos). Los datos están
            cifrados en tránsito (HTTPS) y en reposo.
          </p>
        </Section>

        <Section title="6. Cuánto tiempo guardamos tus datos">
          <p>
            Mientras seas cliente activo, conservamos tus datos para poder
            prestarte el servicio. Cuando finalice la relación contractual:
          </p>
          <ul>
            <li>
              Datos contables y facturas: <strong>6 años</strong> (obligación
              legal en España).
            </li>
            <li>
              Historia clínica: hasta <strong>5 años</strong> tras la última
              consulta (Ley de Autonomía del Paciente).
            </li>
            <li>
              El resto de datos se eliminan o anonimizan a tu solicitud, o
              automáticamente tras <strong>2 años</strong> de inactividad.
            </li>
          </ul>
        </Section>

        <Section title="7. Tus derechos">
          <p>
            En cualquier momento puedes ejercer los siguientes derechos sobre
            tus datos, escribiéndonos a{" "}
            <a href="mailto:fisiofitteam@fisiofitteam.com">
              fisiofitteam@fisiofitteam.com
            </a>
            :
          </p>
          <ul>
            <li>
              <strong>Acceso</strong>: pedir copia de los datos que tenemos
              sobre ti.
            </li>
            <li>
              <strong>Rectificación</strong>: corregir datos inexactos o
              incompletos.
            </li>
            <li>
              <strong>Supresión</strong>: eliminar tus datos cuando ya no sean
              necesarios.
            </li>
            <li>
              <strong>Limitación</strong>: pedirnos que dejemos de usar tus
              datos para ciertos fines.
            </li>
            <li>
              <strong>Portabilidad</strong>: recibir tus datos en un formato
              estructurado y poder llevártelos.
            </li>
            <li>
              <strong>Oposición</strong>: oponerte a determinados tratamientos
              de tus datos.
            </li>
            <li>
              <strong>Reclamación</strong>: presentar una queja ante la Agencia
              Española de Protección de Datos (
              <a
                href="https://www.aepd.es"
                target="_blank"
                rel="noopener noreferrer"
              >
                aepd.es
              </a>
              ) si consideras que no atendemos correctamente tus derechos.
            </li>
          </ul>
        </Section>

        <Section title="8. Cookies y tecnologías similares">
          <p>
            FisioFit App usa únicamente cookies <strong>técnicas estrictamente
            necesarias</strong> para mantener tu sesión iniciada y para que la
            app funcione. No usamos cookies de publicidad ni de tracking.
          </p>
        </Section>

        <Section title="9. Menores de edad">
          <p>
            FisioFit Team está dirigido a personas mayores de 18 años. Si eres
            menor de edad, debes contar con autorización expresa de tus padres o
            tutores legales para usar el servicio.
          </p>
        </Section>

        <Section title="10. Cambios en esta política">
          <p>
            Si modificamos esta política, actualizaremos la fecha de "Última
            actualización" en la parte superior y, si los cambios son
            sustanciales, te notificaremos por email antes de que entren en
            vigor.
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

function Section({ title, children }: { title: string; children: React.ReactNode }) {
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
