/**
 * Envío de push notifications a iOS vía APNs HTTP/2 con JWT (ES256).
 *
 * Sin dependencias externas: usamos http2 y crypto de Node.
 *
 * Env vars necesarias en Vercel:
 *   APNS_TEAM_ID         = el Team ID de Apple Developer (10 chars).
 *   APNS_KEY_ID          = ID del .p8 generado en Apple Developer.
 *   APNS_PRIVATE_KEY     = contenido del .p8 (multilínea PEM con BEGIN/END).
 *   APNS_BUNDLE_ID       = "com.fisiofitteam.app"
 *   APNS_USE_SANDBOX     = "true" para TestFlight / "false" para App Store.
 *
 * El JWT vive 1h (max 1h por APNs). Lo cacheamos en memoria 50 min.
 */
import crypto from "crypto";
import http2 from "http2";

type ApnsResult = {
  ok: boolean;
  status?: number;
  reason?: string;
  token: string;
};

let cachedJwt: { token: string; expiresAt: number } | null = null;

function getJwt(): string {
  const now = Math.floor(Date.now() / 1000);
  if (cachedJwt && cachedJwt.expiresAt > now + 60) return cachedJwt.token;

  const teamId = process.env.APNS_TEAM_ID;
  const keyId = process.env.APNS_KEY_ID;
  const privateKeyPem = process.env.APNS_PRIVATE_KEY;
  if (!teamId || !keyId || !privateKeyPem) {
    throw new Error("APNS_TEAM_ID / APNS_KEY_ID / APNS_PRIVATE_KEY no configurados");
  }

  // Vercel a veces escapa los \n al copiar la key. Restauramos.
  const pem = privateKeyPem.includes("BEGIN")
    ? privateKeyPem.replace(/\\n/g, "\n")
    : `-----BEGIN PRIVATE KEY-----\n${privateKeyPem}\n-----END PRIVATE KEY-----`;

  const header = base64url(JSON.stringify({ alg: "ES256", kid: keyId, typ: "JWT" }));
  const claims = base64url(JSON.stringify({ iss: teamId, iat: now }));
  const data = `${header}.${claims}`;

  const signer = crypto.createSign("SHA256");
  signer.update(data);
  const signatureDer = signer.sign({ key: pem, dsaEncoding: "ieee-p1363" });
  const signature = signatureDer.toString("base64url");
  const token = `${data}.${signature}`;
  cachedJwt = { token, expiresAt: now + 3000 }; // 50 min cache
  return token;
}

function base64url(input: string): string {
  return Buffer.from(input).toString("base64url");
}

const APNS_HOST_PROD = "https://api.push.apple.com";
const APNS_HOST_SANDBOX = "https://api.sandbox.push.apple.com";

function apnsHost(): string {
  return process.env.APNS_USE_SANDBOX === "true" ? APNS_HOST_SANDBOX : APNS_HOST_PROD;
}

/**
 * Envía un push a un device token. Devuelve resultado normalizado.
 *
 * Para usar: await sendPush({ token, title, body, data: { url: "/paciente/.../sesion-hoy" } });
 */
export async function sendPush(opts: {
  token: string;
  title: string;
  body: string;
  data?: Record<string, string>;
  sound?: string;
  badge?: number;
}): Promise<ApnsResult> {
  const bundleId = process.env.APNS_BUNDLE_ID;
  if (!bundleId) {
    return { ok: false, reason: "APNS_BUNDLE_ID no configurado", token: opts.token };
  }

  const payload = JSON.stringify({
    aps: {
      alert: { title: opts.title, body: opts.body },
      sound: opts.sound ?? "default",
      ...(opts.badge !== undefined ? { badge: opts.badge } : {}),
    },
    ...(opts.data ?? {}),
  });

  let jwt: string;
  try {
    jwt = getJwt();
  } catch (e: any) {
    return { ok: false, reason: e?.message ?? "JWT error", token: opts.token };
  }

  return new Promise<ApnsResult>((resolve) => {
    const client = http2.connect(apnsHost());
    let settled = false;
    function done(r: ApnsResult) {
      if (settled) return;
      settled = true;
      try { client.close(); } catch {}
      resolve(r);
    }

    client.on("error", (e) => done({ ok: false, reason: `connect: ${e.message}`, token: opts.token }));

    const req = client.request({
      ":method": "POST",
      ":path": `/3/device/${opts.token}`,
      "apns-topic": bundleId,
      "apns-push-type": "alert",
      "apns-priority": "10",
      "authorization": `bearer ${jwt}`,
      "content-type": "application/json",
    });
    req.setEncoding("utf8");
    let status = 0;
    let bodyText = "";
    req.on("response", (headers) => {
      status = Number(headers[":status"] ?? 0);
    });
    req.on("data", (chunk) => { bodyText += chunk; });
    req.on("end", () => {
      if (status >= 200 && status < 300) {
        done({ ok: true, status, token: opts.token });
      } else {
        let reason = bodyText;
        try { reason = JSON.parse(bodyText)?.reason ?? bodyText; } catch {}
        done({ ok: false, status, reason: reason || `HTTP ${status}`, token: opts.token });
      }
    });
    req.on("error", (e) => done({ ok: false, reason: `req: ${e.message}`, token: opts.token }));
    req.write(payload);
    req.end();
  });
}
