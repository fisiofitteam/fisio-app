export type CaseAttachment = { url: string; caption: string; kind?: string };
export function mergeCaseAttachments(current: CaseAttachment[], chosen: CaseAttachment[]): CaseAttachment[] {
  const urls = new Set(current.map(item => item.url));
  return [...current, ...chosen.filter(item => {
    if (urls.has(item.url)) return false;
    urls.add(item.url); return true;
  })];
}
