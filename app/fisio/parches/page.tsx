import { redirect } from "next/navigation";

// /fisio/parches se renombró a /fisio/regalos. Redirect permanente para
// bookmarks y links antiguos.
export default function LegacyParchesRedirect() {
  redirect("/fisio/regalos");
}
