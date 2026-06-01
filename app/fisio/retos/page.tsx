import { redirect } from "next/navigation";

// /fisio/retos se movió a /fisio/advance/retos. Mantenemos este redirect
// permanente para bookmarks y notificaciones antiguas.
export default function LegacyRetosRedirect() {
  redirect("/fisio/advance/retos");
}
