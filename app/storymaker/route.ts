/**
 * GET /storymaker
 *
 * Sirve el editor Story Maker (public/storymaker/StoryMaker.html) solo a
 * staff autenticado. Antes de devolverlo, inyecta:
 *
 *   - SM_CONFIG con la marca FisioFit y useProxy=true (fuerza que toda IA
 *     pase por /api/claude en vez de meter la clave del navegador).
 *   - LOGO_ER_DATA_URL con el SVG de las iniciales FF sobre fondo dark.
 *
 * El HTML es un documento completo autocontenido (~500 KB con estilos
 * inline). No es una page.tsx porque no encaja con el modelo React de
 * Next — funciona mejor como recurso estático parametrizable.
 */
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { NextResponse } from "next/server";
import { getActiveProfessional } from "@/lib/session";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const HTML_PATH = join(process.cwd(), "public", "storymaker", "StoryMaker.html");

const SM_CONFIG = {
  marca: "FisioFit Team",
  handle: "@fisiofitteam",
  nicho: "atletas de CrossFit y Hyrox con dolor",
  reglaTerminologia:
    "nunca uses 'cliente' o 'paciente' — siempre 'atleta'. Habla de tú.",
  useProxy: true,
};

// SVG "FF" sobre fondo dark, paleta FisioFit. base64 encoded.
const LOGO_DATA_URL =
  "data:image/svg+xml;base64," +
  Buffer.from(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200">' +
      '<circle cx="100" cy="100" r="96" fill="#0A0A0A"/>' +
      '<text x="100" y="135" font-family="Arial, sans-serif" font-size="96" font-weight="900" fill="#FCD34D" text-anchor="middle">FF</text>' +
      "</svg>",
  ).toString("base64");

export async function GET() {
  const user = await getActiveProfessional();
  if (!user) {
    return NextResponse.redirect(new URL("/login", "http://placeholder"), {
      status: 302,
    });
  }
  if (user.role !== "ceo" && user.role !== "setter") {
    return new NextResponse("Forbidden", { status: 403 });
  }

  let html: string;
  try {
    html = await readFile(HTML_PATH, "utf-8");
  } catch (e) {
    return new NextResponse("Story Maker HTML no encontrado", { status: 500 });
  }

  // Sustitución de los markers /* __SM_CONFIG__ */ y /* __LOGO__ */.
  // Los markers están seguidos de un valor por defecto que reemplazamos por
  // completo hasta el ';' del final. Usamos regex tolerante que empareja
  // desde el marker hasta el primer ';' (los valores por defecto no llevan
  // otro ';' en medio).
  html = html.replace(
    /\/\* __SM_CONFIG__ \*\/[\s\S]*?;/,
    JSON.stringify(SM_CONFIG) + ";",
  );
  html = html.replace(
    /\/\* __LOGO__ \*\/[\s\S]*?;/,
    JSON.stringify(LOGO_DATA_URL) + ";",
  );

  return new NextResponse(html, {
    status: 200,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "private, no-cache, no-store, must-revalidate",
    },
  });
}
