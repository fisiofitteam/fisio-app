import { redirect } from "next/navigation";

export default function ProfilesListPage() {
  // La vista antigua de perfiles clínicos se sustituye por "Controles de cargas"
  // (niveles por categoría). Redirigimos para que nadie se quede atascado.
  redirect("/fisio/biblioteca/niveles-categoria");
}
