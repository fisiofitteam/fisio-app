"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ceoIaLegacyDestination } from "@/lib/ceo-ia-navigation";
export function LegacyCeoRedirect() {
  const router = useRouter();
  useEffect(() => { router.replace(ceoIaLegacyDestination(window.location.search, window.location.hash)); }, [router]);
  return <p className="p-6 text-sm text-neutral-500">Abriendo CEO IA… <Link className="underline" href="/fisio/ceo-ia/informes">Ir a informes</Link></p>;
}
