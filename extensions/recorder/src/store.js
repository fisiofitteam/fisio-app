const DB = "fisiofit-recorder-extension";
export async function database() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB, 1);
    request.onupgradeneeded = () => request.result.createObjectStore("recordings", { keyPath: "id" });
    request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
  });
}
export async function records(action, value) {
  const db = await database();
  try { return await new Promise((resolve, reject) => {
    const tx = db.transaction("recordings", action === "put" || action === "delete" ? "readwrite" : "readonly");
    const request = tx.objectStore("recordings")[action](...(value === undefined ? [] : [value]));
    tx.oncomplete = () => resolve(request.result); tx.onerror = () => reject(tx.error); tx.onabort = () => reject(tx.error);
  }); } finally { db.close(); }
}
export function metadata(record) {
  if (!record) return null;
  const { blob, ...rest } = record; return { ...rest, size: blob.size, mime: blob.type };
}
export async function chunk(record, offset, length) {
  const bytes = new Uint8Array(await record.blob.slice(offset, offset + length).arrayBuffer());
  let binary = "";
  for (let i = 0; i < bytes.length; i += 8192) binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
  return { offset, data: btoa(binary), length: bytes.length };
}
