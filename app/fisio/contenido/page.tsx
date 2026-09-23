import { redirect } from "next/navigation";

/**
 * /fisio/contenido → /fisio/contenido/calendario
 *
 * La antigua vista "Esta semana" (ThisWeekView) queda retirada: el CEO
 * trabajaba mejor desde el calendario y el dossier, entrar aquí era
 * fricción. Los links históricos a /fisio/contenido caen aquí y saltan
 * al calendario automáticamente (permanent para que caches lo tomen).
 *
 * ThisWeekView.tsx sigue en el repo por si en algún momento queremos
 * recuperar algo — no se enlaza desde ningún sitio.
 */
export default function ContentIndexRedirect() {
  redirect("/fisio/contenido/calendario");
}
