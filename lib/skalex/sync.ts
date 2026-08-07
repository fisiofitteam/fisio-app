/**
 * Sincronización de conversaciones Skalex a Postgres.
 *
 * Estrategia (mientras Skalex no ofrezca listado paginado por fecha):
 * REVERSE LOOKUP. Recorremos nuestros Lead y Patient con instagram o phone
 * seteado y consultamos Skalex para cada uno. Cada conversación devuelta
 * se hace upsert por `conversationId` con sus etiquetas y análisis IA.
 *
 * Rate limit de Skalex: 300 req/min. El sync procesa una identidad cada
 * ~250ms para dejar margen (≈240 req/min).
 *
 * Idempotente: upserts por conversationId; los labels se refrescan
 * borrando+insertando por conversación (son pocos, es más simple que
 * reconciliar diffs).
 */
import { prisma } from "@/lib/prisma";
import {
  findByIgUsername,
  findByIgUserId,
  findByPhone,
  type SkalexConversationDto,
} from "./client";

const SLEEP_BETWEEN_LOOKUPS_MS = 250; // 4 req/s ≈ 240 req/min con margen sobre 300

type SyncStats = {
  processed: number; // identidades consultadas (lead/patient)
  created: number;   // conversaciones nuevas
  updated: number;   // conversaciones existentes actualizadas
  errors: number;
};

/** Normaliza un handle de Instagram: quita "@" y baja a minúsculas. */
function normIg(v: string | null | undefined): string | null {
  if (!v) return null;
  const t = v.trim().replace(/^@+/, "").toLowerCase();
  return t || null;
}
/** Normaliza teléfono a solo dígitos. */
function normPhone(v: string | null | undefined): string | null {
  if (!v) return null;
  const t = v.replace(/[^\d]/g, "");
  return t.length >= 6 ? t : null;
}

/**
 * Upsert de una conversación Skalex + reemplazo de labels. Devuelve
 * "created" | "updated" para las stats.
 */
async function upsertConversation(
  dto: SkalexConversationDto,
  match: { leadId?: string | null; patientId?: string | null },
): Promise<"created" | "updated"> {
  const now = new Date();
  const data = {
    platform: dto.platform,
    customerName: dto.customerName ?? null,
    customerPhone: dto.customerPhone ?? null,
    igUsername: normIg(dto.igUsername),
    igUserId: dto.igUserId ?? null,
    aiPhase: dto.ai?.phase ?? null,
    aiPhaseName: dto.ai?.phaseName ?? null,
    aiAnalysis: dto.ai?.analysis ?? null,
    aiNextStepGoal: dto.ai?.nextStepGoal ?? null,
    aiUpdatedAt: dto.ai?.updatedAt ? new Date(dto.ai.updatedAt) : null,
    externalCreatedAt: new Date(dto.createdAt),
    lastMessageAt: new Date(dto.lastMessageAt),
    leadId: match.leadId ?? null,
    patientId: match.patientId ?? null,
    syncedAt: now,
  };

  const existing = await prisma.skalexConversation.findUnique({
    where: { conversationId: dto.conversationId },
    select: { id: true },
  });

  const row = existing
    ? await prisma.skalexConversation.update({
        where: { conversationId: dto.conversationId },
        data,
      })
    : await prisma.skalexConversation.create({
        data: { conversationId: dto.conversationId, ...data },
      });

  // Labels: reemplazamos todo. Son pocos y así evitamos reconciliar diffs.
  await prisma.skalexLabel.deleteMany({ where: { conversationId: row.id } });
  if (dto.labels && dto.labels.length > 0) {
    await prisma.skalexLabel.createMany({
      data: dto.labels.map((l) => ({
        conversationId: row.id,
        name: l.name,
        color: l.color ?? null,
        addedAt: new Date(l.addedAt),
      })),
      skipDuplicates: true,
    });
  }
  return existing ? "updated" : "created";
}

/**
 * Sincroniza a partir de un solo objeto (lead o patient). Se puede llamar
 * puntualmente desde código (ej. al crear un Lead nuevo) para forzar
 * lookup inmediato sin esperar al cron.
 */
export async function syncOneIdentity(input: {
  leadId?: string;
  patientId?: string;
  igUsername?: string | null;
  igUserId?: string | null;
  phone?: string | null;
}): Promise<{ created: number; updated: number; skipped: boolean }> {
  const match = { leadId: input.leadId ?? null, patientId: input.patientId ?? null };
  const dtos = await fetchConversationsForIdentity(input);
  if (dtos.length === 0) return { created: 0, updated: 0, skipped: true };
  let created = 0;
  let updated = 0;
  for (const dto of dtos) {
    const r = await upsertConversation(dto, match);
    if (r === "created") created++;
    else updated++;
  }
  return { created, updated, skipped: false };
}

async function fetchConversationsForIdentity(input: {
  igUsername?: string | null;
  igUserId?: string | null;
  phone?: string | null;
}): Promise<SkalexConversationDto[]> {
  // Prioridad: igUserId (más estable) > igUsername > phone
  if (input.igUserId) {
    return await findByIgUserId(input.igUserId);
  }
  const ig = normIg(input.igUsername);
  if (ig) {
    return await findByIgUsername(ig);
  }
  const phone = normPhone(input.phone);
  if (phone) {
    return await findByPhone(phone);
  }
  return [];
}

/**
 * Sincronización masiva vía reverse-lookup. Recorre Leads y Patients con
 * instagram o phone y consulta Skalex para cada uno.
 *
 * Guarda el estado en SkalexSyncState.
 */
export async function runFullSync(): Promise<SyncStats> {
  const now = new Date();
  await prisma.skalexSyncState.upsert({
    where: { id: "singleton" },
    create: { id: "singleton", lastRunAt: now },
    update: { lastRunAt: now, lastError: null },
  });

  const stats: SyncStats = { processed: 0, created: 0, updated: 0, errors: 0 };

  // Cargamos todos los leads/patients con al menos un identificador utilizable.
  // Ordenamos por updatedAt desc para priorizar lo reciente si el cron se corta.
  const leads = await prisma.lead.findMany({
    where: {
      OR: [{ instagram: { not: null } }, { phone: { not: null } }],
    },
    select: { id: true, instagram: true, phone: true, updatedAt: true },
    orderBy: { updatedAt: "desc" },
  });
  const patients = await prisma.patient.findMany({
    where: {
      OR: [{ instagram: { not: null } }, { phone: { not: null } }],
    },
    select: { id: true, instagram: true, phone: true, startedAt: true },
    orderBy: { startedAt: "desc" },
  });

  // Cola de identidades. Priorizamos Lead (más "activas" en el setter IA)
  // y luego Patient (para trazabilidad completa).
  type Identity = { kind: "lead" | "patient"; id: string; ig: string | null; phone: string | null };
  const queue: Identity[] = [
    ...leads.map((l) => ({ kind: "lead" as const, id: l.id, ig: l.instagram, phone: l.phone })),
    ...patients.map((p) => ({ kind: "patient" as const, id: p.id, ig: p.instagram, phone: p.phone })),
  ];

  for (const item of queue) {
    try {
      const dtos = await fetchConversationsForIdentity({
        igUsername: item.ig,
        phone: item.phone,
      });
      for (const dto of dtos) {
        const r = await upsertConversation(dto, {
          leadId: item.kind === "lead" ? item.id : null,
          patientId: item.kind === "patient" ? item.id : null,
        });
        if (r === "created") stats.created++;
        else stats.updated++;
      }
    } catch (err) {
      stats.errors++;
      console.error("[skalex-sync] error en identity", item, err);
    }
    stats.processed++;
    await new Promise((r) => setTimeout(r, SLEEP_BETWEEN_LOOKUPS_MS));
  }

  await prisma.skalexSyncState.update({
    where: { id: "singleton" },
    data: {
      lastSuccessAt: new Date(),
      lastProcessed: stats.processed,
      lastCreated: stats.created,
      lastUpdated: stats.updated,
    },
  });

  return stats;
}
