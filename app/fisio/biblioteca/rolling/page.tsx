import { redirect } from "next/navigation";

// /fisio/biblioteca/rolling se movió a /fisio/advance/rolling.
export default function LegacyBibliotecaRollingRedirect() {
  redirect("/fisio/advance/rolling");
}
