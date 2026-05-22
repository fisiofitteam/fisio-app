import crypto from "crypto";

/**
 * Encriptación simétrica de tokens sensibles (Google OAuth, etc).
 *
 * Algoritmo: AES-256-GCM (autenticado, recomendado por NIST).
 * Clave: ENCRYPTION_KEY env var (64 hex chars = 32 bytes = 256 bits).
 *
 * Formato del ciphertext: "iv:authTag:encrypted" (todo en hex, separado por ":").
 *  - iv: 12 bytes (nonce único por encriptación)
 *  - authTag: 16 bytes (tag de autenticación de GCM)
 *  - encrypted: longitud variable
 *
 * Es seguro porque cada encriptación usa un IV aleatorio diferente.
 */

const ALGORITHM = "aes-256-gcm";

function getKey(): Buffer {
  const hex = process.env.ENCRYPTION_KEY;
  if (!hex) throw new Error("ENCRYPTION_KEY env var not set");
  const buf = Buffer.from(hex, "hex");
  if (buf.length !== 32) {
    throw new Error(`ENCRYPTION_KEY debe ser 64 caracteres hex (32 bytes), actual: ${buf.length} bytes`);
  }
  return buf;
}

export function encrypt(plaintext: string): string {
  const key = getKey();
  const iv = crypto.randomBytes(12); // GCM recomienda 12 bytes
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();
  return `${iv.toString("hex")}:${authTag.toString("hex")}:${encrypted.toString("hex")}`;
}

export function decrypt(ciphertext: string): string {
  const key = getKey();
  const parts = ciphertext.split(":");
  if (parts.length !== 3) {
    throw new Error("Formato de ciphertext inválido");
  }
  const [ivHex, authTagHex, encryptedHex] = parts;
  const iv = Buffer.from(ivHex, "hex");
  const authTag = Buffer.from(authTagHex, "hex");
  const encrypted = Buffer.from(encryptedHex, "hex");

  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);
  const decrypted = Buffer.concat([
    decipher.update(encrypted),
    decipher.final(),
  ]);
  return decrypted.toString("utf8");
}
