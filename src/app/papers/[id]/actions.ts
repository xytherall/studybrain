"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { QuestionOption } from "@/lib/types";

async function refreshFileStatus(fileId: string) {
  const supabase = await createClient();
  const { count } = await supabase
    .from("questions")
    .select("id", { count: "exact", head: true })
    .eq("source_file_id", fileId)
    .eq("status", "draft");
  await supabase
    .from("source_files")
    .update({ status: count ? "needs_review" : "done" })
    .eq("id", fileId)
    .in("status", ["needs_review", "done"]);
  revalidatePath(`/papers/${fileId}`);
}

export async function saveQuestion(
  fileId: string,
  questionId: string,
  values: {
    body: string;
    options: QuestionOption[];
    correct_option: string | null;
    topic_id: string | null;
    status: "draft" | "approved" | "rejected";
  },
) {
  const supabase = await createClient();
  const { error } = await supabase.from("questions").update(values).eq("id", questionId);
  if (error) throw new Error(error.message);
  await refreshFileStatus(fileId);
}

// Approves every draft that already has an answer and a topic. Returns how many still need attention.
export async function approveReady(fileId: string) {
  const supabase = await createClient();
  await supabase
    .from("questions")
    .update({ status: "approved" })
    .eq("source_file_id", fileId)
    .eq("status", "draft")
    .not("correct_option", "is", null)
    .not("topic_id", "is", null);
  await refreshFileStatus(fileId);
}

export async function startPaperTest(fileId: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: file } = await supabase.from("source_files").select("id, exam_id, exams(total_questions, duration_minutes)").eq("id", fileId).single();
  if (!file) throw new Error("Paper not found");

  const { data: questions } = await supabase
    .from("questions")
    .select("id")
    .eq("source_file_id", fileId)
    .eq("status", "approved")
    .order("number_in_paper");
  if (!questions?.length) throw new Error("Approve some questions first");

  // Real exam pace: the exam's minutes per question, times the number of questions.
  const exam = file.exams as unknown as { total_questions: number; duration_minutes: number };
  const secondsPerQuestion = (exam.duration_minutes * 60) / exam.total_questions;

  const { data: session, error } = await supabase
    .from("test_sessions")
    .insert({
      user_id: user.id,
      exam_id: file.exam_id,
      kind: "paper",
      source_file_id: fileId,
      time_limit_seconds: Math.round(secondsPerQuestion * questions.length),
    })
    .select("id")
    .single();
  if (error || !session) throw new Error(error?.message ?? "Could not start the test");

  await supabase.from("attempts").insert(
    questions.map((q, i) => ({ session_id: session.id, user_id: user.id, question_id: q.id, position: i })),
  );

  redirect(`/test/${session.id}`);
}

export async function rerunExtraction(fileId: string) {
  const { runExtraction } = await import("@/lib/extraction/run");
  const supabase = await createClient();
  const { data: file } = await supabase.from("source_files").select("id").eq("id", fileId).maybeSingle();
  if (!file) throw new Error("Paper not found");
  await runExtraction(file.id);
  revalidatePath(`/papers/${fileId}`);
}
