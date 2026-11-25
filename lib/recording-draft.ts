import type { TranscriptStatus } from "./browser-transcription";
export type RecordingDraft = { blob: Blob; durationSeconds: number; reason?: string; title: string; notes: string; updatedAt: number; patientId?: string; patientName?: string; transcript?: string; transcriptionStatus?: TranscriptStatus; transcriptionWarning?: string; folderId?: string; uploadedId?: string };
function openDrafts(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open("fisiofit-recording-drafts", 1);
    request.onupgradeneeded = () => request.result.createObjectStore("drafts");
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
export async function readRecordingDraft(key: string): Promise<RecordingDraft | undefined> {
  const db = await openDrafts();
  try { return await new Promise((resolve, reject) => {
    const tx = db.transaction("drafts", "readonly"), request = tx.objectStore("drafts").get(key);
    request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
  }); } finally { db.close(); }
}
export async function writeRecordingDraft(key: string, value?: RecordingDraft) {
  const db = await openDrafts();
  try { await new Promise<void>((resolve, reject) => {
    const tx = db.transaction("drafts", "readwrite");
    if (value) tx.objectStore("drafts").put(value, key); else tx.objectStore("drafts").delete(key);
    tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error); tx.onabort = () => reject(tx.error);
  }); } finally { db.close(); }
}

/** Recover the most recent draft belonging to this professional, including legacy patient keys. */
export async function readLatestRecordingDraft(professionalId: string): Promise<{ key: string; draft: RecordingDraft } | undefined> {
  const db = await openDrafts();
  try { return await new Promise((resolve, reject) => {
    const tx = db.transaction("drafts", "readonly"), request = tx.objectStore("drafts").openCursor();
    let latest: { key: string; draft: RecordingDraft } | undefined;
    request.onsuccess = () => {
      const cursor = request.result;
      if (!cursor) { resolve(latest); return; }
      const key = String(cursor.key), draft = cursor.value as RecordingDraft;
      if (key.startsWith(professionalId + ":") && draft?.blob instanceof Blob && (!latest || draft.updatedAt > latest.draft.updatedAt)) {
        const suffix = key.slice(professionalId.length + 1);
        latest = { key, draft: { ...draft, patientId: draft.patientId || (!["general", "workspace"].includes(suffix) && !suffix.startsWith("extension:") ? suffix : undefined) } };
      }
      cursor.continue();
    };
    request.onerror = () => reject(request.error);
  }); } finally { db.close(); }
}
