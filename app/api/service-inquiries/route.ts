import { NextResponse } from "next/server";

import { triggerServiceInquiryAutomations } from "@/lib/integrations/service-inquiries";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { serviceInquirySchema } from "@/lib/validations/forms";

export async function POST(request: Request) {
  const payload = serviceInquirySchema.safeParse(await request.json());

  if (!payload.success) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const admin = getSupabaseAdmin();
  if (!admin.ok) return NextResponse.json({ error: admin.error }, { status: 500 });

  const { data: inserted, error } = await admin.data
    .from("crm_leads")
    .insert({
      name: payload.data.name,
      email: payload.data.email,
      phone: payload.data.phone,
      source: "contact_page",
      inquiry_type: payload.data.inquiryType,
      message: payload.data.message,
      metadata: {
        channel: "website_contact_page",
      },
    })
    .select("id")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const integrationStatus = await triggerServiceInquiryAutomations(payload.data);

  return NextResponse.json({
    ok: true,
    leadId: inserted.id,
    integrations: integrationStatus,
  });
}
