import { NextResponse } from "next/server";

const CART_REMOVED_RESPONSE = {
  error: "Cart has been removed. Please use direct checkout.",
};

export async function GET() {
  return NextResponse.json(CART_REMOVED_RESPONSE, { status: 410 });
}

export async function POST() {
  return NextResponse.json(CART_REMOVED_RESPONSE, { status: 410 });
}

export async function DELETE() {
  return NextResponse.json(CART_REMOVED_RESPONSE, { status: 410 });
}
