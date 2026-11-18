// The v2 marker identifies the newer uploader; existing immutable revisions keep
// their original paths. Never rewrite provenance or infer eligibility from dates.
export const SHOULDER_UPLOAD_FLOW = "shoulder-v2";
type LegacyPreference = {aiConsent:boolean; aiConsentAt:Date|null} | null;
export const wasShoulderReviewWithdrawn = (row:LegacyPreference) => !!row?.aiConsentAt && !row.aiConsent;
const uuidVideo = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}\.(mp4|mov|webm)$/i;
export function canUseShoulderVideo(row:LegacyPreference, id:string, blobUrl:string | null, options:{allowAssignedLegacy?:boolean} = {}) {
  if(!blobUrl || wasShoulderReviewWithdrawn(row)) return false;
  if(row?.aiConsent && row.aiConsentAt) return true; // Uploaded under the earlier opt-in.
  try {
    const url=new URL(blobUrl), parts=url.pathname.split("/");
    if(url.protocol!=="https:" || !url.hostname.endsWith(".private.blob.vercel-storage.com") ||
       url.search || url.hash || url.username || url.password || parts[1]!=="assessments" || parts[2]!==id) return false;
    const marked=parts.length===5 && parts[3]===SHOULDER_UPLOAD_FLOW && uuidVideo.test(parts[4]);
    // The caller must have already validated ownership, the complete assigned shoulder
    // battery, test membership and the immutable delivery revision. This flag alone
    // is never authorization, and an explicit previous withdrawal still wins.
    const assignedLegacy=options.allowAssignedLegacy===true && parts.length===4 && uuidVideo.test(parts[3]);
    return marked || assignedLegacy;
  } catch { return false; }
}
