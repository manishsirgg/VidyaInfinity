import fs from "fs";
import path from "path";
import { deflateSync } from "zlib";
import sharp from "sharp";
import { NextResponse } from "next/server";
import { requireApiUser } from "@/lib/auth/api-auth";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

const BRAND = {
  name: "Vidya Infinity",
  tagline: "Global Education Architects",
  website: "https://vidyainfinity.com",
  email: "infovidyainfinity@gmail.com",
  phone: "+91-7828199500",
};

type LogoImage = { width: number; height: number; compressedRgb: Buffer };

function esc(s: string) {
  return s.replaceAll("\\", "\\\\").replaceAll("(", "\\(").replaceAll(")", "\\)");
}

function wrapText(text: string, maxChars = 88): string[] {
  const words = String(text || "").split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (candidate.length > maxChars) {
      if (current) lines.push(current);
      current = word;
    } else current = candidate;
  }
  if (current) lines.push(current);
  return lines.length ? lines : ["Not available"];
}

type Block = { type: "title" | "text" | "bullet"; text: string };

function toAsciiListText(value: string) {
  return String(value || "")
    .replace(/^[\s]*(?:â€¢|•|●|▪|◦|·)\s*/g, "")
    .replace(/\s*(?:â€¢|•|●|▪|◦|·)\s*/g, " - ")
    .trim();
}

function mkPdf(blocks: Block[], logoImage: LogoImage | null) {
  const pageWidth = 595;
  const pageHeight = 842;
  const bottomMargin = 58;
  const left = 45;
  const right = 550;
  const bodyStart = pageHeight - 175;

  const pages: string[][] = [];
  let page: string[] = [];
  let y = bodyStart;

  const add = (cmd: string) => page.push(cmd);

  const drawHeader = () => {
    add(`0.06 0.1 0.24 rg 0 ${pageHeight - 130} ${pageWidth} 130 re f`);
    add(`1 1 1 rg BT /F2 15 Tf ${left} ${pageHeight - 55} Td (${esc(BRAND.name)}) Tj ET`);
    add(`0.81 0.91 1 rg BT /F1 10 Tf ${left} ${pageHeight - 72} Td (${esc(BRAND.tagline)}) Tj ET`);
    add(`1 1 1 rg BT /F2 12 Tf ${left} ${pageHeight - 92} Td (Psychometric Report) Tj ET`);

    const boxX = 410;
    const boxY = pageHeight - 122;
    const boxW = 136;
    const boxH = 88;
    const pad = 10;
    add(`0.99 0.99 0.99 rg ${boxX} ${boxY} ${boxW} ${boxH} re f`);
    add(`0.86 0.89 0.95 RG 1 w ${boxX} ${boxY} ${boxW} ${boxH} re S`);

    if (logoImage) {
      const fitW = boxW - pad * 2;
      const fitH = boxH - pad * 2;
      const ratio = Math.min(fitW / logoImage.width, fitH / logoImage.height);
      const drawW = Math.max(1, logoImage.width * ratio);
      const drawH = Math.max(1, logoImage.height * ratio);
      const drawX = boxX + (boxW - drawW) / 2;
      const drawY = boxY + (boxH - drawH) / 2;
      add(`q ${drawW.toFixed(2)} 0 0 ${drawH.toFixed(2)} ${drawX.toFixed(2)} ${drawY.toFixed(2)} cm /Im1 Do Q`);
    } else {
      add(`0.2 0.25 0.35 rg BT /F2 9 Tf ${boxX + 12} ${pageHeight - 70} Td (${esc(BRAND.name)}) Tj ET`);
      add(`0.28 0.33 0.42 rg BT /F1 8 Tf ${boxX + 12} ${pageHeight - 83} Td (${esc(BRAND.tagline)}) Tj ET`);
    }
  };

  const newPage = () => {
    if (page.length) pages.push(page);
    page = [];
    y = bodyStart;
    drawHeader();
  };

  newPage();

  const ensureSpace = (height = 16) => {
    if (y - height < bottomMargin) newPage();
  };

  for (const block of blocks) {
    if (block.type === "title") {
      ensureSpace(20);
      add(`0.14 0.23 0.44 rg BT /F2 12 Tf ${left} ${y} Td (${esc(block.text)}) Tj ET`);
      y -= 18;
      add(`0.88 0.9 0.95 rg ${left} ${y + 6} ${right - left} 1 re f`);
      y -= 8;
      continue;
    }

    const prefix = block.type === "bullet" ? "- " : "";
    const wrapped = wrapText(prefix + toAsciiListText(block.text));
    for (const line of wrapped) {
      ensureSpace(14);
      add(`0.18 0.2 0.24 rg BT /F1 10 Tf ${left} ${y} Td (${esc(line)}) Tj ET`);
      y -= 14;
    }
    y -= 2;
  }

  if (page.length) pages.push(page);

  const objects: string[] = [];
  objects.push("1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n");
  const pageObjectIds: number[] = [];
  const contentObjectIds: number[] = [];
  const fontRegularId = 3 + pages.length * 2;
  const fontBoldId = fontRegularId + 1;
  const imageId = logoImage ? fontBoldId + 1 : null;

  for (let i = 0; i < pages.length; i += 1) {
    pageObjectIds.push(3 + i * 2);
    contentObjectIds.push(4 + i * 2);
  }

  objects.push(`2 0 obj\n<< /Type /Pages /Kids [${pageObjectIds.map((id) => `${id} 0 R`).join(" ")}] /Count ${pages.length} >>\nendobj\n`);

  for (let i = 0; i < pages.length; i += 1) {
    const footer = [
      `0.55 0.58 0.65 rg ${left} 32 ${right - left} 1 re f`,
      `0.35 0.37 0.42 rg BT /F1 8 Tf ${left} 20 Td (${esc(`Website: ${BRAND.website} | Email: ${BRAND.email} | WhatsApp/Call: ${BRAND.phone}`)}) Tj ET`,
      `0.35 0.37 0.42 rg BT /F1 8 Tf ${left} 10 Td (${esc(`${BRAND.name} | ${BRAND.tagline}`)}) Tj ET`,
      `0.35 0.37 0.42 rg BT /F1 8 Tf 520 10 Td (${esc(`Page ${i + 1} of ${pages.length}`)}) Tj ET`,
    ];
    const stream = [...pages[i], ...footer].join("\n");
    const xobj = logoImage && imageId ? ` /XObject << /Im1 ${imageId} 0 R >>` : "";
    objects.push(`${pageObjectIds[i]} 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageWidth} ${pageHeight}] /Contents ${contentObjectIds[i]} 0 R /Resources << /Font << /F1 ${fontRegularId} 0 R /F2 ${fontBoldId} 0 R >>${xobj} >> >>\nendobj\n`);
    objects.push(`${contentObjectIds[i]} 0 obj\n<< /Length ${Buffer.byteLength(stream, "utf8")} >>\nstream\n${stream}\nendstream\nendobj\n`);
  }

  objects.push(`${fontRegularId} 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n`);
  objects.push(`${fontBoldId} 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>\nendobj\n`);

  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  for (const object of objects) {
    offsets.push(Buffer.byteLength(pdf, "utf8"));
    pdf += object;
  }

  let imageSection = Buffer.alloc(0);
  if (logoImage && imageId) {
    const imageObjPrefix = `${imageId} 0 obj\n<< /Type /XObject /Subtype /Image /Width ${logoImage.width} /Height ${logoImage.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /FlateDecode /Length ${logoImage.compressedRgb.length} >>\nstream\n`;
    const imageObjSuffix = "\nendstream\nendobj\n";
    const prefixBuffer = Buffer.from(imageObjPrefix, "utf8");
    const suffixBuffer = Buffer.from(imageObjSuffix, "utf8");
    offsets.push(Buffer.byteLength(pdf, "utf8") + imageSection.length);
    imageSection = Buffer.concat([imageSection, prefixBuffer, logoImage.compressedRgb, suffixBuffer]);
  }

  const beforeXref = Buffer.concat([Buffer.from(pdf, "utf8"), imageSection]);
  const xrefStart = beforeXref.length;
  let xref = `xref\n0 ${objects.length + 1 + (logoImage ? 1 : 0)}\n0000000000 65535 f \n`;
  for (let i = 1; i <= objects.length + (logoImage ? 1 : 0); i += 1) xref += `${String(offsets[i]).padStart(10, "0")} 00000 n \n`;
  xref += `trailer\n<< /Size ${objects.length + 1 + (logoImage ? 1 : 0)} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF`;
  return Buffer.concat([beforeXref, Buffer.from(xref, "utf8")]);
}

async function loadLogoImage(): Promise<LogoImage | null> {
  const logoPath = path.join(process.cwd(), "public", "brand", "vidyainfinitylogo.png");
  if (!fs.existsSync(logoPath)) return null;
  try {
    const { data, info } = await sharp(logoPath).ensureAlpha().removeAlpha().raw().toBuffer({ resolveWithObject: true });
    return { width: info.width, height: info.height, compressedRgb: deflateSync(data) };
  } catch {
    return null;
  }
}

export async function GET(_: Request, { params }: { params: Promise<{ reportId: string }> }) {
  const auth = await requireApiUser();
  if ("error" in auth) return auth.error;
  const { reportId } = await params;
  const logoImage = await loadLogoImage();

  const admin = getSupabaseAdmin();
  if (!admin.ok) return NextResponse.json({ error: admin.error }, { status: 500 });

  const { data: report } = await admin.data.from("psychometric_reports").select("*,psychometric_tests(title),profiles(full_name)").eq("id", reportId).single();
  if (!report) return NextResponse.json({ error: "Report not found" }, { status: 404 });
  if (auth.profile.role !== "admin" && report.user_id !== auth.profile.id) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const strengths = Array.isArray(report.strengths) ? report.strengths.map((s: unknown) => toAsciiListText(String(s))) : String(report.strengths ?? "").split(",").map((s: string) => toAsciiListText(s)).filter(Boolean);
  const improvements = Array.isArray(report.improvement_areas) ? report.improvement_areas.map((s: unknown) => toAsciiListText(String(s))) : String(report.improvement_areas ?? "").split(",").map((s: string) => toAsciiListText(s)).filter(Boolean);
  const recommendations = Array.isArray(report.recommendations) ? report.recommendations.map((s: unknown) => toAsciiListText(String(s))) : String(report.recommendations ?? "").split(",").map((s: string) => toAsciiListText(s)).filter(Boolean);
  const dims = report.dimension_scores && typeof report.dimension_scores === "object" ? Object.entries(report.dimension_scores as Record<string, { score: number; maxScore: number; percentage: number }>) : [];

  const blocks: Block[] = [
    { type: "title", text: "Report Details" },
    { type: "text", text: `Student Name: ${report.profiles?.full_name ?? "Not available"}` },
    { type: "text", text: `Test Title: ${report.psychometric_tests?.title ?? "Not available"}` },
    { type: "text", text: `Generated Date: ${new Date(report.generated_at ?? report.created_at).toLocaleString()}` },
    { type: "title", text: "Score Summary" },
    { type: "text", text: `Total Score: ${report.total_score ?? "Not available"}` },
    { type: "text", text: `Max Score: ${report.max_score ?? "Not available"}` },
    { type: "text", text: `Percentage: ${Number(report.percentage_score ?? 0).toFixed(2)}%` },
    { type: "text", text: `Result Band: ${report.result_band ?? "Not available"}` },
    { type: "title", text: "Summary" },
    { type: "text", text: report.summary ?? "Not available" },
    { type: "title", text: "Dimension Scores" },
    ...(dims.length ? dims.map(([key, value]) => ({ type: "bullet" as const, text: `${key}: ${value?.score ?? 0}/${value?.maxScore ?? 0} (${value?.percentage ?? 0}%)` })) : [{ type: "text" as const, text: "Not available" }]),
    { type: "title", text: "Strengths" },
    ...((strengths.length ? strengths : ["Not available"]).map((s: string) => ({ type: "bullet" as const, text: s }))),
    { type: "title", text: "Improvement Areas" },
    ...((improvements.length ? improvements : ["Not available"]).map((s: string) => ({ type: "bullet" as const, text: s }))),
    { type: "title", text: "Recommendations" },
    ...((recommendations.length ? recommendations : ["Not available"]).map((s: string) => ({ type: "bullet" as const, text: s }))),
    { type: "title", text: "Disclaimer" },
    { type: "text", text: report.disclaimer ?? "This report is for educational and guidance purposes only. It is not a medical, psychiatric, or clinical diagnosis." },
  ];

  const pdf = mkPdf(blocks, logoImage);
  return new NextResponse(pdf, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename=vidya-infinity-psychometric-report-${reportId}.pdf`,
    },
  });
}
