export type RecordingDraft = { blob: Blob; durationSeconds: number; title: string; notes: string; updatedAt: number; uploadedId?: string };
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
