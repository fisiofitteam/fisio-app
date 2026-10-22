import Link from "next/link";
import { ChevronDown } from "lucide-react";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { canAccessEvidencePatient } from "@/lib/patient-evidence";
import { weekStartUtc } from "@/lib/weekly-reports";
import { collectWeekExtras, extrasInWeek } from "@/lib/weekly-evidence";
import { RefreshPatientWeek } from "@/components/RefreshPatientWeek";
export const dynamic = "force-dynamic";
const DAY = 86400000;
function dateLabel(value: string | Date) { return new Date(value).toLocaleDateString("es-ES", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }); }
export default async function HistoryPage({ params, searchParams }: { params: { id: string }; searchParams: { page?: string } }) {
  if (!await canAccessEvidencePatient(params.id)) redirect("/fisio/pacientes");
  const page = Math.max(0, Math.min(500, Math.floor(Number(searchParams.page) || 0)));
  const current = weekStartUtc(new Date());
  const end = new Date(current.getTime() + 7 * DAY - page * 12 * 7 * DAY);
  const start = new Date(end.getTime() - 12 * 7 * DAY);
  const [reports, extras, sessions, advance] = await Promise.all([
    prisma.patientWeeklyReport.findMany({ where: { patientId: params.id, weekStartDate: { gte: start, lt: end } }, orderBy: { weekStartDate: "desc" } }),
    collectWeekExtras(params.id, start, end),
    prisma.programSession.findMany({ where: { assignment: { patientId: params.id }, completedAt: { gte: start, lt: end } },
      select: { id: true, completedAt: true, patientNotes: true, assignment: { select: { program: { select: { name: true } } } } }, orderBy: { completedAt: "asc" } }),
    prisma.advanceSessionLog.findMany({ where: { patientId: params.id, sessionDate: { gte: start, lt: end } },
      select: { id: true, sessionDate: true, patientNotes: true }, orderBy: { sessionDate: "asc" } }),
  ]);
  const weeks = Array.from({ length: 12 }, (_, i) => new Date(end.getTime() - (i + 1) * 7 * DAY)).map(monday => {
    const report = reports.find(r => r.weekStartDate.getTime() === monday.getTime());
    const data = extrasInWeek(extras, monday);
    const within = (d: Date) => d >= monday && d.getTime() < monday.getTime() + 7 * DAY;
    const rehab = sessions.filter(s => s.completedAt && within(s.completedAt));
    const adv = advance.filter(s => within(s.sessionDate));
    return { monday, report, data, rehab, adv };
  }).filter(w => w.report || w.rehab.length || w.adv.length || w.data.wods.length || w.data.forms.length || w.data.evidence.length);
  return <section className="space-y-3">
    <div><h2 className="text-lg font-semibold">Historial</h2><p className="text-sm text-neutral-500">Resumen semanal con readaptación, WODs, formularios y material del cliente.</p></div>
    {!weeks.length && <p className="card text-sm text-neutral-500">No hay actividad en este periodo.</p>}
    {weeks.map(({ monday, report, data, rehab, adv }) => {
      let h: any = {}; try { h = JSON.parse(report?.highlights || "{}"); } catch {}
      const updatedMaterial = report && data.evidence.some(e => new Date(e.date) > report.generatedAt);
      return <details key={monday.toISOString()} className="group/week rounded-xl border border-neutral-200 bg-white p-4 shadow-sm">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 [&::-webkit-details-marker]:hidden">
          <span className="min-w-0">
            <span className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-semibold">Resumen semanal</span>
              <span className={"rounded-full border px-2 py-0.5 text-[11px] " + (report ? "border-blue-200 bg-blue-50 text-blue-800" : "border-neutral-200 bg-neutral-50 text-neutral-600")}>{report ? "Resumen disponible" : "Pendiente de resumen"}</span>
            </span>
            <span className="mt-1 block text-xs text-neutral-500">{dateLabel(monday)} – {dateLabel(new Date(monday.getTime() + 6 * DAY))}</span>
            <span className="mt-2 flex flex-wrap gap-1.5 text-[11px] text-neutral-600">
              <span className="rounded-full border border-neutral-200 bg-neutral-50 px-2 py-0.5">{rehab.length + adv.length} sesiones</span>
              <span className="rounded-full border border-neutral-200 bg-neutral-50 px-2 py-0.5">{data.wods.length} WODs</span>
              <span className="rounded-full border border-neutral-200 bg-neutral-50 px-2 py-0.5">{data.forms.length} formularios</span>
              <span className="rounded-full border border-neutral-200 bg-neutral-50 px-2 py-0.5">{data.evidence.length} archivos</span>
            </span>
          </span>
          <ChevronDown size={18} aria-hidden="true" className="shrink-0 text-neutral-500 transition-transform group-open/week:rotate-180" />
        </summary>
        <div className="mt-3 border-t border-neutral-200 pt-3 space-y-4">
          {report ? <section className="rounded-xl border border-blue-200 bg-blue-50 p-3 text-blue-900"><h3 className="mb-2 text-xs font-semibold">📝 Resumen de la semana</h3><p className="text-sm leading-relaxed whitespace-pre-wrap break-words">{report.summary}</p><p className="text-[11px] text-blue-700 mt-2">Resumen guardado el {dateLabel(report.generatedAt)}</p></section> :
            <p className="text-sm text-neutral-500">Actividad registrada. El resumen se guardará en el proceso semanal; también puedes generarlo ahora.</p>}
          {updatedMaterial && <p className="text-xs text-amber-700">Hay material añadido después del resumen. Está disponible abajo; actualiza el resumen para incorporarlo al texto.</p>}
          <RefreshPatientWeek patientId={params.id} week={monday.toISOString().slice(0, 10)} />
          {Array.isArray(h.metrics) && h.metrics.filter((m: any) => m.samples > 0 && typeof m.avg === "number" && Number.isFinite(m.avg)).length > 0 && <div className="flex gap-2 flex-wrap">{h.metrics.filter((m: any) => m.samples > 0 && typeof m.avg === "number" && Number.isFinite(m.avg)).map((m: any) => <span key={m.key} className="rounded-full border border-neutral-200 bg-neutral-50 px-2 py-0.5 text-[11px]">{m.label}: {m.avg}</span>)}</div>}
          {(rehab.length > 0 || adv.length > 0) && <h3 className="border-t border-neutral-100 pt-3 text-[10px] uppercase tracking-wide font-semibold text-neutral-500">🏋️ Readaptación · Sensaciones registradas</h3>}
          {[...rehab.map(s => ({ id: s.id, date: s.completedAt!, title: s.assignment.program.name, notes: s.patientNotes })), ...adv.map(s => ({ id: s.id, date: s.sessionDate, title: "Sesión Advance", notes: s.patientNotes }))].map(s => <div key={s.id} className="text-sm border-l-2 border-amber-300 pl-3"><p className="font-medium">{dateLabel(s.date)} · {s.title}</p><p className="whitespace-pre-wrap text-neutral-600">{s.notes || "Sesión completada sin comentario."}</p></div>)}
          {data.wods.length > 0 && <h3 className="border-t border-neutral-100 pt-3 text-[10px] uppercase tracking-wide font-semibold text-neutral-500">🏃 WODs de la semana</h3>}
          {data.wods.map(w => <details key={w.id} className="rounded-lg border border-neutral-200 bg-neutral-50 p-3"><summary className="text-sm cursor-pointer">WOD · {dateLabel(w.date)}</summary><p className="text-xs whitespace-pre-wrap mt-2">{w.workout}</p>{w.notes && <p className="text-sm mt-2 whitespace-pre-wrap">{w.notes}</p>}<p className="text-xs text-neutral-500 mt-1">{w.painScore !== null && "Dolor: " + w.painScore + " "}{w.rpe !== null && "RPE: " + w.rpe}</p></details>)}
          {data.forms.length > 0 && <h3 className="border-t border-neutral-100 pt-3 text-[10px] uppercase tracking-wide font-semibold text-neutral-500">📝 Formularios de la semana</h3>}
          {data.forms.map(f => <details key={f.id} className="rounded-lg border border-neutral-200 bg-neutral-50 p-3"><summary className="text-sm cursor-pointer">{f.title} · {dateLabel(f.date)}</summary><dl className="text-sm space-y-2 mt-2">{f.answers.map((a, i) => <div key={i}><dt className="font-medium">{a.question}</dt><dd className="text-neutral-600 whitespace-pre-wrap">{a.answer}</dd></div>)}</dl></details>)}
          {data.evidence.length > 0 && <div><h3 className="border-t border-neutral-100 pt-3 text-[10px] uppercase tracking-wide font-semibold text-neutral-500 mb-2">📎 Material de esta semana</h3><div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">{data.evidence.map(e => <div key={e.id} className="border rounded-lg p-2">{e.kind === "video" && e.url && <video controls playsInline preload="metadata" src={e.url} className="w-full h-36 bg-neutral-900 rounded" />}{e.kind === "image" && e.url && <img src={e.url} alt={e.name} loading="lazy" className="w-full h-36 object-contain rounded" />}<a href={e.url || "#"} target="_blank" rel="noreferrer" className="text-xs underline break-words">{e.name}</a>{e.notes && <p className="text-xs whitespace-pre-wrap mt-1">{e.notes}</p>}</div>)}</div></div>}
        </div>
      </details>;
    })}
    <div className="flex justify-between text-sm pt-3">{page > 0 ? <Link href={"?page=" + (page - 1)}>← Más reciente</Link> : <span />}<span className="text-xs text-neutral-400">{dateLabel(start)} – {dateLabel(new Date(end.getTime() - DAY))}</span><Link href={"?page=" + (page + 1)}>Anterior →</Link></div>
  </section>;
}
