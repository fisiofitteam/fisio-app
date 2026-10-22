import { redirect } from "next/navigation";
export default function Moved({ params }: { params: { id: string } }) {
  redirect(`/fisio/paciente/${params.id}/info/wods`);
}
