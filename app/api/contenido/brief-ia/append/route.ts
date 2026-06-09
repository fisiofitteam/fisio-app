/**
 * POST /api/contenido/brief-ia/append
 *
 * Añade texto al final de una sección concreta del Brief IA, separado por
 * un divisor visible. Más cómodo que GET + concat + PATCH desde el cliente
 * cuando quieres "enseñar" a la IA con un ejemplo rápido sin editar el brief
 * a mano.
 *
 * Body:
 *   { section: "goodExamples" | "badExamples" | "dos", content: string }
 *
 * Sólo CEO.
 */
import { NextRequest, NextResponse } from "next/server";
import { getActiveProfessional } from "@/lib/session";
import { getAiBrief, updateAiBrief } from "@/lib/ai-brief";
import type { AiBrief } from "@/lib/ai-content";

type AppendableSection = "goodExamples" | "badExamples" | "dos";
const ALLOWED: AppendableSection[] = ["goodExamples", "badExamples", "dos"];

const SEPARATOR = "\n\n────────────────\n\n";

export async function POST(req: NextRequest) {
  const user = await getActiveProfessional();
  if (!user || user.role !== "ceo") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const section = String(body?.section || "") as AppendableSection;
  const content = typeof body?.content === "string" ? body.content.trim() : "";

  if (!ALLOWED.includes(section)) {
    return NextResponse.json({ error: "Sección no válida" }, { status: 400 });
  }
  if (!content) {
    return NextResponse.json({ error: "Contenido vacío" }, { status: 400 });
  }

  const current = await getAiBrief();
  const existing = (current[section] as string) ?? "";
  const next = existing.trim()
    ? existing.trim() + SEPARATOR + content
    : content;

  const patch: Partial<AiBrief> = { [section]: next };
  await updateAiBrief(patch, user.id);

  return NextResponse.json({ ok: true, section, newLength: next.length });
}
