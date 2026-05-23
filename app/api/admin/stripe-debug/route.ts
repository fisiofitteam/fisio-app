import { NextResponse } from "next/server";
import { getActiveProfessional } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function GET() {
  const user = await getActiveProfessional();
  if (!user || user.role !== "ceo") {
    return NextResponse.json({ error: "Solo CEO" }, { status: 403 });
  }

  const env = process.env;
  return NextResponse.json({
    STRIPE_SECRET_KEY: env.STRIPE_SECRET_KEY
      ? `present (${env.STRIPE_SECRET_KEY.slice(0, 8)}...${env.STRIPE_SECRET_KEY.slice(-4)})`
      : "MISSING",
    STRIPE_PUBLISHABLE_KEY: env.STRIPE_PUBLISHABLE_KEY
      ? `present (${env.STRIPE_PUBLISHABLE_KEY.slice(0, 8)}...)`
      : "MISSING",
    STRIPE_WEBHOOK_SECRET: env.STRIPE_WEBHOOK_SECRET ? "present" : "MISSING",
    STRIPE_PRICE_RECUPERA_4M: env.STRIPE_PRICE_RECUPERA_4M || "MISSING",
    STRIPE_PRICE_RECUPERA_6M: env.STRIPE_PRICE_RECUPERA_6M || "MISSING",
    STRIPE_PRICE_CONSOLIDA_4M: env.STRIPE_PRICE_CONSOLIDA_4M || "MISSING",
    STRIPE_PRICE_CONSOLIDA_6M: env.STRIPE_PRICE_CONSOLIDA_6M || "MISSING",
    NODE_ENV: env.NODE_ENV,
  });
}
