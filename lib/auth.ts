import { cookies } from "next/headers";
import { randomBytes, scryptSync, timingSafeEqual, createHash } from "crypto";
import { prisma } from "./prisma";

export type Role = "ceo" | "head_success" | "fisio" | "setter" | "closer";

export type ActiveProfessional = {
  id: string;
  fullName: string;
  email: string | null;
  role: Role;
  isManager: boolean;
  canSeeLeads: boolean;
  canEditLeads: boolean;
};

export type ActivePatient = {
  id: string;
  fullName: string;
  email: string | null;
};

export const SESSION_COOKIE = "fisio-session";
export const SESSION_DAYS = 60;

// ============================================================================
// PASSWORDS — hash con scrypt (sin dependencias externas, robusto)
// scrypt es nativo de Node.js, suficientemente seguro para nuestro caso de uso
// ============================================================================

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [salt, hash] = stored.split(":");
  if (!salt || !hash) return false;
  try {
    const test = scryptSync(password, salt, 64);
    const original = Buffer.from(hash, "hex");
    if (test.length !== original.length) return false;
    return timingSafeEqual(test, original);
  } catch {
    return false;
  }
}

// ============================================================================
// TOKENS / CÓDIGOS
// ============================================================================

export function generateToken(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}

export function generateNumericCode(length = 6): string {
  const max = Math.pow(10, length);
  const num = Math.floor(Math.random() * max);
  return num.toString().padStart(length, "0");
}

export function hashCode(code: string): string {
  return createHash("sha256").update(code).digest("hex");
}

export function verifyCode(code: string, storedHash: string): boolean {
  return hashCode(code) === storedHash;
}

// ============================================================================
// SESIONES
// ============================================================================

type SessionUser =
  | { kind: "professional"; pro: ActiveProfessional }
  | { kind: "patient"; patient: ActivePatient };

function expiryDate(): Date {
  const d = new Date();
  d.setDate(d.getDate() + SESSION_DAYS);
  return d;
}

export async function createSessionForProfessional(professionalId: string, meta?: { userAgent?: string; ipAddress?: string }) {
  const token = generateToken();
  await prisma.session.create({
    data: {
      token,
      professionalId,
      expiresAt: expiryDate(),
      userAgent: meta?.userAgent || null,
      ipAddress: meta?.ipAddress || null,
    },
  });
  return token;
}

export async function createSessionForPatient(patientId: string, meta?: { userAgent?: string; ipAddress?: string }) {
  const token = generateToken();
  await prisma.session.create({
    data: {
      token,
      patientId,
      expiresAt: expiryDate(),
      userAgent: meta?.userAgent || null,
      ipAddress: meta?.ipAddress || null,
    },
  });
  return token;
}

export function setSessionCookie(token: string) {
  cookies().set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_DAYS * 24 * 60 * 60,
  });
}

export function clearSessionCookie() {
  cookies().delete(SESSION_COOKIE);
}

// Devuelve el usuario logueado en la cookie de sesión, o null
export async function getSessionUser(): Promise<SessionUser | null> {
  // En desarrollo: si está activado FISIO_DEV_BYPASS y hay una cookie legacy
  // de switch user, permitimos ese flow para no romper el trasteo local.
  if (process.env.FISIO_DEV_BYPASS === "true") {
    const legacy = cookies().get("active-pro-id")?.value;
    if (legacy) {
      const pro = await prisma.professional.findUnique({ where: { id: legacy } });
      if (pro && pro.active) return { kind: "professional", pro: toActivePro(pro) };
    }
    const legacyPatient = cookies().get("active-patient-id")?.value;
    if (legacyPatient) {
      const p = await prisma.patient.findUnique({ where: { id: legacyPatient } });
      if (p) return { kind: "patient", patient: { id: p.id, fullName: p.fullName, email: p.email } };
    }
  }

  const token = cookies().get(SESSION_COOKIE)?.value;
  if (!token) return null;

  const session = await prisma.session.findUnique({
    where: { token },
    include: { professional: true, patient: true },
  });
  if (!session) return null;
  if (session.expiresAt < new Date()) {
    // sesión expirada: la borramos asíncrona (no bloqueamos)
    prisma.session.delete({ where: { id: session.id } }).catch(() => {});
    return null;
  }

  // Actualizar lastUsedAt (no bloqueante)
  prisma.session.update({ where: { id: session.id }, data: { lastUsedAt: new Date() } }).catch(() => {});

  if (session.professional && session.professional.active) {
    return { kind: "professional", pro: toActivePro(session.professional) };
  }
  if (session.patient) {
    return { kind: "patient", patient: { id: session.patient.id, fullName: session.patient.fullName, email: session.patient.email } };
  }
  return null;
}

function toActivePro(pro: { id: string; fullName: string; email: string | null; role: string }): ActiveProfessional {
  const role = pro.role as Role;
  const isManager = role === "ceo" || role === "head_success";
  return {
    id: pro.id,
    fullName: pro.fullName,
    email: pro.email,
    role,
    isManager,
    canSeeLeads: isManager || role === "setter" || role === "closer",
    canEditLeads: isManager || role === "setter",
  };
}

// Atajos de compatibilidad
export async function getActiveProfessional(): Promise<ActiveProfessional | null> {
  const user = await getSessionUser();
  if (user?.kind === "professional") return user.pro;
  return null;
}

export async function getActivePatient(): Promise<ActivePatient | null> {
  const user = await getSessionUser();
  if (user?.kind === "patient") return user.patient;
  return null;
}

export async function destroySession(token: string) {
  await prisma.session.delete({ where: { token } }).catch(() => {});
}
