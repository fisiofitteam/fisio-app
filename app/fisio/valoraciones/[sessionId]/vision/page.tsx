import { notFound } from "next/navigation";
import { PilotHttpError, requirePilotAccess } from "@/lib/shoulder-pilot-server";
import { ShoulderContactComparison } from "@/components/ShoulderContactComparison";

export const dynamic = "force-dynamic";
export default async function ReviewPage({ params }: { params: { sessionId: string } }) {
  const access = await requirePilotAccess(params.sessionId, true).catch((error: unknown) => {
    if (error instanceof PilotHttpError && [401, 403, 404, 409].includes(error.status)) notFound();
    throw error;
  });
  return <ShoulderContactComparison sessionId={access.session.id} />;
}
