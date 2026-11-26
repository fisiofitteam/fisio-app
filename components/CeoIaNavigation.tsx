"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ceoIaSections } from "@/lib/ceo-ia-navigation";

export function CeoIaNavigation({ isFounder }: { isFounder: boolean }) {
  const pathname = usePathname();
  return <nav aria-label="Secciones de CEO IA" className="flex flex-wrap gap-2 border-b border-neutral-200 pb-4 mb-6">
    {ceoIaSections.filter(s => !s.founderOnly || isFounder).map(s =>
      <Link key={s.href} href={s.href} prefetch={false} aria-current={pathname === s.href ? "page" : undefined}
        className={"rounded-lg px-3 py-2 text-sm font-medium transition-colors " + (pathname === s.href ? "bg-neutral-900 text-white dark:bg-white dark:text-neutral-900" : "border border-neutral-200 bg-white text-neutral-600 hover:bg-neutral-50")}>
        {s.label}
      </Link>)}
  </nav>;
}
