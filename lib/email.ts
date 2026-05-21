// Envío de emails con Resend. Si no hay RESEND_API_KEY configurada,
// imprime el email por consola (útil en desarrollo).

type EmailPayload = {
  to: string;
  subject: string;
  html: string;
  text?: string;
};

const FROM_EMAIL = process.env.EMAIL_FROM || "FisioFit App <noreply@fisiofitteam.com>";

export async function sendEmail(payload: EmailPayload): Promise<{ ok: boolean; previewMode: boolean }> {
  const apiKey = process.env.RESEND_API_KEY;

  // Modo desarrollo: log por consola
  if (!apiKey) {
    console.log("\n📧 EMAIL (modo preview — no se ha enviado)");
    console.log("───────────────────────────────────────────");
    console.log(`From: ${FROM_EMAIL}`);
    console.log(`To:      ${payload.to}`);
    console.log(`Subject: ${payload.subject}`);
    console.log("───────────────────────────────────────────");
    if (payload.text) {
      console.log(payload.text);
    } else {
      // Texto plano extraído del HTML quitando tags
      const plain = payload.html.replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
      console.log(plain);
    }
    console.log("───────────────────────────────────────────\n");
    return { ok: true, previewMode: true };
  }

  try {
    const { Resend } = await import("resend");
    const resend = new Resend(apiKey);
    const result = await resend.emails.send({
      from: FROM_EMAIL,
      to: payload.to,
      subject: payload.subject,
      html: payload.html,
      text: payload.text,
    });
    if (result.error) {
      console.error("Resend error:", result.error);
      return { ok: false, previewMode: false };
    }
    return { ok: true, previewMode: false };
  } catch (err) {
    console.error("Email send failed:", err);
    return { ok: false, previewMode: false };
  }
}

// ============================================================================
// Plantillas de emails (HTML simple, sin dependencias)
// ============================================================================

function baseHtml(content: string): string {
  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>FisioFit App</title>
</head>
<body style="margin:0;padding:0;background:#f5f5f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;background:#f5f5f5;padding:32px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" cellpadding="0" cellspacing="0" style="max-width:480px;width:100%;background:#ffffff;border-radius:16px;overflow:hidden;">
          <tr>
            <td style="padding:24px 32px;background:linear-gradient(135deg,#FCD34D 0%,#F59E0B 100%);">
              <h1 style="margin:0;color:#1f2937;font-size:20px;font-weight:700;">FisioFit App</h1>
            </td>
          </tr>
          <tr>
            <td style="padding:32px;color:#1f2937;line-height:1.5;">
              ${content}
            </td>
          </tr>
          <tr>
            <td style="padding:16px 32px;background:#f9fafb;color:#6b7280;font-size:11px;text-align:center;">
              Este email lo ha enviado FisioFit App. Si no esperabas este mensaje, puedes ignorarlo.
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

export function emailLoginCode({ to, code, fullName }: { to: string; code: string; fullName?: string }) {
  const html = baseHtml(`
    <p style="margin:0 0 16px;font-size:16px;">Hola${fullName ? ` ${fullName.split(" ")[0]}` : ""},</p>
    <p style="margin:0 0 16px;font-size:14px;color:#4b5563;">Tu código de acceso a FisioFit App es:</p>
    <div style="margin:24px 0;padding:20px;background:#fef3c7;border-radius:12px;text-align:center;">
      <div style="font-family:'SF Mono',Menlo,monospace;font-size:32px;font-weight:700;letter-spacing:8px;color:#92400e;">${code}</div>
    </div>
    <p style="margin:0 0 8px;font-size:13px;color:#6b7280;">El código caduca en 10 minutos. No se lo enseñes a nadie.</p>
    <p style="margin:24px 0 0;font-size:13px;color:#6b7280;">Si no has pedido este código, ignora este email.</p>
  `);
  return sendEmail({
    to,
    subject: `Tu código de acceso: ${code}`,
    html,
    text: `Tu código de acceso a FisioFit App es ${code}. Caduca en 10 minutos. Si no lo has pedido, ignora este email.`,
  });
}

export function emailInvite({ to, fullName, role, setupUrl }: { to: string; fullName: string; role: string; setupUrl: string }) {
  const ROLE_LABELS: Record<string, string> = {
    ceo: "CEO",
    head_success: "Head of Success",
    fisio: "Fisioterapeuta",
    setter: "Setter (gestión de leads)",
    closer: "Closer (cierre de ventas)",
  };
  const html = baseHtml(`
    <p style="margin:0 0 16px;font-size:16px;">Hola ${fullName.split(" ")[0]},</p>
    <p style="margin:0 0 16px;font-size:14px;color:#4b5563;">
      Bienvenido al equipo. Te han añadido a FisioFit App con el rol de <strong>${ROLE_LABELS[role] ?? role}</strong>.
    </p>
    <p style="margin:0 0 24px;font-size:14px;color:#4b5563;">
      Para empezar, establece tu contraseña haciendo click aquí:
    </p>
    <div style="margin:24px 0;text-align:center;">
      <a href="${setupUrl}" style="display:inline-block;padding:12px 24px;background:#1f2937;color:#ffffff;text-decoration:none;border-radius:8px;font-weight:600;font-size:14px;">
        Establecer mi contraseña
      </a>
    </div>
    <p style="margin:0 0 8px;font-size:13px;color:#6b7280;">El enlace caduca en 7 días.</p>
    <p style="margin:24px 0 0;font-size:13px;color:#6b7280;">Si no esperabas esta invitación, ignora este email.</p>
  `);
  return sendEmail({
    to,
    subject: "Bienvenido a FisioFit App · Establece tu contraseña",
    html,
    text: `Bienvenido a FisioFit App. Establece tu contraseña aquí: ${setupUrl} (caduca en 7 días)`,
  });
}

export function emailPasswordReset({ to, fullName, resetUrl }: { to: string; fullName: string; resetUrl: string }) {
  const html = baseHtml(`
    <p style="margin:0 0 16px;font-size:16px;">Hola ${fullName.split(" ")[0]},</p>
    <p style="margin:0 0 24px;font-size:14px;color:#4b5563;">
      Has pedido restablecer tu contraseña. Haz click en el botón:
    </p>
    <div style="margin:24px 0;text-align:center;">
      <a href="${resetUrl}" style="display:inline-block;padding:12px 24px;background:#1f2937;color:#ffffff;text-decoration:none;border-radius:8px;font-weight:600;font-size:14px;">
        Restablecer contraseña
      </a>
    </div>
    <p style="margin:0 0 8px;font-size:13px;color:#6b7280;">El enlace caduca en 1 hora.</p>
    <p style="margin:24px 0 0;font-size:13px;color:#6b7280;">Si no has pedido esto, ignora el email y tu contraseña seguirá igual.</p>
  `);
  return sendEmail({
    to,
    subject: "Restablece tu contraseña en FisioFit App",
    html,
    text: `Restablece tu contraseña aquí: ${resetUrl} (caduca en 1 hora). Si no lo has pedido, ignora este email.`,
  });
}
