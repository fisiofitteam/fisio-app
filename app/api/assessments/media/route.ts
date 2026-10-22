import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { assessmentAccess } from "@/lib/assessment-access";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;
export async function GET(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id");
  const row = id ? await prisma.assessmentVideo.findUnique({ where: { id } }) : null;
  if (!row?.url || !await assessmentAccess(row.patientId)) return new NextResponse("No autorizado", { status: 403 });
  if (!process.env.ASSESSMENT_BLOB_READ_WRITE_TOKEN) return new NextResponse("Almacenamiento no disponible", { status: 503 });
  const u = new URL(row.url);
  if (u.protocol !== "https:" || !u.hostname.endsWith(".private.blob.vercel-storage.com") || !u.pathname.startsWith("/assessments/")) return new NextResponse("Vídeo no disponible", { status: 404 });
  const headers: Record<string, string> = { Authorization: "Bearer " + process.env.ASSESSMENT_BLOB_READ_WRITE_TOKEN };
  const range = req.headers.get("range");
  if (range) {
    if (!/^bytes=\d*-\d*$/.test(range) || range === "bytes=-") return new NextResponse(null, { status: 416 });
    headers.Range = range;
  }
  const response = await fetch(u, { headers, cache: "no-store", redirect: "error" });
  if (!response.ok && response.status !== 416) return new NextResponse("Vídeo no disponible", { status: 502 });
  const output = new Headers({ "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" });
  for (const key of ["content-type", "content-length", "content-range", "accept-ranges"]) {
    const value = response.headers.get(key); if (value) output.set(key, value);
  }
  return new NextResponse(response.body, { status: response.status, headers: output });
}
