import { NextRequest, NextResponse } from "next/server";
import { readWodImage, WodImageError } from "@/lib/wod-image";

export async function POST(req: NextRequest) {
  try {
    const form = await req.formData();
    const file = form.get("image");
    if (!(file instanceof Blob)) return NextResponse.json({ error: "Falta la imagen." }, { status: 400 });
    return NextResponse.json({ text: await readWodImage(file) });
  } catch (error) {
    return NextResponse.json({ error: error instanceof WodImageError ? error.message : "No se ha podido leer la imagen." }, { status: error instanceof WodImageError ? error.status : 400 });
  }
}
