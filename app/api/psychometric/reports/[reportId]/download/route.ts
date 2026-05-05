import { NextResponse } from "next/server";
import { requireApiUser } from "@/lib/auth/api-auth";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

function esc(s: string) {
  return s.replaceAll("\\", "\\\\").replaceAll("(", "\\(").replaceAll(")", "\\)");
}

function wrapText(text: string, maxChars = 90): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (candidate.length > maxChars) {
      if (current) lines.push(current);
      current = word;
    } else {
      current = candidate;
    }
  }
  if (current) lines.push(current);
  return lines.length ? lines : [""];
}

function mkPdf(lines: string[]) {
  const pageHeight = 842;
  const topMargin = 60;
  const bottomMargin = 60;
  const lineHeight = 16;
  const startY = pageHeight - topMargin;

  const pages: string[] = [];
  let y = startY;
  let currentPage: string[] = [];

  const pushLine = (line: string) => {
    if (y < bottomMargin) {
      pages.push(currentPage.join("\n"));
      currentPage = [];
      y = startY;
    }
    currentPage.push(`BT /F1 11 Tf 50 ${y} Td (${esc(line)}) Tj ET`);
    y -= lineHeight;
  };

  for (const line of lines) {
    for (const wrapped of wrapText(line, 92)) pushLine(wrapped);
  }
  pages.push(currentPage.join("\n"));

  const objects: string[] = [];
  objects.push("1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n");
  const pageObjectIds: number[] = [];
  const contentObjectIds: number[] = [];
  for (let i = 0; i < pages.length; i += 1) {
    pageObjectIds.push(3 + i * 2);
    contentObjectIds.push(4 + i * 2);
  }
  objects.push(`2 0 obj\n<< /Type /Pages /Kids [${pageObjectIds.map((id) => `${id} 0 R`).join(" ")}] /Count ${pages.length} >>\nendobj\n`);

  for (let i = 0; i < pages.length; i += 1) {
    objects.push(`${pageObjectIds[i]} 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents ${contentObjectIds[i]} 0 R /Resources << /Font << /F1 ${3 + pages.length * 2} 0 R >> >> >>\nendobj\n`);
    objects.push(`${contentObjectIds[i]} 0 obj\n<< /Length ${Buffer.byteLength(pages[i], "utf8")} >>\nstream\n${pages[i]}\nendstream\nendobj\n`);
  }

  objects.push(`${3 + pages.length * 2} 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n`);

  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  for (const object of objects) {
    offsets.push(Buffer.byteLength(pdf, "utf8"));
    pdf += object;
  }

  const xrefStart = Buffer.byteLength(pdf, "utf8");
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (let i = 1; i <= objects.length; i += 1) pdf += `${String(offsets[i]).padStart(10, "0")} 00000 n \n`;
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF`;
  return Buffer.from(pdf, "utf8");
}

export async function GET(_: Request, { params }: { params: Promise<{ reportId: string }> }) {
  const auth = await requireApiUser();
  if ("error" in auth) return auth.error;
  const { reportId } = await params;

  const admin = getSupabaseAdmin();
  if (!admin.ok) return NextResponse.json({ error: admin.error }, { status: 500 });

  const { data: report } = await admin.data.from("psychometric_reports").select("*,psychometric_tests(title),profiles(full_name)").eq("id", reportId).single();
  if (!report) return NextResponse.json({ error: "Report not found" }, { status: 404 });
  if (auth.profile.role !== "admin" && report.user_id !== auth.profile.id) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const strengths: string[] = Array.isArray(report.strengths) ? report.strengths.map((s: unknown) => String(s)) : String(report.strengths ?? "").split(",").map((s: string) => s.trim()).filter(Boolean);
  const improvements: string[] = Array.isArray(report.improvement_areas) ? report.improvement_areas.map((s: unknown) => String(s)) : String(report.improvement_areas ?? "").split(",").map((s: string) => s.trim()).filter(Boolean);
  const recommendations: string[] = Array.isArray(report.recommendations) ? report.recommendations.map((s: unknown) => String(s)) : String(report.recommendations ?? "").split(",").map((s: string) => s.trim()).filter(Boolean);

  const lines = [
    "Vidya Infinity Psychometric Report",
    "",
    `Student: ${report.profiles?.full_name ?? "Student"}`,
    `Test: ${report.psychometric_tests?.title ?? "Psychometric Test"}`,
    `Generated: ${new Date(report.generated_at ?? report.created_at).toLocaleString()}`,
    "",
    `Total Score: ${report.total_score ?? 0}`,
    `Max Score: ${report.max_score ?? 0}`,
    `Percentage: ${Number(report.percentage_score ?? 0).toFixed(2)}%`,
    `Result Band: ${report.result_band ?? "N/A"}`,
    "",
    `Summary: ${report.summary ?? ""}`,
    "",
    "Strengths:",
    ...strengths.map((s: string) => `- ${s}`),
    "",
    "Improvement Areas:",
    ...improvements.map((s: string) => `- ${s}`),
    "",
    "Recommendations:",
    ...recommendations.map((s: string) => `- ${s}`),
    "",
    "Disclaimer: This report is for educational and guidance purposes only. It is not a medical, psychiatric, or clinical diagnosis.",
  ];

  const pdf = mkPdf(lines);
  return new NextResponse(pdf, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename=vidya-infinity-psychometric-report-${reportId}.pdf`,
    },
  });
}
