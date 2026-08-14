"use client";

import { useState } from "react";
import { PaymentLinkModal } from "@/components/PaymentLinkModal";
import { RescheduleLinkButton } from "@/components/RescheduleLinkButton";
import { SendCaseFlow, type SendCaseTemplate, type SuccessCaseOption } from "@/components/SendCaseFlow";
import { SendDirectButton } from "@/components/SendDirectButton";
import { SendAppLinkButton } from "@/components/SendAppLinkButton";
import { ManualSaleButton } from "@/components/ManualSaleButton";
import { LeadAiSummaryBlock } from "@/components/LeadAiSummaryBlock";
import { CallSummaryBlock, type CallSummaryData } from "@/components/CallSummaryBlock";
import { CallCoachingBlock } from "@/components/CallCoachingBlock";
import { countryFlag, findCountry } from "@/lib/countries";
import {
  datetimeLocalInputToUtcIso,
  utcIsoToDatetimeLocalInput,
  nowPlusHoursForInput,
} from "@/lib/datetime-local";
import type { TemplateActionType } from "@/lib/resource-roles";

type DirectTemplate = { id: string; name: string; body: string; actionType: TemplateActionType };
import Link from "next/link";
import { useRouter } from "next/navigation";

type Pro = { id: string; fullName: string; role: string };

type Lead = {
  id: string;
  fullName: string;
  contactType: string;
  contactValue: string;
  aiSummary: string | null;
  callScheduledAt: string;
  status: string;
  inFollowUp: boolean;
  followUpNote: string | null;
  followUpDate: string | null;
  lostReason: string | null;
  setter: Pro | null;
  closer: Pro | null;
  convertedPatient: { id: string; fullName: string } | null;
  decidedAt: string | null;
  // Campos de landing pública (v54)
  email: string | null;
  phone: string | null;
  motivo: string | null;
  tratamientosPrevios: string | null;
  impactoCrossfit: string | null;
  meetingUrl: string | null;
  source: string | null;
  country: string | null;
  // Workflow comercial (v55)
  setterNotifiedAt: string | null;
  closerContactedAt: string | null;
  reminderSentAt: string | null;
  // Trazabilidad de origen (para métricas)
  aiScheduled: boolean;
};

const STATUS_TABS = [
  { key: "scheduled", label: "📅 Agendadas" },
  { key: "won", label: "🏆 Vendidas" },
  { key: "lost", label: "❌ Perdidas" },
  { key: "cancelled", label: "🚫 Canceladas" },
  { key: "no_show", label: "👻 No acude" },
] as const;

const LOST_REASONS = [
  { value: "precio", label: "Precio" },
  { value: "no_encaja", label: "No encaja" },
  { value: "ghosting", label: "Ghosting" },
  { value: "otro", label: "Otro" },
];

const CONTACT_ICON: Record<string, string> = {
  phone: "📞",
  instagram: "📷",
  email: "✉️",
};

function formatCallDateTime(iso: string): string {
  const d = new Date(iso);
  const time = d.toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" });
  const dateStr = d.toLocaleDateString("es-ES", { day: "numeric", month: "short" });
  return `${dateStr} · ${time}`;
}

function isToday(iso: string): boolean {
  const d = new Date(iso);
  const t = new Date();
  return d.getDate() === t.getDate() && d.getMonth() === t.getMonth() && d.getFullYear() === t.getFullYear();
}

function isThisWeek(iso: string): boolean {
  if (isToday(iso)) return false;
  const d = new Date(iso);
  const t = new Date();
  t.setHours(0, 0, 0, 0);
  // Lunes de esta semana
  const dow = t.getDay() === 0 ? 7 : t.getDay();
  const monday = new Date(t);
  monday.setDate(t.getDate() - (dow - 1));
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  sunday.setHours(23, 59, 59, 999);
  return d >= monday && d <= sunday;
}

export function CallsListView({
  activeStatus,
  activeCloserId,
  currentUser,
  closers,
  leads,
  fisios,
  counts,
  successCaseTemplates,
  meetingReminderTemplates,
  successCases,
  currentUserCloserIntro,
  skalexAiByLeadId,
  callSummaryByLeadId,
}: {
  activeStatus: string;
  activeCloserId: string;
  currentUser: { id: string; fullName: string; role: string };
  closers: Pro[];
  leads: Lead[];
  fisios: Pro[];
  counts: { scheduled: number; won: number; lost: number; cancelled: number; no_show: number };
  successCaseTemplates: SendCaseTemplate[];
  meetingReminderTemplates: DirectTemplate[];
  successCases: SuccessCaseOption[];
  currentUserCloserIntro: string | null;
  /** Análisis IA (Skalex/Zapp) por leadId. Se muestra en la card si existe. */
  skalexAiByLeadId?: Record<string, import("@/lib/skalex/summaries").LeadAiSummary>;
  /** Resumen IA de la videollamada (Meet transcript → Claude) por leadId. */
  callSummaryByLeadId?: Record<string, CallSummaryData>;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState<Lead | null>(null);
  const [paymentLinkFor, setPaymentLinkFor] = useState<Lead | null>(null);
  const [creating, setCreating] = useState(false);

  function switchStatus(key: string) {
    const url = new URL(window.location.href);
    if (key === "scheduled") url.searchParams.delete("status");
    else url.searchParams.set("status", key);
    router.push(url.pathname + url.search);
    router.refresh();
  }

  function switchCloser(closerId: string) {
    const url = new URL(window.location.href);
    url.searchParams.set("closer", closerId);
    router.push(url.pathname + url.search);
    router.refresh();
  }

  // Si estamos en Agendadas, agrupar por Hoy / Esta semana / Próximas
  const showGrouped = activeStatus === "scheduled" && leads.length > 0;
  const today = leads.filter((l) => isToday(l.callScheduledAt));
  const thisWeek = leads.filter((l) => isThisWeek(l.callScheduledAt));
  const future = leads.filter((l) => !isToday(l.callScheduledAt) && !isThisWeek(l.callScheduledAt));

  return (
    <main>
      <header className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Llamadas</h1>
          <p className="text-xs text-neutral-500 mt-0.5">
            {currentUser.role === "closer" ? "Tus llamadas asignadas" : "Llamadas del equipo"}
          </p>
        </div>
        <button
          onClick={() => setCreating(true)}
          className="text-xs font-medium px-3 py-2 rounded-lg shrink-0"
          style={{ background: "#0A0A0A", color: "#FAFAFA" }}
        >
          + Añadir llamada
        </button>
      </header>

      {/* Toggle Llamadas / Follow-up (CEO y setter — visión global) */}
      {(currentUser.role === "ceo" || currentUser.role === "setter") && (
        <div className="flex gap-1 mb-3 border-b border-neutral-200">
          <span className="px-4 py-2 text-sm font-medium border-b-2 border-neutral-900 text-neutral-900">📞 Llamadas</span>
          <a href={`/fisio/llamadas-venta?view=followup&closer=${activeCloserId}`} className="px-4 py-2 text-sm font-medium border-b-2 border-transparent text-neutral-500 hover:text-neutral-900">🔁 Follow-up</a>
        </div>
      )}

      {/* Tabs de closer (CEO y setter para alternar entre closers) */}
      {(currentUser.role === "ceo" || currentUser.role === "setter") && closers.length > 1 && (
        <div className="flex gap-1 mb-3 border-b border-neutral-200">
          {closers.map((c) => {
            const isActive = activeCloserId === c.id;
            return (
              <button
                key={c.id}
                onClick={() => switchCloser(c.id)}
                className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                  isActive ? "border-neutral-900 text-neutral-900" : "border-transparent text-neutral-500 hover:text-neutral-900"
                }`}
              >
                {c.role === "ceo" ? "👑 " : "📞 "}{c.fullName.split(" ")[0]}
                {c.id === currentUser.id && <span className="text-[10px] text-neutral-400 ml-1">(tú)</span>}
              </button>
            );
          })}
        </div>
      )}

      {/* Tabs de estado */}
      <div className="flex gap-1 overflow-x-auto pb-1 mb-4">
        {STATUS_TABS.map((tab) => {
          const count = counts[tab.key as keyof typeof counts];
          const isActive = activeStatus === tab.key;
          return (
            <button
              key={tab.key}
              onClick={() => switchStatus(tab.key)}
              className={`px-3 py-2 text-xs rounded-lg whitespace-nowrap flex items-center gap-1.5 transition-colors ${
                isActive ? "bg-neutral-900 text-white" : "bg-white border border-neutral-200 hover:bg-neutral-50"
              }`}
            >
              <span>{tab.label}</span>
              <span className={`text-[10px] px-1.5 rounded-full ${isActive ? "bg-white/20" : "bg-neutral-100"}`}>
                {count}
              </span>
            </button>
          );
        })}
      </div>

      {leads.length === 0 ? (
        <section className="card">
          <p className="text-sm text-neutral-400 text-center py-12 italic">
            No hay llamadas en este estado.
          </p>
        </section>
      ) : showGrouped ? (
        <div className="space-y-4">
          {today.length > 0 && (
            <CallsGroup label="Hoy" badge="amber" leads={today} currentUser={currentUser} onClick={setEditing} sendCaseProps={{ successCaseTemplates, meetingReminderTemplates, successCases, currentUserCloserIntro }} skalexAiByLeadId={skalexAiByLeadId} callSummaryByLeadId={callSummaryByLeadId} />
          )}
          {thisWeek.length > 0 && (
            <CallsGroup label="Esta semana" badge="blue" leads={thisWeek} currentUser={currentUser} onClick={setEditing} sendCaseProps={{ successCaseTemplates, meetingReminderTemplates, successCases, currentUserCloserIntro }} skalexAiByLeadId={skalexAiByLeadId} callSummaryByLeadId={callSummaryByLeadId} />
          )}
          {future.length > 0 && (
            <CallsGroup label="Próximas" badge="neutral" leads={future} currentUser={currentUser} onClick={setEditing} sendCaseProps={{ successCaseTemplates, meetingReminderTemplates, successCases, currentUserCloserIntro }} skalexAiByLeadId={skalexAiByLeadId} callSummaryByLeadId={callSummaryByLeadId} />
          )}
        </div>
      ) : (
        <section className="card">
          <div className="divide-y divide-neutral-100">
            {leads.map((lead) => (
              <CallRow
                key={lead.id}
                lead={lead}
                currentUser={currentUser}
                fisios={fisios}
                onClick={() => setEditing(lead)}
                sendCaseProps={{ successCaseTemplates, meetingReminderTemplates, successCases, currentUserCloserIntro }}
                aiSummary={skalexAiByLeadId?.[lead.id]}
                callSummary={callSummaryByLeadId?.[lead.id]}
              />
            ))}
          </div>
        </section>
      )}

      {editing && (
        <CallEditModal
          lead={editing}
          currentUser={currentUser}
          closers={closers}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            router.refresh();
          }}
          onConvert={(lead) => {
            setEditing(null);
            setPaymentLinkFor(lead);
          }}
        />
      )}

      {paymentLinkFor && (
        <PaymentLinkModal
          lead={paymentLinkFor}
          onClose={() => setPaymentLinkFor(null)}
        />
      )}

      {creating && (
        <AddCallModal
          currentUser={currentUser}
          closers={closers}
          onClose={() => setCreating(false)}
          onSaved={() => {
            setCreating(false);
            router.refresh();
          }}
        />
      )}
    </main>
  );
}

type SendCaseProps = {
  successCaseTemplates: SendCaseTemplate[];
  meetingReminderTemplates: DirectTemplate[];
  successCases: SuccessCaseOption[];
  currentUserCloserIntro: string | null;
};

function CallsGroup({
  label,
  badge,
  leads,
  currentUser,
  onClick,
  sendCaseProps,
  skalexAiByLeadId,
  callSummaryByLeadId,
}: {
  label: string;
  badge: "amber" | "blue" | "neutral";
  leads: Lead[];
  currentUser: { id: string; fullName: string; role: string };
  onClick: (lead: Lead) => void;
  sendCaseProps: SendCaseProps;
  skalexAiByLeadId?: Record<string, import("@/lib/skalex/summaries").LeadAiSummary>;
  callSummaryByLeadId?: Record<string, CallSummaryData>;
}) {
  const badgeClass =
    badge === "amber" ? "bg-amber-100 text-amber-800 border-amber-200"
    : badge === "blue" ? "bg-blue-100 text-blue-800 border-blue-200"
    : "bg-neutral-100 text-neutral-700 border-neutral-200";
  return (
    <section className="card">
      <div className="flex items-center gap-2 mb-3">
        <span className={`text-[10px] uppercase font-semibold tracking-wide px-2 py-0.5 rounded-full border ${badgeClass}`}>
          {label}
        </span>
        <span className="text-xs text-neutral-500">{leads.length}</span>
      </div>
      <div className="divide-y divide-neutral-100">
        {leads.map((lead) => (
          <CallRow key={lead.id} lead={lead} currentUser={currentUser} onClick={() => onClick(lead)} sendCaseProps={sendCaseProps} aiSummary={skalexAiByLeadId?.[lead.id]} callSummary={callSummaryByLeadId?.[lead.id]} />
        ))}
      </div>
    </section>
  );
}

function CallRow({
  lead,
  currentUser,
  fisios,
  onClick,
  sendCaseProps,
  aiSummary,
  callSummary,
}: {
  lead: Lead;
  currentUser: { id: string; fullName: string; role: string };
  fisios?: Pro[];
  onClick: () => void;
  sendCaseProps: SendCaseProps;
  aiSummary?: import("@/lib/skalex/summaries").LeadAiSummary;
  callSummary?: CallSummaryData;
}) {
  return (
    <button onClick={onClick} className="w-full text-left py-3 px-2 -mx-2 hover:bg-neutral-50 rounded transition-colors">
      <div className="flex justify-between items-start gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            {lead.country && (() => {
              const c = findCountry(lead.country);
              if (!c) return null;
              return (
                <span
                  className="text-base leading-none"
                  title={`${c.label}${c.dialCode ? ` · ${c.dialCode}` : ""}`}
                >
                  {countryFlag(c.iso2)}
                </span>
              );
            })()}
            <span className="font-medium">{lead.fullName}</span>
            {lead.source === "landing" && (
              <span className="text-[9px] font-bold tracking-wider px-1.5 py-0.5 rounded" style={{ background: "#DBEAFE", color: "#1E40AF" }}>
                LANDING
              </span>
            )}
            {/* Etiquetas de estado de workflow comercial */}
            {lead.status === "scheduled" && lead.source === "landing" && !lead.setterNotifiedAt && (
              <span className="text-[9px] font-bold tracking-wider px-1.5 py-0.5 rounded" style={{ background: "#FEE2E2", color: "#991B1B" }}>
                SIN CONTACTAR
              </span>
            )}
            {lead.status === "scheduled" && lead.setterNotifiedAt && !lead.closerContactedAt && currentUser.role !== "setter" && (
              <span className="text-[9px] font-bold tracking-wider px-1.5 py-0.5 rounded" style={{ background: "#FEF3C7", color: "#78350F" }}>
                PENDIENTE CASO ÉXITO
              </span>
            )}
            {lead.status === "scheduled" && lead.closerContactedAt && !lead.reminderSentAt && currentUser.role !== "setter" && (() => {
              // Si la llamada es mañana, mostrar etiqueta "pendiente recordatorio"
              const callDate = new Date(lead.callScheduledAt);
              const tomorrow = new Date();
              tomorrow.setDate(tomorrow.getDate() + 1);
              tomorrow.setHours(0, 0, 0, 0);
              const tomorrowEnd = new Date(tomorrow);
              tomorrowEnd.setHours(23, 59, 59, 999);
              if (callDate >= tomorrow && callDate <= tomorrowEnd) {
                return (
                  <span className="text-[9px] font-bold tracking-wider px-1.5 py-0.5 rounded" style={{ background: "#FED7AA", color: "#9A3412" }}>
                    PENDIENTE RECORDATORIO
                  </span>
                );
              }
              return null;
            })()}
          </div>

          {/* Datos de contacto: email + teléfono en líneas separadas */}
          {(lead.email || lead.phone) ? (
            <div className="mt-1 space-y-0.5">
              {lead.phone && (
                <div className="text-xs text-neutral-600 flex items-center gap-1.5">
                  <span>📞</span>
                  <a
                    href={`https://wa.me/${lead.phone.replace(/[^0-9+]/g, "")}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={(e) => e.stopPropagation()}
                    className="hover:underline tabular-nums"
                  >
                    {lead.phone}
                  </a>
                </div>
              )}
              {lead.email && (
                <div className="text-xs text-neutral-600 flex items-center gap-1.5">
                  <span>✉️</span>
                  <a
                    href={`mailto:${lead.email}`}
                    onClick={(e) => e.stopPropagation()}
                    className="hover:underline truncate"
                  >
                    {lead.email}
                  </a>
                </div>
              )}
            </div>
          ) : (
            // Fallback: si no hay email ni teléfono (lead manual antiguo), usar contactType+contactValue
            <div className="text-xs text-neutral-500 mt-1">
              {CONTACT_ICON[lead.contactType] ?? "·"} {lead.contactValue}
            </div>
          )}
          {lead.motivo && (
            <p className="text-xs text-neutral-700 mt-1 line-clamp-2">
              <strong>Motivo:</strong> {lead.motivo}
            </p>
          )}
          {!lead.motivo && lead.aiSummary && (
            <p className="text-xs text-neutral-600 italic mt-1 line-clamp-2">"{lead.aiSummary}"</p>
          )}
          {lead.status === "lost" && lead.lostReason && (
            <div className="text-[11px] text-red-600 mt-1">Razón: {lead.lostReason}</div>
          )}
          {lead.convertedPatient && (
            <div className="flex flex-col">
              <Link
                href={`/fisio/paciente/${lead.convertedPatient.id}`}
                onClick={(e) => e.stopPropagation()}
                className="text-[11px] text-emerald-700 mt-1 inline-block hover:underline"
              >
                → Ver ficha de {lead.convertedPatient.fullName}
              </Link>
              <SendAppLinkButton
                patientId={lead.convertedPatient.id}
                patientName={lead.convertedPatient.fullName}
              />
            </div>
          )}
          {lead.status === "won" && !lead.convertedPatient && (
            <div className="flex flex-col">
              <ManualSaleButton
                lead={{
                  id: lead.id,
                  fullName: lead.fullName,
                  contactType: lead.contactType,
                  contactValue: lead.contactValue,
                  email: lead.email,
                  phone: lead.phone,
                }}
                fisios={fisios ?? []}
              />
            </div>
          )}

          {/* Botones de acción rápida de workflow (no abren el modal, son inline) */}
          {lead.status === "scheduled" && (
            <WorkflowActionButtons lead={lead} currentUser={currentUser} sendCaseProps={sendCaseProps} />
          )}

          {/* Acciones libres siempre disponibles para CEO y closer:
              enviar caso de éxito y recordatorio de cita, sea cual sea el
              estado del lead o si es una llamada añadida manualmente. */}
          <AlwaysAvailableCallActions
            lead={lead}
            currentUser={currentUser}
            sendCaseProps={sendCaseProps}
          />

          {/* Toggle "Agendado por IA" (visible siempre, clicable sin abrir modal) */}
          <AiScheduledToggle lead={lead} />
        </div>
        <div className="text-right flex-shrink-0">
          <div className="text-xs font-medium text-blue-700 whitespace-nowrap">
            📅 {formatCallDateTime(lead.callScheduledAt)}
          </div>
        </div>
      </div>
      {aiSummary && aiSummary.analysis && <LeadAiSummaryBlock summary={aiSummary} />}
      {callSummary && (
        // En won/lost mostramos el coaching (entrenamiento del closer) en
        // lugar del análisis comercial: el equipo ya sabe cómo fue la venta,
        // lo útil ahora es aprender de la llamada. En rescheduled/unclear
        // seguimos mostrando el comercial (todavía es un lead vivo).
        (callSummary.outcome === "won" || callSummary.outcome === "lost")
          ? <CallCoachingBlock data={{
              coachingSummary: callSummary.coachingSummary ?? null,
              coachingKeyPoints: callSummary.coachingKeyPoints ?? null,
              outcome: callSummary.outcome,
            }} />
          : <CallSummaryBlock summary={callSummary} />
      )}
    </button>
  );
}

// ============================================================================
// Toggle "Agendado por IA" — visible en cada fila, marca/desmarca sin abrir modal
// ============================================================================
function AiScheduledToggle({ lead }: { lead: Lead }) {
  const [loading, setLoading] = useState(false);
  async function toggle(e: React.MouseEvent) {
    e.stopPropagation();
    if (loading) return;
    setLoading(true);
    await fetch("/api/leads", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: lead.id, aiScheduled: !lead.aiScheduled }),
    });
    window.location.reload();
  }
  return (
    <div className="mt-2">
      <button
        onClick={toggle}
        disabled={loading}
        title="Marca si esta llamada la agendó la IA (para métricas)"
        className="text-[11px] font-medium px-2 py-0.5 rounded-full border transition-colors"
        style={lead.aiScheduled
          ? { background: "#8B5CF6", color: "#FFFFFF", borderColor: "#8B5CF6" }
          : { background: "transparent", color: "#737373", borderColor: "#D4D4D4" }}
      >
        🤖 {lead.aiScheduled ? "Agendado por IA" : "¿IA?"}
      </button>
    </div>
  );
}

// ============================================================================
// Acciones libres SIEMPRE disponibles para CEO y closer asignado.
// Estos botones NO se atan al estado del workflow (Notificado / Contactado /
// Recordatorio) — el CEO o el closer pueden mandar caso de éxito o
// recordatorio de cita en cualquier momento, con el lead en cualquier
// estado (scheduled, won, lost, cancelled, no_show) y venga de la landing
// o se haya añadido manualmente.
// ============================================================================
function AlwaysAvailableCallActions({
  lead,
  currentUser,
  sendCaseProps,
}: {
  lead: Lead;
  currentUser: { id: string; fullName: string; role: string };
  sendCaseProps: SendCaseProps;
}) {
  const router = useRouter();
  const [sendingTemplate, setSendingTemplate] = useState<SendCaseTemplate | null>(null);

  // Permisos:
  //   - CEO: siempre.
  //   - Closer: solo si es el closer asignado a este lead.
  //   - Head success: por ahora fuera (si lo quieres dentro, se abre).
  const canUse =
    currentUser.role === "ceo" ||
    (currentUser.role === "closer" && lead.closer?.id === currentUser.id);
  if (!canUse) return null;

  const hasCaseTemplates = sendCaseProps.successCaseTemplates.length > 0;
  const hasReminderTemplates = sendCaseProps.meetingReminderTemplates.length > 0;
  if (!hasCaseTemplates && !hasReminderTemplates) return null;

  const caseAlreadySent = !!lead.closerContactedAt;
  const reminderAlreadySent = !!lead.reminderSentAt;

  async function markCaseSent() {
    // Idempotente: si ya está marcado, el endpoint devuelve alreadyDone.
    await fetch(`/api/leads/${lead.id}/mark-closer-contacted`, { method: "POST" }).catch(() => null);
    router.refresh();
  }
  async function markReminderSent() {
    await fetch(`/api/leads/${lead.id}/mark-reminder-sent`, { method: "POST" }).catch(() => null);
    router.refresh();
  }

  const caseBtnClass = caseAlreadySent
    ? "text-xs font-medium px-2.5 py-1 rounded-md border bg-emerald-50 border-emerald-300 text-emerald-800 hover:bg-emerald-100"
    : "text-xs font-medium px-2.5 py-1 rounded-md border border-neutral-200 bg-white hover:bg-neutral-50";

  return (
    <>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {sendCaseProps.successCaseTemplates.map((t) => (
          <button
            key={`case-${t.id}`}
            onClick={(e) => {
              e.stopPropagation();
              setSendingTemplate(t);
            }}
            className={caseBtnClass}
            title={
              caseAlreadySent
                ? "Ya enviado. Pulsa para reenviar."
                : `Abre WhatsApp de ${lead.fullName} con esta plantilla`
            }
          >
            {caseAlreadySent ? "✅" : "📤"} {t.name}
          </button>
        ))}
        {sendCaseProps.meetingReminderTemplates.map((t) => (
          <SendDirectButton
            key={`rem-${t.id}`}
            template={t}
            alreadySent={reminderAlreadySent}
            onSent={markReminderSent}
            target={{
              leadName: lead.fullName.split(" ")[0],
              leadPhone: lead.phone,
              closerFullName: currentUser.fullName,
              closerIntro: sendCaseProps.currentUserCloserIntro,
              callDate: new Date(lead.callScheduledAt),
              meetingUrl: lead.meetingUrl,
            }}
          />
        ))}
      </div>
      {sendingTemplate && (
        <SendCaseFlow
          open={true}
          onClose={() => setSendingTemplate(null)}
          template={sendingTemplate}
          onSent={markCaseSent}
          target={{
            leadName: lead.fullName.split(" ")[0],
            leadPhone: lead.phone,
            closerFullName: currentUser.fullName,
            closerIntro: sendCaseProps.currentUserCloserIntro,
            callDate: new Date(lead.callScheduledAt),
            meetingUrl: lead.meetingUrl,
          }}
          cases={sendCaseProps.successCases}
        />
      )}
    </>
  );
}

// ============================================================================
// Botones de acción rápida del workflow comercial
// ============================================================================
function WorkflowActionButtons({
  lead,
  currentUser,
  sendCaseProps,
}: {
  lead: Lead;
  currentUser: { id: string; fullName: string; role: string };
  sendCaseProps: SendCaseProps;
}) {
  const [loading, setLoading] = useState(false);
  const [sendingTemplate, setSendingTemplate] = useState<SendCaseTemplate | null>(null);

  async function markSetterNotified(e: React.MouseEvent) {
    e.stopPropagation();
    if (loading) return;
    setLoading(true);
    await fetch(`/api/leads/${lead.id}/mark-setter-notified`, { method: "POST" });
    window.location.reload();
  }

  async function markCloserContacted(e: React.MouseEvent) {
    e.stopPropagation();
    if (loading) return;
    setLoading(true);
    await fetch(`/api/leads/${lead.id}/mark-closer-contacted`, { method: "POST" });
    window.location.reload();
  }

  async function markReminderSent(e: React.MouseEvent) {
    e.stopPropagation();
    if (loading) return;
    setLoading(true);
    await fetch(`/api/leads/${lead.id}/mark-reminder-sent`, { method: "POST" });
    window.location.reload();
  }

  // Setter: ve botón "Avisado" cuando aún no se ha marcado
  if (
    (currentUser.role === "setter" || currentUser.role === "ceo" || currentUser.role === "head_success") &&
    lead.source === "landing" &&
    !lead.setterNotifiedAt
  ) {
    return (
      <div className="mt-2">
        <button
          onClick={markSetterNotified}
          disabled={loading}
          className="text-xs font-medium px-2.5 py-1 rounded-md"
          style={{ background: "#0A0A0A", color: "#FAFAFA" }}
        >
          ✓ Avisado (notificar al closer)
        </button>
      </div>
    );
  }

  // Closer asignado: ve "Caso enviado" cuando ya está avisado pero no contactado.
  // Junto al checkbox de marcar como completado, añadimos un botón "📤 Enviar"
  // por cada plantilla con actionType=send_success_case que abre el selector
  // de caso y manda al WhatsApp del lead.
  if (
    (currentUser.role === "closer" || currentUser.role === "ceo") &&
    lead.closer?.id === currentUser.id &&
    lead.setterNotifiedAt &&
    !lead.closerContactedAt
  ) {
    // Los botones "📤 (plantilla)" ya los pinta AlwaysAvailableCallActions
    // arriba, así que aquí solo dejamos el check de "Caso enviado" para no
    // duplicar la fila y mantener el orden visual (plantillas primero,
    // check de workflow después).
    return (
      <div className="mt-2 flex flex-wrap gap-1.5">
        <button
          onClick={markCloserContacted}
          disabled={loading}
          className="text-xs font-medium px-2.5 py-1 rounded-md"
          style={{ background: "#0A0A0A", color: "#FAFAFA" }}
        >
          ✓ Caso de éxito enviado
        </button>
      </div>
    );
  }

  // Closer asignado: ve "Recordatorio enviado" si está contactado, sin recordatorio, y cita es mañana
  if (
    (currentUser.role === "closer" || currentUser.role === "ceo") &&
    lead.closer?.id === currentUser.id &&
    lead.closerContactedAt &&
    !lead.reminderSentAt
  ) {
    const callDate = new Date(lead.callScheduledAt);
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(0, 0, 0, 0);
    const tomorrowEnd = new Date(tomorrow);
    tomorrowEnd.setHours(23, 59, 59, 999);
    if (callDate >= tomorrow && callDate <= tomorrowEnd) {
      return (
        // Los botones de "📤 Enviar recordatorio" también los pinta ya
        // AlwaysAvailableCallActions. Aquí solo dejamos el check.
        <div className="mt-2 flex flex-wrap gap-1.5">
          <button
            onClick={markReminderSent}
            disabled={loading}
            className="text-xs font-medium px-2.5 py-1 rounded-md"
            style={{ background: "#0A0A0A", color: "#FAFAFA" }}
          >
            ✓ Recordatorio enviado
          </button>
        </div>
      );
    }
  }

  return null;
}

// ============================================================================
// Modal de edición: datos del lead + resultado
// ============================================================================

function CallEditModal({
  lead,
  currentUser,
  closers,
  onClose,
  onSaved,
  onConvert,
}: {
  lead: Lead;
  currentUser: { id: string; fullName: string; role: string };
  closers: Pro[];
  onClose: () => void;
  onSaved: () => void;
  onConvert: (lead: Lead) => void;
}) {
  // Datos editables del lead (closer ya puede editar todo)
  const [fullName, setFullName] = useState(lead.fullName);
  const [email, setEmail] = useState(lead.email ?? "");
  const [phone, setPhone] = useState(lead.phone ?? "");
  const [aiSummary, setAiSummary] = useState(lead.aiSummary ?? "");
  const [meetingUrl, setMeetingUrl] = useState(lead.meetingUrl ?? "");
  const [callScheduledAt, setCallScheduledAt] = useState(
    utcIsoToDatetimeLocalInput(lead.callScheduledAt)
  );
  const [closerId, setCloserId] = useState(lead.closer?.id ?? "");

  // Resultado
  const [status, setStatus] = useState(lead.status);
  const [lostReason, setLostReason] = useState(lead.lostReason ?? "precio");
  const [inFollowUp, setInFollowUp] = useState(lead.inFollowUp);
  const [followUpNote, setFollowUpNote] = useState(lead.followUpNote ?? "");
  const [aiScheduled, setAiScheduled] = useState(lead.aiScheduled);

  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    const meetingUrlChanged = (meetingUrl || "") !== (lead.meetingUrl ?? "");
    await fetch("/api/leads", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: lead.id,
        fullName,
        email,
        phone,
        aiSummary,
        meetingUrl: meetingUrl.trim() || null,
        callScheduledAt: datetimeLocalInputToUtcIso(callScheduledAt),
        closerId: closerId || null,
        status,
        ...(status === "lost" && { lostReason }),
        inFollowUp,
        followUpNote,
        aiScheduled,
      }),
    });
    // Si el link de Meet cambió, invalidamos el resumen anterior para que el
    // próximo tick del cron (o un manual=1) baje el transcript del Meet nuevo.
    // Solo pedimos regeneración forzada; el propio endpoint la ejecuta al vuelo.
    if (meetingUrlChanged && meetingUrl.includes("meet.google.com")) {
      fetch(`/api/admin/leads/${lead.id}/fix-meeting-url?url=${encodeURIComponent(meetingUrl.trim())}`, { method: "POST" }).catch(() => {});
    }
    onSaved();
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl max-w-lg w-full p-4 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex justify-between items-center mb-4">
          <h3 className="font-medium">Llamada · {lead.fullName}</h3>
          <button onClick={onClose} className="text-neutral-400 text-xl">✕</button>
        </div>

        <div className="space-y-3">
          {/* Datos del lead - editables */}
          <div>
            <label className="text-xs text-neutral-500 block mb-1">Nombre completo</label>
            <input className="input text-sm" value={fullName} onChange={(e) => setFullName(e.target.value)} />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs text-neutral-500 block mb-1">📞 Teléfono</label>
              <input
                type="tel"
                className="input text-sm"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+34 600 000 000"
              />
            </div>
            <div>
              <label className="text-xs text-neutral-500 block mb-1">✉️ Email</label>
              <input
                type="email"
                className="input text-sm"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="correo@ejemplo.com"
              />
            </div>
          </div>

          {/* País del lead (declarado en la landing). Solo lectura: bandera + nombre + prefijo,
              para que el equipo sepa desde dónde llama y evite mala interpretación del móvil. */}
          {lead.country && (() => {
            const c = findCountry(lead.country);
            const flag = c ? countryFlag(c.iso2) : "🌍";
            const label = c?.label ?? lead.country;
            const dial = c?.dialCode ?? "";
            return (
              <div className="rounded-lg px-3 py-2 flex items-center gap-2" style={{ background: "#F9FAFB", border: "1px solid #E5E7EB" }}>
                <span className="text-lg leading-none">{flag}</span>
                <div className="text-xs">
                  <div className="text-neutral-500">País</div>
                  <div className="font-medium">
                    {label}{dial && <span className="text-neutral-500 ml-1 tabular-nums">({dial})</span>}
                  </div>
                </div>
              </div>
            );
          })()}

          <div>
            <label className="text-xs text-neutral-500 block mb-1">Resumen de la conversación</label>
            <textarea className="input text-sm" rows={3} value={aiSummary} onChange={(e) => setAiSummary(e.target.value)} />
          </div>

          {/* Link de Google Meet editable. Si el paciente agendó dos veces o
              hubo lío con el calendar y el resumen IA salió como "sin transcripción",
              cambia aquí el link al Meet correcto y al guardar se regenera. */}
          <div>
            <label className="text-xs text-neutral-500 block mb-1 flex items-center justify-between">
              <span>🎥 Link de Google Meet</span>
              {meetingUrl && (
                <a
                  href={meetingUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[10px] font-medium underline text-emerald-700"
                >
                  Abrir
                </a>
              )}
            </label>
            <input
              type="url"
              className="input text-sm"
              value={meetingUrl}
              onChange={(e) => setMeetingUrl(e.target.value)}
              placeholder="https://meet.google.com/xxx-xxxx-xxx"
            />
            <p className="text-[10px] text-neutral-500 mt-1">
              Al guardar con un link nuevo se regenera el resumen IA con la transcripción de ese Meet.
            </p>
          </div>

          {/* Cuestionario rellenado en la landing (solo lectura) */}
          {(lead.motivo || lead.tratamientosPrevios || lead.impactoCrossfit || lead.meetingUrl) && (
            <div className="rounded-lg p-3" style={{ background: "#F0FDF4", border: "1px solid #BBF7D0" }}>
              <div className="flex items-center gap-2 mb-2">
                <span className="text-[10px] font-bold tracking-wider px-1.5 py-0.5 rounded" style={{ background: "#15803D", color: "#FFFFFF" }}>
                  LANDING
                </span>
                <span className="text-xs font-medium" style={{ color: "#065F46" }}>
                  Cuestionario rellenado por el lead
                </span>
              </div>
              {lead.meetingUrl && (
                <div className="text-xs mb-2">
                  <a href={lead.meetingUrl} target="_blank" rel="noopener noreferrer" className="underline" style={{ color: "#065F46" }}>
                    🔗 Abrir Google Meet
                  </a>
                </div>
              )}
              {lead.motivo && (
                <div className="text-xs mb-2">
                  <strong>Motivo:</strong>
                  <p className="whitespace-pre-wrap mt-0.5" style={{ color: "#1F2937" }}>{lead.motivo}</p>
                </div>
              )}
              {lead.tratamientosPrevios && (
                <div className="text-xs mb-2">
                  <strong>Tratamientos previos:</strong>
                  <p className="whitespace-pre-wrap mt-0.5" style={{ color: "#1F2937" }}>{lead.tratamientosPrevios}</p>
                </div>
              )}
              {lead.impactoCrossfit && (
                <div className="text-xs">
                  <strong>Impacto en CrossFit:</strong>
                  <p className="whitespace-pre-wrap mt-0.5" style={{ color: "#1F2937" }}>{lead.impactoCrossfit}</p>
                </div>
              )}
            </div>
          )}

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs text-neutral-500 block mb-1">Fecha y hora de llamada</label>
              <input type="datetime-local" className="input text-sm" value={callScheduledAt} onChange={(e) => setCallScheduledAt(e.target.value)} />
            </div>
            <div>
              <label className="text-xs text-neutral-500 block mb-1">Closer asignado</label>
              <select className="input text-sm" value={closerId} onChange={(e) => setCloserId(e.target.value)}>
                <option value="">— Sin asignar —</option>
                {closers.map((c) => (
                  <option key={c.id} value={c.id}>{c.fullName}{c.role === "ceo" ? " (CEO)" : ""}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Resultado */}
          <div className="pt-3 border-t border-neutral-200">
            <label className="text-xs text-neutral-500 block mb-1">Resultado</label>
            <div className="grid grid-cols-1 gap-1">
              {STATUS_TABS.map((tab) => (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => { setStatus(tab.key); setInFollowUp(false); }}
                  className={`px-3 py-2 text-xs rounded border font-medium text-left ${
                    !inFollowUp && status === tab.key ? "bg-neutral-900 text-white border-neutral-900" : "bg-white border-neutral-200 hover:bg-neutral-50"
                  }`}
                >
                  {tab.label}
                </button>
              ))}
              <button
                type="button"
                onClick={() => { setInFollowUp(true); setStatus("scheduled"); }}
                className={`px-3 py-2 text-xs rounded border font-medium text-left ${
                  inFollowUp ? "bg-blue-600 text-white border-blue-600" : "bg-white border-neutral-200 hover:bg-neutral-50"
                }`}
              >
                🔁 En follow-up
              </button>
            </div>
            {inFollowUp && !lead.inFollowUp && (
              <p className="text-[11px] text-neutral-500 mt-1.5 italic">
                Se generarán automáticamente fechas de seguimiento a 24h, 48-72h, 30d y 90d (editables en la vista de follow-up).
              </p>
            )}
          </div>

          {status === "lost" && !inFollowUp && (
            <div>
              <label className="text-xs text-neutral-500 block mb-1">Razón</label>
              <select className="input text-sm" value={lostReason} onChange={(e) => setLostReason(e.target.value)}>
                {LOST_REASONS.map((r) => (
                  <option key={r.value} value={r.value}>{r.label}</option>
                ))}
              </select>
            </div>
          )}

          {inFollowUp && (
            <div>
              <label className="text-xs text-neutral-500 block mb-1">Situación / objeciones</label>
              <textarea
                className="input text-sm"
                rows={3}
                value={followUpNote}
                onChange={(e) => setFollowUpNote(e.target.value)}
                placeholder="¿Qué objeciones tiene? ¿Qué necesita para cerrar?"
              />
            </div>
          )}

          {/* Trazabilidad: ¿agendado por IA? — para métricas a futuro */}
          <label className="flex items-center gap-2 text-sm cursor-pointer pt-1">
            <input
              type="checkbox"
              checked={aiScheduled}
              onChange={(e) => setAiScheduled(e.target.checked)}
              className="w-4 h-4 accent-violet-600"
            />
            <span>🤖 Agendado por IA</span>
          </label>

          <div className="flex justify-between items-center gap-2 pt-2 flex-wrap">
            <div className="flex items-center gap-3">
              <button
                onClick={async () => {
                  if (!window.confirm(`¿Seguro que quieres borrar el lead "${lead.fullName}"? Esta acción no se puede deshacer.`)) return;
                  const res = await fetch(`/api/leads?id=${lead.id}`, { method: "DELETE" });
                  if (res.ok) {
                    onSaved();
                  } else {
                    const data = await res.json().catch(() => ({}));
                    alert(data.error || "No se pudo borrar el lead");
                  }
                }}
                className="text-xs text-red-600 hover:underline"
              >
                🗑️ Borrar lead
              </button>
              <RescheduleLinkButton leadId={lead.id} leadStatus={lead.status} />
            </div>
            <div className="flex gap-2">
              {status !== "lost" && !lead.convertedPatient && (
                <button onClick={() => onConvert(lead)} className="btn btn-accent text-sm">
                  💳 Generar link de pago
                </button>
              )}
              <button onClick={save} disabled={saving} className="btn btn-primary text-sm">
                {saving ? "Guardando..." : "Guardar"}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function ConvertModal({
  lead,
  fisios,
  onClose,
  onSaved,
}: {
  lead: Lead;
  fisios: Pro[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [assignedProfessionalId, setAssignedProfessionalId] = useState("");
  const [amountPaid, setAmountPaid] = useState("");
  const [subscriptionPeriodMonths, setSubscriptionPeriodMonths] = useState("4");
  const [programType, setProgramType] = useState("RECUPERA");
  // Email: si el lead vino con contactType=email, lo precargamos
  const [email, setEmail] = useState(lead.contactType === "email" ? lead.contactValue : "");
  const [phone, setPhone] = useState(lead.contactType === "phone" ? lead.contactValue : "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function save() {
    setError("");
    if (!amountPaid) {
      setError("Falta el importe");
      return;
    }
    if (!email.trim()) {
      setError("El email es obligatorio para que el paciente pueda hacer login");
      return;
    }
    setSaving(true);
    const res = await fetch("/api/leads/convert", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        leadId: lead.id,
        assignedProfessionalId: assignedProfessionalId || null,
        amountPaid,
        subscriptionPeriodMonths,
        programType,
        email: email.trim(),
        phone: phone.trim() || null,
      }),
    });
    if (res.ok) {
      onSaved();
    } else {
      const data = await res.json().catch(() => ({}));
      setError(data.error || "No se pudo convertir el lead");
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl max-w-md w-full p-4 max-h-[92vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex justify-between items-center mb-1">
          <h3 className="font-medium">💳 Generar link de pago</h3>
          <button onClick={onClose} className="text-neutral-400 text-xl">✕</button>
        </div>
        <p className="text-xs text-neutral-500 mb-4">{lead.fullName} se dará de alta como paciente.</p>

        <div className="space-y-3">
          <div>
            <label className="text-xs text-neutral-500 block mb-1">Email del paciente *</label>
            <input
              type="email"
              className="input text-sm w-full"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="paciente@ejemplo.com"
            />
            <p className="text-[10px] text-neutral-500 mt-0.5 italic">
              Necesario para que el paciente entre a la app. Único en todo el sistema.
            </p>
          </div>

          <div>
            <label className="text-xs text-neutral-500 block mb-1">Teléfono (opcional)</label>
            <input
              type="tel"
              className="input text-sm w-full"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="+34 600000000"
            />
          </div>

          <div>
            <label className="text-xs text-neutral-500 block mb-1">Fisio asignado</label>
            <select className="input text-sm w-full" value={assignedProfessionalId} onChange={(e) => setAssignedProfessionalId(e.target.value)}>
              <option value="">— Sin asignar (lo asigna luego un manager) —</option>
              {fisios.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.role === "head_success" ? "⭐ " : "🩺 "}{f.fullName}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-xs text-neutral-500 block mb-1">Programa contratado</label>
            <div className="flex gap-1">
              {["RECUPERA", "CONSOLIDA", "ADVANCE"].map((p) => (
                <button
                  key={p}
                  onClick={() => setProgramType(p)}
                  className={`flex-1 text-xs px-2 py-2 rounded border font-medium ${
                    programType === p ? "bg-neutral-900 text-white border-neutral-900" : "bg-white border-neutral-200"
                  }`}
                >
                  {p}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs text-neutral-500 block mb-1">Duración (meses)</label>
              <select className="input text-sm w-full" value={subscriptionPeriodMonths} onChange={(e) => setSubscriptionPeriodMonths(e.target.value)}>
                <option value="1">1 mes</option><option value="2">2 meses</option><option value="3">3 meses</option>
                <option value="4">4 meses</option><option value="5">5 meses</option><option value="6">6 meses</option>
                <option value="7">7 meses</option><option value="8">8 meses</option><option value="9">9 meses</option>
                <option value="10">10 meses</option><option value="11">11 meses</option><option value="12">12 meses</option>
              </select>
            </div>
            <div>
              <label className="text-xs text-neutral-500 block mb-1">Importe (€) *</label>
              <input type="number" step="0.01" min="0" className="input text-sm w-full" value={amountPaid} onChange={(e) => setAmountPaid(e.target.value)} placeholder="0,00" />
            </div>
          </div>

          <p className="text-[11px] text-neutral-500 italic">
            💡 Se registra automáticamente como ingreso "Nueva alta" en Finanzas.
          </p>

          {error && (
            <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
              {error}
            </div>
          )}

          <button onClick={save} disabled={!amountPaid || !email.trim() || saving} className="btn btn-accent w-full">
            {saving ? "Procesando..." : "Confirmar conversión"}
          </button>
        </div>
      </div>
    </div>
  );
}

function AddCallModal({
  currentUser,
  closers,
  onClose,
  onSaved,
}: {
  currentUser: { id: string; fullName: string; role: string };
  closers: Pro[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [aiSummary, setAiSummary] = useState("");
  const [callScheduledAt, setCallScheduledAt] = useState(() => nowPlusHoursForInput(1));
  const [closerId, setCloserId] = useState(currentUser.role === "closer" ? currentUser.id : currentUser.id);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function save() {
    setError("");
    if (!fullName.trim() || (!email.trim() && !phone.trim()) || !callScheduledAt) {
      setError("Nombre, fecha, y al menos un email o teléfono son obligatorios");
      return;
    }
    setSaving(true);
    const res = await fetch("/api/leads", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        fullName: fullName.trim(),
        contactType: phone.trim() ? "phone" : "email",
        contactValue: (phone.trim() || email.trim()),
        email: email.trim() || null,
        phone: phone.trim() || null,
        aiSummary: aiSummary.trim() || null,
        callScheduledAt: datetimeLocalInputToUtcIso(callScheduledAt),
        closerId: closerId || null,
      }),
    });
    if (res.ok) {
      onSaved();
    } else {
      const data = await res.json().catch(() => ({}));
      setError(data.error || "No se pudo crear");
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl max-w-md w-full p-5 max-h-[92vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex justify-between items-center mb-1">
          <h3 className="font-semibold">+ Nueva llamada</h3>
          <button onClick={onClose} className="text-neutral-400 text-xl leading-none">✕</button>
        </div>
        <p className="text-xs text-neutral-500 mb-4">
          Programa una nueva llamada de cierre. El lead se creará automáticamente.
        </p>

        <div className="space-y-3">
          <div>
            <label className="text-xs text-neutral-500 block mb-1">Nombre completo *</label>
            <input
              type="text"
              autoFocus
              className="input text-sm w-full"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="Ej. Juan Pérez"
            />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs text-neutral-500 block mb-1">📞 Teléfono *</label>
              <input
                type="tel"
                className="input text-sm w-full"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+34 600 000 000"
              />
            </div>
            <div>
              <label className="text-xs text-neutral-500 block mb-1">✉️ Email *</label>
              <input
                type="email"
                className="input text-sm w-full"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="correo@ejemplo.com"
              />
            </div>
          </div>

          <div>
            <label className="text-xs text-neutral-500 block mb-1">Fecha y hora de la llamada *</label>
            <input
              type="datetime-local"
              className="input text-sm w-full"
              value={callScheduledAt}
              onChange={(e) => setCallScheduledAt(e.target.value)}
            />
          </div>

          {/* Selector de closer solo para CEO (la closer queda fija a sí misma) */}
          {currentUser.role === "ceo" && closers.length > 1 && (
            <div>
              <label className="text-xs text-neutral-500 block mb-1">Asignada a (closer)</label>
              <select
                className="input text-sm w-full"
                value={closerId}
                onChange={(e) => setCloserId(e.target.value)}
              >
                {closers.map((c) => (
                  <option key={c.id} value={c.id}>{c.fullName}</option>
                ))}
              </select>
            </div>
          )}

          <div>
            <label className="text-xs text-neutral-500 block mb-1">Resumen IA / Notas (opcional)</label>
            <textarea
              className="input text-sm w-full"
              value={aiSummary}
              onChange={(e) => setAiSummary(e.target.value)}
              rows={3}
              placeholder="Qué le duele, qué espera, info relevante..."
            />
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}

          <button
            onClick={save}
            disabled={saving}
            className="w-full text-sm font-medium"
            style={{
              background: "#0A0A0A",
              color: "#FAFAFA",
              padding: 11,
              borderRadius: 10,
              border: "none",
              opacity: saving ? 0.5 : 1,
            }}
          >
            {saving ? "Guardando..." : "Crear llamada"}
          </button>
        </div>
      </div>
    </div>
  );
}
