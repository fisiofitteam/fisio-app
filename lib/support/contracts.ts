import { z } from "zod";
import { materialsSchema, type SupportFile, type SupportMaterialLink } from "./materials-contract";

export const GUIDE_VERSION = "2026-11-26.2";
export const statusLabels = { new: "Nuevo", in_progress: "En curso", awaiting_info: "Falta información", resolved: "Resuelto", declined: "Descartado" } as const;
export const priorityLabels = { low: "Baja", normal: "Normal", high: "Alta", blocking: "Bloquea el trabajo" } as const;
export const kindLabels = { problem: "Problema", improvement: "Mejora" } as const;
export type TicketStatus = keyof typeof statusLabels;
export type TicketPriority = keyof typeof priorityLabels;
export type TicketKind = keyof typeof kindLabels;
const id = z.string().uuid();
export const pathSchema = z.string().max(260).regex(/^\/fisio(?:\/[a-zA-Z0-9_-]+)*\/?$/);
export const chatSchema = z.object({ text: z.string().trim().min(1).max(2400), path: pathSchema, version: z.number().int().min(0), requestId: id }).strict();
export const ticketSchema = z.object({
  requestId: id, kind: z.enum(["problem", "improvement"]), title: z.string().trim().min(5).max(140),
  description: z.string().trim().min(10).max(6000), priority: z.enum(["low", "normal", "high", "blocking"]),
  path: pathSchema, includeConversation: z.boolean().default(false),
  ...materialsSchema,
}).strict();
export const updateTicketSchema = z.object({
  requestId: id, version: z.number().int().min(0), body: z.string().trim().max(4000).default(""),
  status: z.enum(["new", "in_progress", "awaiting_info", "resolved", "declined"]).optional(),
  priority: z.enum(["low", "normal", "high", "blocking"]).optional(),
  ...materialsSchema,
}).strict().refine(v => v.body.length > 0 || v.status !== undefined || v.priority !== undefined || v.attachmentIds.length > 0 || v.links.length > 0);
export const answerSchema = z.object({ answer: z.string().trim().min(1).max(7000), steps: z.array(z.string().max(700)).max(6), guideIds: z.array(z.string().max(50)).max(4) }).strict();
export type SupportLink = { title: string; href: string };
export type SupportContext = {
  screen: string; route: string; checked: boolean; facts: string[]; roles: string[];
  permissions: { clinical: boolean; sales: boolean; manageSupport: boolean };
  guideVersion: string; release: string;
};
export type SupportAnswer = { answer: string; steps: string[]; links: SupportLink[]; context: SupportContext; fallback: boolean };
export type ChatDTO = { id: string; version: number; busy: boolean; messages: { id: string; role: string; text: string; createdAt: string; answer: SupportAnswer | null }[] };
export type TicketDTO = {
  id: string; kind: TicketKind; title: string; description: string; status: TicketStatus; priority: TicketPriority;
  reporter: string; reporterId: string; path: string; version: number; createdAt: string; updatedAt: string;
  context: SupportContext; conversation: { role: string; text: string }[];
  eventCount: number;
  attachments: SupportFile[]; links: SupportMaterialLink[];
  events: { id: string; body: string; author: string; createdAt: string; status: TicketStatus | null; priority: TicketPriority | null; attachments: SupportFile[]; links: SupportMaterialLink[] }[];
};
