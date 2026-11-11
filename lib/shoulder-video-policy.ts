// Provenance travels with the immutable blob revision, including when an upload replaces
// an older video in the same database row. Never infer the new upload flow from a date.
export const SHOULDER_UPLOAD_FLOW = "shoulder-v2";
type LegacyPreference = {aiConsent:boolean; aiConsentAt:Date|null} | null;
export const wasShoulderReviewWithdrawn = (row:LegacyPreference) => !!row?.aiConsentAt && !row.aiConsent;
const uuidVideo = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}\.(mp4|mov|webm)$/i;
export function canUseShoulderVideo(row:LegacyPreference, id:string, blobUrl:string | null) {
  if(!blobUrl || wasShoulderReviewWithdrawn(row)) return false;
  if(row?.aiConsent && row.aiConsentAt) return true; // Uploaded under the earlier opt-in.
  try {
    const url=new URL(blobUrl), parts=url.pathname.split("/");
    return url.protocol==="https:" && url.hostname.endsWith(".private.blob.vercel-storage.com") &&
      parts.length===5 && parts[1]==="assessments" && parts[2]===id && parts[3]===SHOULDER_UPLOAD_FLOW && uuidVideo.test(parts[4]);
  } catch { return false; }
}
