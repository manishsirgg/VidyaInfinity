import { NextResponse } from "next/server";

import { supabaseAdmin } from "@/lib/supabase/admin";
import { serviceInquirySchema } from "@/lib/validations/forms";

export async function POST(request: Request) {
  const payload = serviceInquirySchema.safeParse(await request.json());

  if (!payload.success) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const { error } = await supabaseAdmin.from("crm_leads").insert({
    name: payload.data.name,
    email: payload.data.email,
    phone: payload.data.phone,
    source: "service_inquiry",
    inquiry_type: payload.data.inquiryType,
    message: payload.data.message,
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
