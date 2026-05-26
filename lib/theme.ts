import { cookies } from "next/headers";

// Preferencia de tema del panel de profesionales. Se guarda en cookie para
// poder renderizar el tema correcto en el servidor (sin parpadeo al cargar).
export const THEME_COOKIE = "fp_theme";
export type Theme = "light" | "dark";

// Lee el tema desde la cookie en un Server Component. Por defecto: claro.
export function getThemeFromCookie(): Theme {
  const v = cookies().get(THEME_COOKIE)?.value;
  return v === "dark" ? "dark" : "light";
}
