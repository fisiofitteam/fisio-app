import { redirect } from "next/navigation";

export default function LegacyBibliotecaRollingDetailRedirect({
  params,
}: {
  params: { programId: string };
}) {
  redirect(`/fisio/advance/rolling/${params.programId}`);
}
