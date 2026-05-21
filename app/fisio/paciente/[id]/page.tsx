import { redirect } from "next/navigation";

export default function PatientRootPage({ params }: { params: { id: string } }) {
  redirect(`/fisio/paciente/${params.id}/calendario`);
}
