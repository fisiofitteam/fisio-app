"use client";

import { useEffect, useState } from "react";
import { Sun, Moon } from "lucide-react";

type Theme = "light" | "dark";

// Selector claro/oscuro del panel de pros. Escribe la cookie fp_theme y alterna
// la clase .dark sobre el contenedor .fisio-shell en vivo (sin recargar).
export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>("light");

  useEffect(() => {
    const shell = document.querySelector(".fisio-shell");
    setTheme(shell?.classList.contains("dark") ? "dark" : "light");
  }, []);

  function apply(next: Theme) {
    setTheme(next);
    document.cookie = `fp_theme=${next}; path=/; max-age=${60 * 60 * 24 * 365}; samesite=lax`;
    const shell = document.querySelector(".fisio-shell");
    if (shell) shell.classList.toggle("dark", next === "dark");
  }

  const opts: { value: Theme; label: string; Icon: typeof Sun }[] = [
    { value: "light", label: "Claro", Icon: Sun },
    { value: "dark", label: "Oscuro", Icon: Moon },
  ];

  return (
    <div className="inline-flex gap-1 p-1 rounded-lg bg-neutral-100 border border-neutral-200">
      {opts.map(({ value, label, Icon }) => (
        <button
          key={value}
          onClick={() => apply(value)}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
            theme === value ? "bg-white shadow-sm text-neutral-900" : "text-neutral-500 hover:text-neutral-900"
          }`}
        >
          <Icon size={15} /> {label}
        </button>
      ))}
    </div>
  );
}
