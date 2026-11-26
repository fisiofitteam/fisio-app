import { prisma } from "@/lib/prisma";
import type { ActiveProfessional } from "@/lib/session";
import { canAccessEvidencePatient } from "@/lib/patient-evidence";
import { batterySessionSelect, resolveShoulderBattery } from "@/lib/shoulder-battery-server";
import { groupShoulderBatteries } from "@/lib/shoulder-battery";
import { GUIDE_VERSION, supportPermissions } from "./guide";
import type { SupportContext } from "./contracts";

import { screenFor } from "./screen";

export async function buildSupportContext(actor: ActiveProfessional, path: string): Promise<SupportContext> {
  const out: SupportContext = {
    screen: screenFor(path), route: path.replace(/(\/paciente\/|\/valoraciones\/)[^/]+/g, "$1[id]"),
    checked: false, facts: [], roles: [actor.role, ...actor.extraRoles], permissions: supportPermissions(actor),
    guideVersion: GUIDE_VERSION, release: process.env.VERCEL_GIT_COMMIT_SHA || "local",
  };
  // Unknown dynamic routes are not sent to the provider. No query strings, DOM,
  // forms, names, notes, videos, credentials or clinical measurements are read.
  if (!/^\/fisio\/(paciente|valoraciones)\//.test(path)) out.route = "/fisio/" + (path.split("/")[2] ?? "");
  if (actor.impersonating) out.facts.push("Sesión en modo de suplantación; se aplican los permisos del profesional mostrado.");
  const patientMatch = path.match(/^\/fisio\/paciente\/([a-zA-Z0-9_-]+)(?:\/|$)/);
  const reviewMatch = path.match(/^\/fisio\/valoraciones\/([a-zA-Z0-9_-]+)(?:\/|$)/);
  try {
    if (reviewMatch && out.permissions.clinical) {
      const session = await prisma.programSession.findUnique({ where: { id: reviewMatch[1] }, select: batterySessionSelect });
      if (!session || !await canAccessEvidencePatient(session.assignment.patientId, actor)) {
        out.facts.push("No se ha podido comprobar esta valoración con los permisos actuales.");
        return out;
      }
      const battery = await resolveShoulderBattery(session);
      out.checked = true;
      if (!battery) out.facts.push("No se reconoce una batería completa y no ambigua de 15 tests para esta sesión.");
      else {
        const [videos, review] = await Promise.all([
          prisma.assessmentVideo.findMany({ where: { patientId: session.assignment.patientId, sessionId: { in: battery.sessions.map(s => s.id) }, url: { not: null }, uploadedAt: { not: null } }, select: { id: true, sessionId: true, taskId: true, testId: true, uploadedAt: true } }),
          prisma.shoulderPilotReview.findUnique({ where: { sessionId: battery.session.id }, select: { reviewedJson: true, publishedAt: true, version: true } }),
        ]);
        const valid = videos.filter(v => battery.sources.get(v.testId)?.sessionId === v.sessionId && battery.sources.get(v.testId)?.taskId === v.taskId);
        let reviewed = 0;
        try {
          const marks = JSON.parse(review?.reviewedJson ?? "{}");
          reviewed = [...battery.refs.keys()].filter(id => marks[id] && marks[id].source === (valid.find(v => v.testId === id) ? valid.find(v => v.testId === id)!.id + "@" + valid.find(v => v.testId === id)!.uploadedAt!.toISOString() : null)).length;
        } catch { /* Unknown review state stays unconfirmed. */ }
        out.facts.push(`Batería reconocida: 15 tests en ${battery.sessions.length} sesiones de origen.`,
          `${new Set(valid.map(v => v.testId)).size}/15 vídeos entregados.`, `${reviewed}/15 marcas de revisión vinculadas a la entrega actual.`,
          review?.publishedAt ? "Existe un informe publicado; el atleta ve esa versión." : "No hay informe publicado; el borrador sigue siendo privado.");
      }
    } else if (patientMatch) {
      if (!await canAccessEvidencePatient(patientMatch[1], actor)) {
        out.facts.push("No se ha podido comprobar la ficha con los permisos actuales."); return out;
      }
      out.checked = true;
      out.facts.push("Acceso clínico a esta ficha comprobado.");
      if (path.endsWith("/valoraciones")) {
        const sessions = await prisma.programSession.findMany({
          where: { assignment: { patientId: patientMatch[1] }, tasksSnapshot: { contains: "ASSESSMENT" },
            OR: [{ scheduledDate: { lte: new Date() } }, { assessmentVideos: { some: { url: { not: null } } } }] },
          select: batterySessionSelect, orderBy: { scheduledDate: "desc" }, take: 60,
        });
        out.facts.push(`En las últimas ${sessions.length} sesiones de valoración actuales o con entregas, se reconocen ${groupShoulderBatteries(sessions).length} baterías completas de hombro. La consulta está limitada a 60 sesiones; no prueba que no existan más.`);
      }
    } else {
      out.checked = true;
      out.facts.push("Roles y permisos comprobados en la sesión activa. No se ha inspeccionado el estado de botones ni formularios del navegador.");
      if (out.screen === "Grabaciones") out.facts.push(process.env.RECORDINGS_BLOB_READ_WRITE_TOKEN || process.env.ASSESSMENT_BLOB_READ_WRITE_TOKEN ? "Almacenamiento de grabaciones configurado." : "Almacenamiento de grabaciones no configurado.");
    }
  } catch {
    out.checked = false;
    out.facts = ["No se ha podido completar la comprobación de estado. No atribuir el problema a una causa concreta sin verificarla."];
  }
  return out;
}
