import { redirect } from "next/navigation";

// "Formación" se renombró a "Tutoriales" — mantenemos el redirect para enlaces antiguos.
export default function FormacionRedirect() {
  redirect("/fisio/recursos/tutoriales");
}
