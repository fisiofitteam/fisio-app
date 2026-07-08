/**
 * Plantillas de email del ciclo de vida de FisioFit Prevention.
 *
 * Cinco eventos:
 *   1. welcome        — al confirmarse la suscripción / arranque diferido.
 *   2. trialEndingSoon — 24-48h antes de que termine la prueba gratis.
 *   3. renewalSoon    — 7 días antes de la próxima renovación automática.
 *   4. paymentFailed  — Stripe reporta invoice.payment_failed.
 *   5. canceled       — al terminar el periodo si el usuario canceló.
 *
 * Todas devuelven { subject, html, text } listo para pasar a sendEmail().
 * El look es sobrio (Prevention hereda estilo FisioFit) con acento emerald.
 */
import { PREVENTION_PLAN_CONFIG, type PreventionPlan } from "@/lib/stripe";

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL || "https://app.fisiofitteam.com";
// Colores oficiales de FisioFit — coinciden con .brand-gradient del CSS
// global (amarillo → naranja). Los emails son transaccionales de la marca
// FisioFit, así que usan la paleta de la marca aunque la landing pública
// pueda tener otro color primary editable.
const BRAND_PRIMARY = "#FCD34D";       // amarillo
const BRAND_PRIMARY_DARK = "#F59E0B";  // naranja
const BRAND_TEXT_ON_DARK = "#1F2937";  // texto oscuro para contraste sobre gradient claro
const GRADIENT = `linear-gradient(135deg,${BRAND_PRIMARY} 0%,${BRAND_PRIMARY_DARK} 100%)`;

type Email = { subject: string; html: string; text: string };

function shell(inner: string): string {
  return `<!doctype html><html lang="es"><body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;background:#F5F5F5;margin:0;padding:24px;color:#111827">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;margin:0 auto;background:#FFFFFF;border-radius:16px;overflow:hidden;box-shadow:0 4px 12px rgba(0,0,0,0.06)">
    <tr>
      <td style="padding:20px 28px;background:${GRADIENT}">
        <div style="font-weight:700;font-size:16px;letter-spacing:-0.02em;color:${BRAND_TEXT_ON_DARK}">🛡 FisioFit Prevention</div>
      </td>
    </tr>
    <tr>
      <td style="padding:28px">
        ${inner}
      </td>
    </tr>
    <tr>
      <td style="padding:16px 28px;background:#FAFAFA;color:#9CA3AF;font-size:12px;text-align:center">
        FisioFit Team · fisiofitteam.com<br>
        <a href="${BASE_URL}/privacidad" style="color:#9CA3AF;text-decoration:none">Privacidad</a> · <a href="${BASE_URL}/terminos" style="color:#9CA3AF;text-decoration:none">Términos</a>
      </td>
    </tr>
  </table>
</body></html>`;
}

function cta(url: string, label: string): string {
  return `<div style="text-align:center;margin:20px 0"><a href="${url}" style="display:inline-block;background:${GRADIENT};color:${BRAND_TEXT_ON_DARK};text-decoration:none;font-weight:700;font-size:14px;padding:12px 24px;border-radius:12px;box-shadow:0 4px 12px rgba(245,158,11,0.35)">${label} →</a></div>`;
}

function priceLabel(plan: PreventionPlan): string {
  const cfg = PREVENTION_PLAN_CONFIG[plan];
  return `${cfg.amountCents / 100}€ cada ${cfg.months} meses`;
}

function fmtDate(iso: string | Date): string {
  const d = typeof iso === "string" ? new Date(iso) : iso;
  return d.toLocaleDateString("es-ES", { day: "numeric", month: "long", year: "numeric" });
}

/** 1. Bienvenida — al arrancar la suscripción o el trial.
 *
 * `accessPath` (opcional) es el magic link 1-clic del paciente
 * (`/acceso/<token>`). Si viene, el CTA lleva al link directo sin pedir
 * código. Es lo recomendado para no depender del código secundario.
 *
 * `plan` acepta cualquier string por si el alta manual usa "indefinite"
 * o algo custom — en ese caso mostramos "Suscripción manual" en lugar
 * del label del plan comercial.
 */
export function welcomeEmail(input: {
  firstName: string;
  plan: PreventionPlan | string;
  patientId: string;
  trialEndsAt?: string | null;
  scheduledStartAt?: string | null;
  accessPath?: string | null;
}): Email {
  const first = input.firstName || "hola";
  const appUrl = input.accessPath
    ? `${BASE_URL}${input.accessPath}`
    : `${BASE_URL}/paciente/${input.patientId}`;
  const scheduled = input.scheduledStartAt
    ? `<p>Como tenías otro programa activo, tu Prevention arrancará el <strong>${fmtDate(input.scheduledStartAt)}</strong>, justo al terminar el anterior. Sin cortes, sin esperas.</p>`
    : input.trialEndsAt
      ? `<p>Tienes <strong>4 días gratis</strong> para probarlo todo. Si te encaja, no tienes que hacer nada — el primer cobro será el <strong>${fmtDate(input.trialEndsAt)}</strong>. Si no, cancela desde tu panel y no hay ningún cargo.</p>`
      : `<p>Ya tienes acceso completo. Entra cuando quieras y monta la rutina.</p>`;
  const planCfg = (PREVENTION_PLAN_CONFIG as any)[input.plan];
  const planLine = planCfg
    ? `<p style="font-size:14px;color:#374151"><strong>Plan:</strong> ${planCfg.label} · ${priceLabel(input.plan as PreventionPlan)}</p>`
    : `<p style="font-size:14px;color:#374151"><strong>Plan:</strong> Suscripción Prevention (cortesía)</p>`;
  const inner = `
    <h1 style="font-size:24px;font-weight:700;letter-spacing:-0.02em;margin:0 0 12px 0">¡Bienvenida a Prevention, ${first}!</h1>
    <p style="font-size:15px;line-height:1.6;color:#374151">Acabas de dar un pasito enorme por tu cuerpo. Te preparamos <strong>15 minutos al día</strong> de movilidad, activación y técnica — todo pensado para que te mantengas fuerte y prevenir lo que aún no ha pasado.</p>
    ${scheduled}
    ${planLine}
    ${cta(appUrl, "Entrar a mi app")}
    <p style="font-size:12px;color:#9CA3AF;margin-top:20px">Cualquier duda, respóndenos a este email. Estamos aquí.</p>
  `;
  const planTxt = planCfg ? `Tu plan ${planCfg.label} está activo (${priceLabel(input.plan as PreventionPlan)}).` : `Tu suscripción Prevention está activa.`;
  return {
    subject: "🛡 ¡Bienvenida a FisioFit Prevention!",
    html: shell(inner),
    text: `¡Bienvenida a FisioFit Prevention, ${first}!\n\n${planTxt}\nEntra a tu app: ${appUrl}`,
  };
}

/** 6. Reenvío del link de acceso.
 *
 * Email corto para cuando el paciente dice "no me llega el código" o cambia
 * de dispositivo. `accessPath` es el magic link 1-clic (`/acceso/<token>`).
 */
export function accessLinkEmail(input: {
  firstName: string;
  accessPath: string;
}): Email {
  const first = input.firstName || "hola";
  const appUrl = `${BASE_URL}${input.accessPath}`;
  const inner = `
    <h1 style="font-size:22px;font-weight:700;letter-spacing:-0.02em;margin:0 0 12px 0">Tu acceso a Prevention</h1>
    <p style="font-size:15px;line-height:1.6;color:#374151">Hola ${first}, aquí tienes el enlace directo a tu app. Un clic y estás dentro — sin códigos ni contraseñas.</p>
    ${cta(appUrl, "Entrar a mi app")}
    <p style="font-size:12px;color:#9CA3AF;margin-top:20px">El enlace es privado. No lo compartas. Guarda este email a mano.</p>
  `;
  return {
    subject: "🔓 Tu acceso a FisioFit Prevention",
    html: shell(inner),
    text: `Hola ${first}, tu acceso a FisioFit Prevention: ${appUrl}`,
  };
}

/** 2. La prueba gratis termina en 1 día. */
export function trialEndingSoonEmail(input: {
  firstName: string;
  plan: PreventionPlan;
  trialEndsAt: string;
  patientId: string;
}): Email {
  const first = input.firstName || "hola";
  const appUrl = `${BASE_URL}/paciente/${input.patientId}/ajustes`;
  const inner = `
    <h1 style="font-size:22px;font-weight:700;letter-spacing:-0.02em;margin:0 0 12px 0">Tu prueba termina mañana</h1>
    <p style="font-size:15px;line-height:1.6;color:#374151">Hola ${first}, mañana (<strong>${fmtDate(input.trialEndsAt)}</strong>) se hace el primer cobro de tu plan <strong>${PREVENTION_PLAN_CONFIG[input.plan].label}</strong> — ${priceLabel(input.plan)}.</p>
    <p style="font-size:14px;line-height:1.6;color:#374151">Si Prevention te está sirviendo, no tienes que hacer nada. Si no, puedes cancelar desde tu panel y no cobraremos.</p>
    ${cta(appUrl, "Ver mi suscripción")}
  `;
  return {
    subject: `Recordatorio · tu prueba de Prevention termina mañana`,
    html: shell(inner),
    text: `Tu prueba de Prevention termina mañana (${fmtDate(input.trialEndsAt)}). Panel: ${appUrl}`,
  };
}

/** 3. La renovación automática es en 7 días. */
export function renewalSoonEmail(input: {
  firstName: string;
  plan: PreventionPlan;
  renewalDate: string;
  patientId: string;
}): Email {
  const first = input.firstName || "hola";
  const appUrl = `${BASE_URL}/paciente/${input.patientId}/ajustes`;
  const inner = `
    <h1 style="font-size:22px;font-weight:700;letter-spacing:-0.02em;margin:0 0 12px 0">Tu Prevention se renueva en una semana</h1>
    <p style="font-size:15px;line-height:1.6;color:#374151">Hola ${first}, te avisamos con tiempo: el próximo <strong>${fmtDate(input.renewalDate)}</strong> se renueva tu plan <strong>${PREVENTION_PLAN_CONFIG[input.plan].label}</strong> (${priceLabel(input.plan)}) para que sigas teniendo tu rutina cada semana.</p>
    <p style="font-size:14px;line-height:1.6;color:#374151">Si prefieres no renovar, puedes desactivar la renovación desde el panel — mantienes el acceso hasta esa fecha.</p>
    ${cta(appUrl, "Gestionar mi suscripción")}
  `;
  return {
    subject: `Tu Prevention se renueva el ${fmtDate(input.renewalDate)}`,
    html: shell(inner),
    text: `Tu Prevention se renueva el ${fmtDate(input.renewalDate)}. Panel: ${appUrl}`,
  };
}

/** 4. Un cobro falló. */
export function paymentFailedEmail(input: {
  firstName: string;
  patientId: string;
}): Email {
  const first = input.firstName || "hola";
  const appUrl = `${BASE_URL}/paciente/${input.patientId}/ajustes`;
  const inner = `
    <h1 style="font-size:22px;font-weight:700;letter-spacing:-0.02em;margin:0 0 12px 0">Nos ha rebotado tu último pago</h1>
    <p style="font-size:15px;line-height:1.6;color:#374151">Hola ${first}, hemos intentado renovar tu Prevention pero el banco nos ha rechazado el cobro. Puede ser un tope diario, tarjeta caducada o simplemente algo puntual.</p>
    <p style="font-size:14px;line-height:1.6;color:#374151">Actualiza el método de pago desde tu panel y Stripe reintentará automáticamente. Si no se resuelve en unos días, se perderá el acceso.</p>
    ${cta(appUrl, "Actualizar método de pago")}
  `;
  return {
    subject: `⚠ No hemos podido cobrar tu Prevention`,
    html: shell(inner),
    text: `Tu último pago de Prevention ha fallado. Actualiza el método en tu panel: ${appUrl}`,
  };
}

/** 5. Cancelación confirmada — se llegó al final del periodo. */
export function canceledEmail(input: {
  firstName: string;
  endDate: string;
}): Email {
  const first = input.firstName || "hola";
  const landing = `${BASE_URL}/prevention`;
  const inner = `
    <h1 style="font-size:22px;font-weight:700;letter-spacing:-0.02em;margin:0 0 12px 0">Tu suscripción a Prevention ha terminado</h1>
    <p style="font-size:15px;line-height:1.6;color:#374151">Hola ${first}, el <strong>${fmtDate(input.endDate)}</strong> ha terminado tu periodo. Gracias por haber cuidado de ti con nosotros — nos vemos cuando quieras volver.</p>
    <p style="font-size:14px;line-height:1.6;color:#374151">Si en algún momento vuelves a querer contenido semanal, la puerta está abierta y no perdiste tu email.</p>
    ${cta(landing, "Volver a suscribirme")}
  `;
  return {
    subject: `Hasta pronto — tu Prevention ha terminado`,
    html: shell(inner),
    text: `Tu suscripción a Prevention terminó el ${fmtDate(input.endDate)}. Puedes volver cuando quieras: ${landing}`,
  };
}
