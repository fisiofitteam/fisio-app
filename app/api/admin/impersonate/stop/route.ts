import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { IMPERSONATE_COOKIE } from "@/lib/auth";

// POST /api/admin/impersonate/stop — vuelve a la cuenta real (CEO).
export async function POST() {
  cookies().delete(IMPERSONATE_COOKIE);
  return NextResponse.json({ ok: true });
}
