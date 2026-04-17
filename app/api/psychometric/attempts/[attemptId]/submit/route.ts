import { NextResponse } from "next/server";

import { requireApiUser } from "@/lib/auth/api-auth";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { getSignedPrivateFileUrl, uploadPsychometricReport } from "@/lib/storage/uploads";

function escapePdfText(input: string) {
  return input.replaceAll("\\", "\\\\").replaceAll("(", "\\(").replaceAll(")", "\\)");
}

function buildSimplePdf(report: { totalScore: number; submittedAt: string; questionsAnswered: number; interpretation: string }) {
  const lines = [
    "Vidya Infinity Psychometric Report",
    `Submitted At: ${report.submittedAt}`,
    `Questions Answered: ${report.questionsAnswered}`,
    `Total Score: ${report.totalScore}`,
    `Interpretation: ${report.interpretation}`,
  ];

  let y = 760;
  const commands = lines
    .map((line) => {
      const cmd = `BT /F1 12 Tf 50 ${y} Td (${escapePdfText(line)}) Tj ET`;
      y -= 22;
      return cmd;
    })
    .join("\n");

  const stream = `${commands}\n`;
  const objects = [
    "1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n",
    "2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n",
    "3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>\nendobj\n",
    `4 0 obj\n<< /Length ${Buffer.byteLength(stream, "utf8")} >>\nstream\n${stream}endstream\nendobj\n`,
    "5 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n",
  ];

  let pdf = "%PDF-1.4\n";
  const offsets: number[] = [0];

  for (const obj of objects) {
    offsets.push(Buffer.byteLength(pdf, "utf8"));
    pdf += obj;
  }

  const xrefStart = Buffer.byteLength(pdf, "utf8");
  pdf += `xref\n0 ${objects.length + 1}\n`;
  pdf += "0000000000 65535 f \n";

  for (let i = 1; i <= objects.length; i += 1) {
    pdf += `${String(offsets[i]).padStart(10, "0")} 00000 n \n`;
  }

  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF`;
  return Buffer.from(pdf, "utf8");
}

export async function POST(request: Request, { params }: { params: Promise<{ attemptId: string }> }) {
  const auth = await requireApiUser("student");
  if ("error" in auth) return auth.error;

  const { attemptId } = await params;
  const { answers } = await request.json();

  if (!Array.isArray(answers) || !answers.length) {
    return NextResponse.json({ error: "answers array is required" }, { status: 400 });
  }

  const admin = getSupabaseAdmin();
  if (!admin.ok) return NextResponse.json({ error: admin.error }, { status: 500 });

  const { data: attempt } = await admin.data
    .from("test_attempts")
    .select("id,user_id,test_id,status")
    .eq("id", attemptId)
    .eq("user_id", auth.user.id)
    .single();

  if (!attempt) return NextResponse.json({ error: "Attempt not found" }, { status: 404 });

  if (attempt.status === "completed") {
    return NextResponse.json({ ok: true, idempotent: true });
  }

  const questionIds = answers.map((answer: { questionId: string }) => answer.questionId);
  const { data: options } = await admin.data
    .from("psychometric_question_options")
    .select("id,question_id,score")
    .in("question_id", questionIds);

  const optionMap = new Map((options ?? []).map((option) => [option.id, option]));

  const answerRows = answers.map((answer: { questionId: string; optionId: string }) => {
    const option = optionMap.get(answer.optionId);
    return {
      attempt_id: attempt.id,
      user_id: auth.user.id,
      test_id: attempt.test_id,
      question_id: answer.questionId,
      option_id: answer.optionId,
      score_awarded: option?.score ?? 0,
    };
  });

  const { error: deleteError } = await admin.data
    .from("psychometric_answers")
    .delete()
    .eq("attempt_id", attempt.id)
    .eq("user_id", auth.user.id);

  if (deleteError) return NextResponse.json({ error: deleteError.message }, { status: 500 });

  const { error: answerError } = await admin.data.from("psychometric_answers").insert(answerRows);
  if (answerError) return NextResponse.json({ error: answerError.message }, { status: 500 });

  const totalScore = answerRows.reduce((sum, item) => sum + Number(item.score_awarded ?? 0), 0);

  const report = {
    totalScore,
    submittedAt: new Date().toISOString(),
    questionsAnswered: answerRows.length,
    interpretation:
      totalScore >= 80 ? "Excellent alignment" : totalScore >= 50 ? "Moderate alignment" : "Needs guidance",
  };

  const reportPdf = buildSimplePdf(report);

  const uploaded = await uploadPsychometricReport({
    userId: auth.user.id,
    attemptId: attempt.id,
    pdfBuffer: reportPdf,
  });

  if (uploaded.error) return NextResponse.json({ error: uploaded.error }, { status: 500 });
  if (!uploaded.path) return NextResponse.json({ error: "Unable to store report" }, { status: 500 });

  const { error: updateError } = await admin.data
    .from("test_attempts")
    .update({
      status: "completed",
      completed_at: new Date().toISOString(),
      score: totalScore,
      report_url: uploaded.path,
      report_storage_path: uploaded.path,
    })
    .eq("id", attempt.id)
    .eq("user_id", auth.user.id);

  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 });

  const signedUrl = await getSignedPrivateFileUrl({
    bucket: "psychometric-reports",
    fileRef: uploaded.path,
  });

  return NextResponse.json({ ok: true, score: totalScore, reportUrl: signedUrl, report });
}
