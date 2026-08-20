/**
 * Mensajes de WhatsApp que el fisio envía al paciente al generar el link
 * de reserva. Textos oficiales del equipo — cualquier cambio de copy va
 * aquí y se aplica en la ficha, el panel de llamadas y donde toque.
 *
 * Variables:
 *   - {NOMBRE}  → primer nombre del paciente
 *   - {LINK}    → URL absoluta de la landing pública
 */

export type PatientCallType = "optimization" | "renewal";

function replace(template: string, vars: { name: string; link: string }): string {
  return template
    .replaceAll("{NOMBRE}", vars.name)
    .replaceAll("{LINK}", vars.link);
}

const OPTIMIZATION_TEMPLATE = `¡Muy buenas {NOMBRE}!

Como ya llevamos unas semanitas de programa, es momento que de que tengamos una videollamada para charlar más tranquilamente, preguntarte algunos detalles sobre tus sensaciones y necesidades con nosotros y explicarte en qué punto estamos!

Para hacértelo más cómodo, si te parece te dejo por aquí enlace a mi agenda y coges el día y hora que mejor te venga de la semana que viene, ¿vale?

{LINK}

Si no encontrases hueco o tienes alguna duda me dices! 🙂`;

const RENEWAL_TEMPLATE = `¡Hola {NOMBRE}!

¿Cómo lo llevas? Ya queda muy poquito para el final de esta primera fase del programa y es momento de analizar juntos los resultados y avances que hemos logrado.

Para ello, tenemos que fijar la "Llamada de Graduación" una reunión de 30-40 minutos en la que hablaremos de cómo has progresado durante estas semanas, cuáles son tus próximos objetivos para seguir avanzando y cómo podemos lograrlos.

Te dejo aquí un link para que puedas reservar a la hora que mejor te venga:

{LINK}

Si tienes cualquier duda me comentas.`;

export function buildPatientCallMessage(
  type: PatientCallType,
  patientFirstName: string,
  link: string,
): string {
  const template = type === "renewal" ? RENEWAL_TEMPLATE : OPTIMIZATION_TEMPLATE;
  return replace(template, { name: patientFirstName || "", link });
}
