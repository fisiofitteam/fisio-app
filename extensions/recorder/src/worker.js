import { records, metadata, chunk } from "./store.js";
import { APP_ORIGIN, IMPORT_PATH, CHUNK_SIZE, ACTIVE_PHASES, allowedExternal, validChunk } from "./protocol.js";
let creating, opening, captureBusy = false;
const offscreenURL = chrome.runtime.getURL("offscreen.html");
async function hasOffscreen() { return (await chrome.runtime.getContexts({ contextTypes: ["OFFSCREEN_DOCUMENT"], documentUrls: [offscreenURL] })).length > 0; }
async function offscreen() {
  if (creating) return creating;
  if (await hasOffscreen()) return;
  creating = chrome.offscreen.createDocument({ url: "offscreen.html", reasons: ["USER_MEDIA", "DISPLAY_MEDIA", "BLOBS"], justification: "Grabar pantalla, cámara y audio mientras el profesional navega o cierra los controles." });
  try { await creating; } finally { creating = undefined; }
}
async function capture(message) { await offscreen(); return chrome.runtime.sendMessage({ ...message, target: "capture" }); }
async function state() { return await hasOffscreen() ? capture({ type: "state" }) : { phase: "idle", elapsed: 0 }; }
async function showControls() {
  if (opening) return opening;
  opening = (async () => {
    const url = chrome.runtime.getURL("controller.html");
    const tabs = await chrome.tabs.query({}); const existing = tabs.find(tab => tab.url === url);
    if (existing) { await chrome.windows.update(existing.windowId, { focused: true }); await chrome.tabs.update(existing.id, { active: true }); }
    else await chrome.windows.create({ url, type: "popup", width: 470, height: 740 });
  })();
  try { await opening; } finally { opening = undefined; }
}
chrome.action.onClicked.addListener(() => { void showControls(); });
chrome.commands.onCommand.addListener(command => { if (command === "open-recorder") void showControls(); });
async function record(id) {
  const saved = await records("get", id);
  if (saved) return { record: saved };
  if (await hasOffscreen()) return { memory: true, meta: await capture({ type: "metadata", id }) };
  throw Error("La grabación ya no está disponible en este navegador.");
}
async function exportRecord(id) {
  const found = await record(id); if (!found.record && !found.meta) throw Error("Grabación no disponible.");
  const token = crypto.randomUUID() + crypto.randomUUID();
  const { grants = {} } = await chrome.storage.session.get("grants");
  const next = Object.fromEntries(Object.entries(grants).filter(([, g]) => g.expires > Date.now() && g.id !== id));
  const url = APP_ORIGIN + IMPORT_PATH + "#" + new URLSearchParams({ extension: chrome.runtime.id, transfer: token });
  const tab = await chrome.tabs.create({ url });
  next[token] = { id, tabId: tab.id, expires: Date.now() + 30 * 60 * 1000 };
  await chrome.storage.session.set({ grants: next });
  return { ok: true };
}
async function handle(message) {
  if (message.type === "snapshot") {
    const phase = message.state?.phase;
    await chrome.action.setBadgeText({ text: phase === "recording" ? "REC" : phase === "paused" ? "Ⅱ" : "" });
    await chrome.action.setBadgeBackgroundColor({ color: phase === "paused" ? "#d97706" : "#dc2626" });
    return { ok: true };
  }
  if (message.type === "status") {
    const current = await state();
    const drafts = (await records("getAll")).map(r => ({ id: r.id, title: r.title, createdAt: r.createdAt, size: r.blob.size }));
    if (current.memoryDraft && !drafts.some(r => r.id === current.memoryDraft.id)) drafts.push(current.memoryDraft);
    return { ...current, drafts };
  }
  if (message.type === "prepare") {
    if (captureBusy || ACTIVE_PHASES.includes((await state()).phase)) throw Error("Ya hay una grabación en curso.");
    if ((await records("getAll")).length >= 3) throw Error("Guarda o descarta alguna de las tres grabaciones pendientes antes de empezar otra.");
    await offscreen(); return { ok: true };
  }
  if (message.type === "start") {
    if (captureBusy) throw Error("Ya se está preparando una grabación."); captureBusy = true;
    try { return await capture(message); } finally { captureBusy = false; }
  }
  if (["pause", "resume", "stop"].includes(message.type)) return capture(message);
  if (message.type === "export") return exportRecord(message.id);
  if (message.type === "delete") {
    await records("delete", message.id);
    if (await hasOffscreen()) await capture({ type: "forget", id: message.id });
    const { grants = {} } = await chrome.storage.session.get("grants");
    await chrome.storage.session.set({ grants: Object.fromEntries(Object.entries(grants).filter(([, g]) => g.id !== message.id)) });
    return { ok: true };
  }
  if (message.type === "download") {
    // A Blob URL remains inside the extension origin; no patient media is exposed to web pages.
    return capture({ type: "download", id: message.id });
  }
  throw Error("Acción no disponible.");
}
chrome.runtime.onMessage.addListener((message, sender, respond) => {
  if (message?.target !== "worker" || sender.id !== chrome.runtime.id) return;
  handle(message).then(respond, error => respond({ error: error.message || "No se pudo completar la operación." })); return true;
});
chrome.runtime.onMessageExternal.addListener((message, sender, respond) => {
  (async () => {
    const { grants = {} } = await chrome.storage.session.get("grants");
    const grant = grants[message?.transfer];
    if (!allowedExternal(sender, grant)) throw Error("El enlace de transferencia ha caducado. Abre de nuevo «Guardar en FisioFit» desde la extensión.");
    if (!["metadata", "chunk", "ack"].includes(message.type)) throw Error("Acción no permitida.");
    if (message.type === "ack") { await handle({ type: "delete", id: grant.id }); return { ok: true }; }
    const found = await record(grant.id), meta = found.record ? metadata(found.record) : found.meta;
    if (!meta) throw Error("Grabación no disponible.");
    if (message.type === "metadata") return { ...meta, chunkSize: CHUNK_SIZE };
    if (!validChunk(message.offset, meta.size)) throw Error("Fragmento no válido.");
    return found.record ? chunk(found.record, message.offset, CHUNK_SIZE) : capture({ type: "chunk", id: grant.id, offset: message.offset });
  })().then(respond, error => respond({ error: error.message || "No se pudo transferir la grabación." })); return true;
});
