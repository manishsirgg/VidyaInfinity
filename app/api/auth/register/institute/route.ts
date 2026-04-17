import { NextResponse } from "next/server";

export async function POST() {
  return NextResponse.json(
    {
      error:
        "Institute registration moved to /auth/register. Submit the combined registration form with identity and institute approval documents.",
    },
    { status: 410 }
  );
}
