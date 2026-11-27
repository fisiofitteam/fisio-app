import { createHash, randomUUID } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { madridDay } from "@/lib/grok-ceo-contract";
import { collectEvidence } from "./evidence";
import { callGrok, MODEL, providerBody, ProviderError } from "./provider";
import { AGENT_IDS, AgentError, allFacts, budgetAllows, canTransition, deterministicReport, MONTHLY_BUDGET_MICROS, registry, REQUEST_RESERVE_MICROS, safeBusinessText, scopeEvidence, reportEvidenceViolations, reportSchema, type AgentId, type AgentReport, type Command, type Evidence } from "./contract";
const hash = (v: unknown) => createHash("sha256").update(JSON.stringify(v)).digest("hex");
const parse = <T,>(v: string | null, fallback: T): T => { try { return JSON.parse(v || "null") ?? fallback; } catch { return fallback; } };
const deps = (v: string) => parse<string[]>(v, []);
const monthKey = () => madridDay(new Date()).slice(0, 7);
const clean = safeBusinessText;
// Dependency injection is for synthetic integration tests only; routes never accept providers or tools from clients.
export function createAgentEngine(db = prisma, evidenceSource = collectEvidence, infer = callGrok) {
  const event = (tx: any, founderId: string, entityId: string, actor: string, action: string, detail: unknown) => tx.ceoAgentEvent.create({ data: { id: randomUUID(), founderId, entityId, actor, action, detailJson: JSON.stringify(detail) } });
  async function ensure(founderId: string) {
    await Promise.all(AGENT_IDS.map(agentId => db.ceoAgentConfig.upsert({ where: { founderId_agentId: { founderId, agentId } }, update: {}, create: { founderId, agentId, cadenceHours: registry[agentId].cadence } })));
  }
  async function enqueue(founderId: string, input: { agentId: AgentId; title: string; key: string; origin: string; priority?: number; dependencies?: string[]; parentId?: string; depth?: number }) {
    const requestHash = hash(input), existing = await db.ceoAgentTask.findUnique({ where: { founderId_requestKey: { founderId, requestKey: input.key } } });
    if (existing) { if (existing.requestHash !== requestHash) throw new AgentError("Identificador de encargo ya utilizado con otro contenido."); return existing; }
    const dependencies = [...new Set(input.dependencies || [])];
    if (dependencies.length) {
      const rows = await db.ceoAgentTask.findMany({ where: { founderId, id: { in: dependencies } }, select: { id: true } });
      if (rows.length !== dependencies.length) throw new AgentError("Dependencia fuera de este espacio o inexistente.", 400);
    }
    if (await db.ceoAgentTask.count({ where: { founderId, status: { in: ["queued", "running", "blocked"] } } }) >= 40) throw new AgentError("Hay 40 encargos pendientes. Resuelve la cola antes de añadir más.");
    // Dependencies can only reference already-created immutable tasks, so cycles cannot be introduced.
    try { return await db.$transaction(async tx => {
      const row = await tx.ceoAgentTask.create({ data: { id: randomUUID(), founderId, agentId: input.agentId, requestKey: input.key, requestHash, title: clean(input.title), origin: input.origin, priority: input.priority ?? 1, dependenciesJson: JSON.stringify(dependencies), parentId: input.parentId, depth: input.depth || 0 } });
      await event(tx, founderId, row.id, input.origin, "task_created", { agentId: row.agentId, dependencies }); return row;
    }); } catch (e: any) { if (e?.code === "P2002") { const row = await db.ceoAgentTask.findUnique({ where: { founderId_requestKey: { founderId, requestKey: input.key } } }); if (row?.requestHash === requestHash) return row; } throw e; }
  }
  async function memoryContext(founderId: string, agentId: AgentId) {
    const scope = { in: agentId === "ceo" ? ["shared", ...AGENT_IDS] : ["shared", agentId] };
    const [preferences, due, recent] = await Promise.all([
      db.ceoBusinessMemory.findMany({ where: { founderId, scope, author: "founder", kind: "preference", status: "approved" }, orderBy: { updatedAt: "desc" }, take: 6 }),
      db.ceoBusinessMemory.findMany({ where: { founderId, scope, status: { in: ["approved", "running"] }, reviewAt: { lte: new Date() } }, orderBy: { reviewAt: "asc" }, take: 6 }),
      db.ceoBusinessMemory.findMany({ where: { founderId, scope, status: { notIn: ["rejected", "quarantined"] } }, orderBy: { updatedAt: "desc" }, take: 6 }),
    ]);
    return [...new Map([...preferences, ...due, ...recent].map(r => [r.id, r])).values()].map(r => ({ id: r.id, kind: r.kind, scope: r.scope, title: r.title, detail: r.detail.slice(0, 350), status: r.status, author: r.author, metricKey: r.metricKey, baseline: r.baselineValue, target: r.targetValue, outcome: r.outcomeValue, outcomeNote: r.outcomeNote?.slice(0, 350), reviewAt: r.reviewAt?.toISOString() || null }));
  }
  async function reserve(founderId: string, runId: string) {
    const month = monthKey();
    return db.$transaction(async tx => {
      const b = await tx.ceoAgentBudget.upsert({ where: { founderId_month: { founderId, month } }, update: {}, create: { founderId, month } });
      if (!budgetAllows(b.spentMicros, b.reservedMicros, b.halted)) return false;
      // CAS makes concurrent workers contend on the same budget row; retry is explicit on conflict.
      const ok = await tx.ceoAgentBudget.updateMany({ where: { founderId, month, spentMicros: b.spentMicros, reservedMicros: b.reservedMicros, halted: false }, data: { reservedMicros: { increment: REQUEST_RESERVE_MICROS } } });
      if (!ok.count) return false;
      await tx.ceoAgentRun.update({ where: { id: runId }, data: { budgetMonth: month, reservedMicros: REQUEST_RESERVE_MICROS, model: MODEL } }); return true;
    }, { isolationLevel: "Serializable" });
  }
  async function settle(tx: any, run: { founderId: string; budgetMonth: string | null; reservedMicros: number }, usage?: { costMicros: number | null; inputTokens: number; outputTokens: number }, halt = false) {
    if (!run.budgetMonth || !run.reservedMicros) return { costMicros: 0, costKind: "none", inputTokens: 0, outputTokens: 0 };
    // Unknown outcomes consume the full reservation. Never refund a timeout: the provider may have billed it.
    const costMicros = usage?.costMicros ?? run.reservedMicros;
    await tx.ceoAgentBudget.update({ where: { founderId_month: { founderId: run.founderId, month: run.budgetMonth } }, data: { reservedMicros: { decrement: run.reservedMicros }, spentMicros: { increment: costMicros }, ...(halt || costMicros > run.reservedMicros ? { halted: true } : {}) } });
    return { costMicros, costKind: usage?.costMicros == null ? "conservative_reserve" : "provider", inputTokens: usage?.inputTokens || 0, outputTokens: usage?.outputTokens || 0 };
  }
  async function recoverExpired(founderId: string) {
    const rows = await db.ceoAgentTask.findMany({ where: { founderId, status: "running", leaseUntil: { lt: new Date() } } });
    for (const row of rows) await db.$transaction(async tx => {
      const ok = await tx.ceoAgentTask.updateMany({ where: { id: row.id, founderId, status: "running", leaseToken: row.leaseToken, leaseUntil: { lt: new Date() } }, data: { status: "failed", errorCode: "worker_interrupted", leaseToken: null, leaseUntil: null } });
      if (!ok.count) return;
      const run = await tx.ceoAgentRun.findFirst({ where: { founderId, taskId: row.id, status: "running" }, orderBy: { startedAt: "desc" } });
      if (run) await tx.ceoAgentRun.update({ where: { id: run.id }, data: { status: "failed", errorCode: "worker_interrupted", finishedAt: new Date(), ...await settle(tx, run) } });
      await event(tx, founderId, row.id, "system", "worker_interrupted", {});
    });
  }
  async function quarantineInvalidReports(founderId: string) {
    const runs = await db.ceoAgentRun.findMany({ where: { founderId, status: "completed", model: { in: [MODEL, "cached"] } }, orderBy: { startedAt: "desc" }, take: 100 });
    for (const run of runs) {
      const parsed = reportSchema.safeParse(parse(run.resultJson, null)), evidence = parse<Evidence>(run.evidenceJson, { version: 1, tools: {} });
      const violations = parsed.success ? reportEvidenceViolations(parsed.data, evidence) : ["invalid_report"];
      if (!violations.length) continue;
      await db.$transaction(async tx => {
        const ok = await tx.ceoAgentRun.updateMany({ where: { id: run.id, founderId, status: "completed" }, data: { status: "rejected", errorCode: "financial_evidence_validation" } });
        if (!ok.count) return;
        await tx.ceoAgentTask.updateMany({ where: { id: run.taskId, founderId, status: "done" }, data: { status: "failed", errorCode: "financial_evidence_validation" } });
        await tx.ceoBusinessMemory.updateMany({ where: { founderId, sourceRunId: run.id, status: "proposed" }, data: { status: "quarantined", outcomeNote: "Retirada automáticamente por control de calidad de evidencia; no aprobada ni ejecutada.", version: { increment: 1 } } });
        await event(tx, founderId, run.id, "system", "report_quarantined", { violations, originalPreserved: true });
      });
    }
  }
  async function dispatchCompleted(founderId: string) {
    const runs = await db.ceoAgentRun.findMany({ where: { founderId, status: "completed", dispatchedAt: null }, orderBy: { startedAt: "asc" }, take: 12 });
    for (const run of runs) {
      const task = await db.ceoAgentTask.findFirst({ where: { id: run.taskId, founderId, status: "done" } });
      if (!task) continue;
      const report = parse<AgentReport | null>(run.resultJson, null);
      if (run.model === MODEL && task.agentId === "ceo" && task.depth < 2 && !deps(task.dependenciesJson).length && report?.assignments.length) {
        const ids: string[] = [];
        for (const [i, a] of report.assignments.entries()) ids.push((await enqueue(founderId, { agentId: a.agentId, title: a.question, key: task.id + ":department:" + i, origin: "ceo", priority: task.priority, parentId: task.id, depth: task.depth + 1 })).id);
        await enqueue(founderId, { agentId: "ceo", title: "Sintetiza las conclusiones departamentales sobre: " + task.title.slice(0, 1400), key: task.id + ":synthesis", origin: "ceo", priority: task.priority, dependencies: ids, parentId: task.id, depth: task.depth + 1 });
      } else if (task.agentId !== "ceo" && task.origin === "founder" && !task.parentId) {
        await enqueue(founderId, { agentId: "ceo", title: "Revisa el informe de " + task.agentId.toUpperCase() + ", contrástalo con los objetivos y traslada una recomendación al fundador.", key: task.id + ":delivery", origin: "department_delivery", dependencies: [task.id], parentId: task.id, depth: 1 });
      }
      await db.ceoAgentRun.updateMany({ where: { id: run.id, founderId, dispatchedAt: null }, data: { dispatchedAt: new Date() } });
    }
  }
  async function processOne(founderId: string) {
    await ensure(founderId); await recoverExpired(founderId); await quarantineInvalidReports(founderId);
    await dispatchCompleted(founderId);
    const candidates = await db.ceoAgentTask.findMany({ where: { founderId, status: { in: ["queued", "blocked"] } }, orderBy: [{ priority: "desc" }, { createdAt: "asc" }], take: 40 });
    let task: typeof candidates[number] | undefined;
    for (const row of candidates) {
      const config = await db.ceoAgentConfig.findUnique({ where: { founderId_agentId: { founderId, agentId: row.agentId } } });
      if (!config?.enabled) continue;
      const dependencies = deps(row.dependenciesJson);
      const completed = dependencies.length ? await db.ceoAgentTask.count({ where: { founderId, id: { in: dependencies }, status: "done" } }) : 0;
      if (completed !== dependencies.length) { if (row.status !== "blocked") await db.ceoAgentTask.updateMany({ where: { id: row.id, founderId, status: "queued" }, data: { status: "blocked", errorCode: "dependencies_pending" } }); continue; }
      const token = randomUUID();
      const claimed = await db.ceoAgentTask.updateMany({ where: { id: row.id, founderId, status: row.status }, data: { status: "running", leaseToken: token, leaseUntil: new Date(Date.now() + 240000), errorCode: null, attempts: { increment: 1 } } });
      if (claimed.count) { task = { ...row, leaseToken: token }; break; }
    }
    if (!task) return { status: "idle" };
    const taskId = task.id, agentId = task.agentId as AgentId;
    let runId: string | null = null;
    try {
      const evidence = scopeEvidence(await evidenceSource(founderId, agentId), agentId);
      const [memory, config, recent, departmentRuns, messages] = await Promise.all([
        memoryContext(founderId, agentId), db.ceoAgentConfig.findUnique({ where: { founderId_agentId: { founderId, agentId } } }),
        db.ceoAgentRun.findMany({ where: { founderId, agentId, status: "completed" }, orderBy: { startedAt: "desc" }, take: 2 }),
        agentId === "ceo" ? db.ceoAgentRun.findMany({ where: { founderId, status: "completed", ...(deps(task.dependenciesJson).length ? { taskId: { in: deps(task.dependenciesJson) } } : { agentId: { not: "ceo" } }) }, orderBy: { startedAt: "desc" }, take: 6 }) : Promise.resolve([]),
        agentId === "ceo" ? db.ceoAgentMessage.findMany({ where: { founderId }, orderBy: { createdAt: "desc" }, take: 4 }) : Promise.resolve([]),
      ]);
      const digest = (value: string | null) => { const r = parse<AgentReport | null>(value, null); return r ? { summary: r.summary.slice(0, 800), findings: r.findings.slice(0, 3).map(x => x.slice(0, 250)), limitations: r.limitations.slice(0, 3).map(x => x.slice(0, 200)), learning: r.learning.slice(0, 400), recommendations: r.recommendations.map(x => ({ title: x.title, evidenceKeys: x.evidenceKeys })) } : null; };
      const context = { assignment: task.title, evidence, memory, preferences: config?.instructions || "", previousReviews: recent.map(r => ({ at: r.startedAt, report: digest(r.resultJson) })), departments: departmentRuns.map(r => ({ agentId: r.agentId, at: r.startedAt, model: r.model, report: digest(r.resultJson) })), conversation: messages.reverse().map(m => ({ text: m.text.slice(0, 1200), at: m.createdAt })) };
      const fingerprint = hash({ evidence: JSON.stringify(evidence).replace(/"asOf":"[^"]+"/g, '"asOf":null'), instructions: config?.instructions, memory: memory.filter(m => m.author === "founder" || m.status !== "proposed"), version: 1 });
      const cached = task.origin === "schedule" ? recent.find(r => r.fingerprint === fingerprint && r.model === MODEL && Date.now() - r.startedAt.getTime() < 7 * 86400000) : null;
      runId = randomUUID();
      await db.ceoAgentRun.create({ data: { id: runId, founderId, taskId, agentId, status: "running", fingerprint, evidenceJson: JSON.stringify(evidence) } });
      let report: AgentReport, mode = "evidence_only", usage: { costMicros: number | null; inputTokens: number; outputTokens: number } | undefined;
      if (cached?.resultJson) { report = parse(cached.resultJson, deterministicReport(evidence, agentId)); mode = "cached"; }
      else if (!process.env.XAI_API_KEY) report = deterministicReport(evidence, agentId);
      else {
        // Validate input size before reserving money or making a paid call.
        let body;
        try { body = providerBody(agentId, context); }
        catch (error) {
          if (!(error instanceof AgentError) || error.status !== 413) throw error;
          body = providerBody(agentId, { ...context, previousReviews: [], conversation: context.conversation.slice(-2), memory: context.memory.map(m => ({ ...m, detail: m.detail.slice(0, 160), outcomeNote: m.outcomeNote?.slice(0, 160) })), departments: context.departments.map(d => ({ ...d, report: d.report ? { summary: d.report.summary.slice(0, 500), limitations: d.report.limitations, recommendations: d.report.recommendations } : null })) });
        }
        if (await reserve(founderId, runId)) {
          const result = await infer(body, process.env.XAI_API_KEY); report = result.report; usage = result; mode = "grok";
          const violations = reportEvidenceViolations(report, evidence);
          if (violations.length) throw new ProviderError("financial_evidence_validation", result, report, violations);
          const keys = new Set(allFacts(evidence).map(f => f.key));
          if (report.recommendations.some(r => r.evidenceKeys.some(k => !keys.has(k)))) throw new ProviderError("unknown_evidence_reference", result, report, ["unknown_evidence_reference"]);
        } else { report = deterministicReport(evidence, agentId); report.summary = `${registry[agentId].name}: evidencia disponible; análisis bloqueado por el presupuesto mensual o una revisión de consumo pendiente.`; mode = "budget_blocked"; }
      }
      if (agentId !== "ceo" || task.depth >= 2 || deps(task.dependenciesJson).length) report.assignments = [];
      await db.$transaction(async tx => {
        const ok = await tx.ceoAgentTask.updateMany({ where: { id: taskId, founderId, status: "running", leaseToken: task!.leaseToken }, data: { status: "done", leaseToken: null, leaseUntil: null } });
        if (!ok.count) throw new AgentError("La ejecución perdió su turno; resultado descartado.");
        const run = await tx.ceoAgentRun.findUniqueOrThrow({ where: { id: runId! } });
        await tx.ceoAgentRun.update({ where: { id: runId! }, data: { status: "completed", resultJson: JSON.stringify(report), finishedAt: new Date(), model: mode === "grok" ? MODEL : mode, ...await settle(tx, run, usage) } });
        if (mode === "grok") {
          for (const [index, r] of report.recommendations.entries()) await tx.ceoBusinessMemory.create({ data: { id: randomUUID(), founderId, scope: agentId === "ceo" ? "shared" : agentId, kind: "decision", title: r.title, detail: r.rationale, author: agentId, sourceRunId: runId, status: "proposed", reviewAt: new Date(Date.now() + r.reviewDays * 86400000) } });
          await tx.ceoBusinessMemory.create({ data: { id: randomUUID(), founderId, scope: agentId, kind: "learning", title: "Revisión del agente", detail: report.learning, author: agentId, sourceRunId: runId, status: "proposed" } });
        }
        await event(tx, founderId, taskId, agentId, "analysis_completed", { runId, mode, recommendationCount: report.recommendations.length });
      });
      // Durable outbox: if dispatch fails, the committed result is picked up on the next worker pass.
      try { await dispatchCompleted(founderId); } catch { await event(db, founderId, taskId, "system", "dispatch_pending", {}); }
      return { status: "completed", taskId, runId, mode };
    } catch (error) {
      const code = error instanceof ProviderError ? error.code : error instanceof AgentError ? "context_or_conflict" : "execution_failed";
      await db.$transaction(async tx => {
        const ok = await tx.ceoAgentTask.updateMany({ where: { id: taskId, founderId, status: "running", leaseToken: task!.leaseToken }, data: { status: "failed", errorCode: code, leaseToken: null, leaseUntil: null } });
        if (!ok.count) { await event(tx, founderId, taskId, "system", "dispatch_incomplete", { code }); return; }
        if (runId) {
          const run = await tx.ceoAgentRun.findUniqueOrThrow({ where: { id: runId } });
          await tx.ceoAgentRun.update({ where: { id: runId }, data: { status: "failed", errorCode: code, finishedAt: new Date(), ...(error instanceof ProviderError && error.rejectedReport ? { resultJson: JSON.stringify(error.rejectedReport) } : {}), ...await settle(tx, run, error instanceof ProviderError ? error.usage : undefined, code === "provider_model_changed") } });
        }
        await event(tx, founderId, taskId, "system", "analysis_failed", { code, ...(error instanceof ProviderError && error.violations.length ? { violations: error.violations } : {}) });
      });
      return { status: "failed", taskId, code };
    }
  }
  async function schedule(founderId: string) {
    await ensure(founderId);
    const now = new Date(), configs = await db.ceoAgentConfig.findMany({ where: { founderId, enabled: true } });
    const tasks: string[] = [];
    // CEO synthesis follows all departments that are due in this scheduling pass.
    for (const config of configs.sort((a, b) => Number(a.agentId === "ceo") - Number(b.agentId === "ceo"))) {
      if (config.lastScheduledAt && now.getTime() - config.lastScheduledAt.getTime() < config.cadenceHours * 3600000) continue;
      const pending = await db.ceoAgentTask.count({ where: { founderId, agentId: config.agentId, status: { in: ["queued", "running", "blocked"] } } });
      if (pending) continue;
      const slot = Math.floor(now.getTime() / (config.cadenceHours * 3600000));
      const task = await enqueue(founderId, { agentId: config.agentId as AgentId, title: "Revisión programada: novedades, objetivos, riesgos y resultado de recomendaciones anteriores.", key: `schedule:${config.agentId}:${config.cadenceHours}:${slot}`, origin: "schedule", dependencies: config.agentId === "ceo" ? tasks : [] });
      tasks.push(task.id);
      await db.ceoAgentConfig.update({ where: { founderId_agentId: { founderId, agentId: config.agentId } }, data: { lastScheduledAt: now } });
    }
    return tasks.length;
  }
  async function command(founderId: string, c: Command) {
    await ensure(founderId); await quarantineInvalidReports(founderId);
    if (c.action === "process") return processOne(founderId);
    if (c.action === "run") return enqueue(founderId, { agentId: c.agentId, title: c.question, key: c.requestId, origin: "founder", priority: c.priority, dependencies: c.dependencies });
    if (c.action === "council") {
      const ids: string[] = [];
      for (const id of c.agents) ids.push((await enqueue(founderId, { agentId: id, title: c.question, key: c.requestId + ":" + id, origin: "council", priority: 2 })).id);
      return enqueue(founderId, { agentId: "ceo", title: "Consejo de dirección: " + c.question, key: c.requestId, origin: "founder", priority: 2, dependencies: ids });
    }
    if (c.action === "chat") {
      const task = await enqueue(founderId, { agentId: "ceo", title: c.text, key: c.requestId, origin: "founder_chat", priority: 2 });
      await db.ceoAgentMessage.upsert({ where: { taskId: task.id }, update: {}, create: { id: c.requestId, founderId, taskId: task.id, text: clean(c.text) } }); return task;
    }
    if (c.action === "retry") {
      const ok = await db.ceoAgentTask.updateMany({ where: { id: c.id, founderId, status: "failed", attempts: { lt: 3 } }, data: { status: "queued", errorCode: null } });
      if (!ok.count) throw new AgentError("Solo se reintentan fallos propios, hasta tres intentos.");
      await event(db, founderId, c.id, "founder", "retry_requested", {}); return { ok: true };
    }
    if (c.action === "configure") return db.$transaction(async tx => {
      const ok = await tx.ceoAgentConfig.updateMany({ where: { founderId, agentId: c.agentId, version: c.version }, data: { enabled: c.enabled, cadenceHours: c.cadenceHours, instructions: clean(c.instructions), version: { increment: 1 } } });
      if (!ok.count) throw new AgentError("Configuración modificada por otra sesión. Actualiza.");
      await event(tx, founderId, c.agentId, "founder", "configuration_changed", { enabled: c.enabled, cadenceHours: c.cadenceHours, version: c.version + 1 }); return { ok: true };
    });
    if (c.action === "memory") {
      const old = await db.ceoBusinessMemory.findUnique({ where: { id: c.requestId } });
      if (old) { if (old.founderId !== founderId || old.title !== clean(c.title) || old.detail !== clean(c.detail)) throw new AgentError("Identificador de memoria ya utilizado."); return old; }
      let baselineValue: number | null = null;
      if (c.metricKey) { const e = await evidenceSource(founderId, "ceo"); const f = allFacts(e).find(x => x.key === c.metricKey); if (!f) throw new AgentError("Indicador no disponible.", 400); baselineValue = f.value; }
      return db.$transaction(async tx => {
        const row = await tx.ceoBusinessMemory.create({ data: { id: c.requestId, founderId, scope: c.scope, kind: c.kind, title: clean(c.title), detail: clean(c.detail), author: "founder", status: c.kind === "preference" || c.kind === "learning" ? "approved" : "proposed", metricKey: c.metricKey, targetValue: c.targetValue, baselineValue, reviewAt: c.reviewAt ? new Date(c.reviewAt) : null } });
        await event(tx, founderId, row.id, "founder", "memory_created", { kind: c.kind, status: row.status }); return row;
      });
    }
    if (c.action === "review") {
      const row = await db.ceoBusinessMemory.findFirst({ where: { id: c.id, founderId } });
      if (!row || row.version !== c.version || !canTransition(row.status, c.status)) throw new AgentError("Transición inválida o memoria modificada. Actualiza.");
      let outcomeValue: number | null = null;
      if (c.status === "evaluated" && row.metricKey) { const e = await evidenceSource(founderId, "ceo"); outcomeValue = allFacts(e).find(f => f.key === row.metricKey)?.value ?? null; }
      return db.$transaction(async tx => {
        const ok = await tx.ceoBusinessMemory.updateMany({ where: { id: c.id, founderId, version: c.version, status: row.status }, data: { status: c.status, outcomeNote: clean(c.note), outcomeValue, version: { increment: 1 } } });
        if (!ok.count) throw new AgentError("Otra revisión ha cambiado esta decisión.");
        await event(tx, founderId, row.id, "founder", "memory_reviewed", { from: row.status, to: c.status, note: clean(c.note), outcomeValue, executedByAgent: false }); return { ok: true };
      });
    }
  }
  async function overview(founderId: string) {
    await ensure(founderId); await quarantineInvalidReports(founderId);
    const [configs, runs, tasks, memories, events, messages, budget] = await Promise.all([
      db.ceoAgentConfig.findMany({ where: { founderId } }), db.ceoAgentRun.findMany({ where: { founderId }, orderBy: { startedAt: "desc" }, take: 60 }),
      db.ceoAgentTask.findMany({ where: { founderId }, orderBy: { createdAt: "desc" }, take: 100 }),
      db.ceoBusinessMemory.findMany({ where: { founderId }, orderBy: { updatedAt: "desc" }, take: 100 }), db.ceoAgentEvent.findMany({ where: { founderId }, orderBy: { createdAt: "desc" }, take: 100 }),
      db.ceoAgentMessage.findMany({ where: { founderId }, orderBy: { createdAt: "desc" }, take: 30 }), db.ceoAgentBudget.findUnique({ where: { founderId_month: { founderId, month: monthKey() } } }),
    ]);
    return { agents: AGENT_IDS.map(id => ({ id, ...registry[id], config: configs.find(c => c.agentId === id) })),
      provider: { configured: !!process.env.XAI_API_KEY, model: MODEL, monthlyLimitUsd: MONTHLY_BUDGET_MICROS / 1e6, month: monthKey(), spentUsd: (budget?.spentMicros || 0) / 1e6, reservedUsd: (budget?.reservedMicros || 0) / 1e6, halted: budget?.halted || false },
      runs: runs.map(({ evidenceJson, resultJson, ...r }) => ({ ...r, evidence: parse<Evidence>(evidenceJson, { version: 1, tools: {} }), result: r.status === "completed" ? parse<AgentReport | null>(resultJson, null) : null })),
      tasks: tasks.map(({ requestHash: _, leaseToken: _token, dependenciesJson, ...t }) => ({ ...t, dependencies: deps(dependenciesJson) })), memories, events: events.map(({ detailJson, ...e }) => ({ ...e, detail: parse(detailJson, {}) })), messages };
  }
  return { ensure, enqueue, command, processOne, schedule, overview };
}
export const agentEngine = createAgentEngine();
