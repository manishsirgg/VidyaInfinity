import { NextResponse } from "next/server";

export async function POST() {
  return NextResponse.json(
    {
      error:
        "Student registration moved to /auth/register. Submit the combined registration form with identity documents for admin approval.",
    },
    { status: 410 }
  );
}
