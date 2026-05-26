"use client";

import { useEffect, useState } from "react";
import { Sun, Moon } from "lucide-react";

type Theme = "light" | "dark";

// Selector claro/oscuro de la app del paciente. Escribe la cookie pp_theme y
// alterna la clase .patient-light sobre el contenedor .patient-scope en vivo.
export function PatientThemeToggle() {
  const [theme, setTheme] = useState<Theme>("dark");

  useEffect(() => {
    const el = document.querySelector(".patient-scope");
    setTheme(el?.classList.contains("patient-light") ? "light" : "dark");
  }, []);

  function apply(next: Theme) {
    setTheme(next);
    document.cookie = `pp_theme=${next}; path=/; max-age=${60 * 60 * 24 * 365}; samesite=lax`;
    const el = document.querySelector(".patient-scope");
    if (el) el.classList.toggle("patient-light", next === "light");
  }

  const opts: { value: Theme; label: string; Icon: typeof Sun }[] = [
    { value: "light", label: "Claro", Icon: Sun },
    { value: "dark", label: "Oscuro", Icon: Moon },
  ];

  return (
    <div
      className="inline-flex gap-1 p-1 rounded-xl"
      style={{ background: "var(--p-surface)", border: "1px solid var(--p-border)" }}
    >
      {opts.map(({ value, label, Icon }) => (
        <button
          key={value}
          onClick={() => apply(value)}
          className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-colors"
          style={theme === value
            ? { background: "var(--p-accent)", color: "var(--p-accent-ink)" }
            : { color: "var(--p-text-dim)" }}
        >
          <Icon size={16} /> {label}
        </button>
      ))}
    </div>
  );
}
