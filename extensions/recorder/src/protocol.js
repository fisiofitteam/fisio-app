export const APP_ORIGIN = "https://app.fisiofitteam.com";
export const IMPORT_PATH = "/grabador-extension";
export const CHUNK_SIZE = 512 * 1024;
export const ACTIVE_PHASES = ["preparing", "recording", "paused", "stopping"];
export function allowedExternal(sender, grant, now = Date.now()) {
  try {
    const url = new URL(sender.url);
    return !sender.id && sender.frameId === 0 && url.origin === APP_ORIGIN && url.pathname === IMPORT_PATH &&
      !!grant && Number.isInteger(grant.tabId) && sender.tab?.id === grant.tabId && grant.expires > now;
  } catch { return false; }
}
export function validChunk(offset, size) {
  return Number.isSafeInteger(offset) && offset >= 0 && offset < size && offset % CHUNK_SIZE === 0;
}
