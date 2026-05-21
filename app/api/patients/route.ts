import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function PATCH(req: NextRequest) {
  const body = await req.json();
  const { id, fullName, sport, diagnosis, subscriptionStartDate, subscriptionPeriodMonths, whatsappGroupUrl, assignedProfessionalId, programType, difficulty, shippingAddress, shippingCity, shippingPostalCode, shippingPhone } = body;
  const updated = await prisma.patient.update({
    where: { id },
    data: {
      ...(fullName !== undefined && { fullName }),
      ...(sport !== undefined && { sport: sport || "CrossFit" }),
      ...(diagnosis !== undefined && { diagnosis: diagnosis || null }),
      ...(subscriptionStartDate !== undefined && {
        subscriptionStartDate: subscriptionStartDate ? new Date(subscriptionStartDate) : null,
      }),
      ...(subscriptionPeriodMonths !== undefined && {
        subscriptionPeriodMonths: Number(subscriptionPeriodMonths) || 4,
      }),
      ...(whatsappGroupUrl !== undefined && {
        whatsappGroupUrl: whatsappGroupUrl || null,
      }),
      ...(assignedProfessionalId !== undefined && {
        assignedProfessionalId: assignedProfessionalId || null,
      }),
      ...(programType !== undefined && {
        programType: programType || null,
      }),
      ...(difficulty !== undefined && {
        difficulty: difficulty || null,
      }),
      ...(shippingAddress !== undefined && { shippingAddress: shippingAddress || null }),
      ...(shippingCity !== undefined && { shippingCity: shippingCity || null }),
      ...(shippingPostalCode !== undefined && { shippingPostalCode: shippingPostalCode || null }),
      ...(shippingPhone !== undefined && { shippingPhone: shippingPhone || null }),
    },
  });
  return NextResponse.json(updated);
}
