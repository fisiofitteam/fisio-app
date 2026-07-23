/**
 * GET /api/resources/documents?rol=fisio
 *   → lista documentos visibles al rol solicitado (o al rol del usuario si
 *     no se pasa). Filtra por targetRoles (CSV: "all" o "role1,role2,...").
 *
 * POST /api/resources/documents
 *   FormData con `file` + campos: title, description, category, targetRoles.
 *   Sube a Vercel Blob y guarda el documento. Cualquier profesional puede.
 */
import { NextRequest, NextResponse } from "next/server";
import { put } from "@vercel/blob";
import { prisma } from "@/lib/prisma";
import { getActiveProfessional } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_SIZE = 25 * 1024 * 1024; // 25 MB

function inferFileType(mime: string, ext: string): string {
  if (mime.startsWith("image/")) return "image";
  if (mime === "application/pdf" || ext === "pdf") return "pdf";
  if (["doc", "docx"].includes(ext)) return "doc";
  if (["xls", "xlsx", "csv"].includes(ext)) return "sheet";
  return "other";
}

export async function GET(req: NextRequest) {
  const user = await getActiveProfessional();
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const rolParam = req.nextUrl.searchParams.get("rol");
  // Rol para filtrar: si el fisio pide "all" y no es manager, seguimos
  // filtrando por su rol para no exponer docs restringidos.
  const targetRole = rolParam && rolParam !== "all" ? rolParam : user.role;

  const docs = await (prisma as any).resourceDocument.findMany({
    orderBy: [{ createdAt: "desc" }],
  });

  const filtered = docs.filter((d: any) => {
    const roles = String(d.targetRoles ?? "all").split(",").map((r: string) => r.trim());
    if (roles.includes("all")) return true;
    return roles.includes(targetRole);
  });

  return NextResponse.json({ documents: filtered });
}

export async function POST(req: NextRequest) {
  const user = await getActiveProfessional();
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    return NextResponse.json({ error: "Blob no configurado en Vercel" }, { status: 503 });
  }

  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  const title = String(form?.get("title") ?? "").trim();
  const description = String(form?.get("description") ?? "").trim();
  const category = String(form?.get("category") ?? "General").trim() || "General";
  const targetRoles = String(form?.get("targetRoles") ?? "all").trim() || "all";

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Archivo requerido" }, { status: 400 });
  }
  if (file.size > MAX_SIZE) {
    return NextResponse.json({ error: `Máximo ${MAX_SIZE / (1024 * 1024)} MB` }, { status: 400 });
  }
  if (!title) {
    return NextResponse.json({ error: "Título requerido" }, { status: 400 });
  }

  const ext = (file.name.split(".").pop() || "bin").toLowerCase().replace(/[^a-z0-9]/g, "");
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 60);
  const key = `resources/${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${safeName}`;

  let url: string;
  try {
    const blob = await put(key, file, { access: "public" });
    url = blob.url;
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "No se pudo subir" }, { status: 500 });
  }

  const doc = await (prisma as any).resourceDocument.create({
    data: {
      title,
      description: description || null,
      url,
      fileType: inferFileType(file.type, ext),
      fileSize: file.size,
      category,
      targetRoles,
      uploadedById: user.id,
    },
  });

  return NextResponse.json({ document: doc });
}
