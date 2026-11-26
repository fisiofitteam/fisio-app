import { redirect } from "next/navigation";
export default function LegacyWeeklyPage({ searchParams }: { searchParams: { week?: string } }) {
  const week = typeof searchParams.week === "string" && /^\d{4}-\d{2}-\d{2}$/.test(searchParams.week) ? "?week=" + encodeURIComponent(searchParams.week) : "";
  redirect("/fisio/ceo-ia/semanal" + week);
}
