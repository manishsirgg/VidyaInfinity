import { NextResponse } from "next/server";
import { requireApiUser } from "@/lib/auth/api-auth";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

function esc(s: string) { return s.replaceAll("\\", "\\\\").replaceAll("(", "\\(").replaceAll(")", "\\)"); }
function mkPdf(lines: string[]) { let y = 770; const body = lines.map((l) => { const c = `BT /F1 11 Tf 50 ${y} Td (${esc(l)}) Tj ET`; y -= 18; return c; }).join("\n"); const objs=["1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n","2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n",`3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>\nendobj\n`,`4 0 obj\n<< /Length ${Buffer.byteLength(body,"utf8")} >>\nstream\n${body}\nendstream\nendobj\n`,`5 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n`]; let pdf="%PDF-1.4\n"; const off=[0]; for (const o of objs){off.push(Buffer.byteLength(pdf,"utf8")); pdf+=o;} const x=Buffer.byteLength(pdf,"utf8"); pdf+=`xref\n0 ${objs.length+1}\n0000000000 65535 f \n`; for(let i=1;i<=objs.length;i++) pdf+=`${String(off[i]).padStart(10,"0")} 00000 n \n`; pdf+=`trailer\n<< /Size ${objs.length+1} /Root 1 0 R >>\nstartxref\n${x}\n%%EOF`; return Buffer.from(pdf,"utf8"); }

export async function GET(_: Request, { params }: { params: Promise<{ reportId: string }> }) {
  const auth = await requireApiUser();
  if ("error" in auth) return auth.error;
  const { reportId } = await params;
  const admin = getSupabaseAdmin(); if (!admin.ok) return NextResponse.json({ error: admin.error }, { status: 500 });
  const { data: report } = await admin.data.from("psychometric_reports").select("*,psychometric_tests(title),profiles(full_name)").eq("id", reportId).single();
  if (!report) return NextResponse.json({ error: "Report not found" }, { status: 404 });
  if (auth.profile.role !== "admin" && report.user_id !== auth.user.id) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const lines = ["Vidya Infinity Psychometric Report",`Student: ${report.profiles?.full_name ?? "Student"}`,`Test: ${report.psychometric_tests?.title ?? "Psychometric Test"}`,`Generated: ${report.generated_at}`,`Total Score: ${report.total_score}`,`Percentage: ${report.percentage_score}%`,`Result Band: ${report.result_band ?? "N/A"}`,`Summary: ${report.summary ?? ""}`,"Disclaimer: This report is for educational and guidance purposes only. It is not a medical, psychiatric, or clinical diagnosis."];
  const pdf = mkPdf(lines);
  return new NextResponse(pdf, { headers: { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename=vidya-infinity-psychometric-report-${reportId}.pdf` } });
}
