import { getAiAdsBrief } from "@/lib/ai-ads-brief";
import { AdsBriefEditor } from "@/components/AdsBriefEditor";

export const dynamic = "force-dynamic";

export default async function BriefIaPage() {
  const brief = await getAiAdsBrief();
  return <AdsBriefEditor initial={brief} />;
}
