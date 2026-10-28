"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { median, suggestReason } from "@/lib/mistakes";
import { createClient } from "@/lib/supabase/server";
import type { MistakeReason } from "@/lib/types";

export type SubmittedAnswer = { questionId: string; chosen: string | null; seconds: number };

export async function submitTest(sessionId: string, answers: SubmittedAnswer[], timeRanOut: boolean) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: session } = await supabase.from("test_sessions").select("id, finished_at").eq("id", sessionId).single();
  if (!session) throw new Error("Test not found");
  if (session.finished_at) redirect(`/test/${sessionId}/results`);

  const { data: attempts } = await supabase
    .from("attempts")
    .select("id, position, question_id, questions(correct_option, topic_id, marks)")
    .eq("session_id", sessionId)
    .order("position");
  if (!attempts) throw new Error("Test not found");

  const { data: exam } = await supabase
    .from("test_sessions")
    .select("exams(negative_mark)")
    .eq("id", sessionId)
    .single();
  const negativeMark = Number((exam?.exams as unknown as { negative_mark: number } | null)?.negative_mark ?? 0);

  const byQuestion = new Map(answers.map((a) => [a.questionId, a]));
  type Q = { correct_option: string | null; topic_id: string | null; marks: number };

  // History from earlier tests, for the reason suggestions.
  const topicIds = Array.from(new Set(attempts.map((a) => (a.questions as unknown as Q).topic_id).filter(Boolean))) as string[];
  const { data: history } = await supabase
    .from("attempts")
    .select("is_correct, seconds_spent, chosen_option, questions!inner(topic_id)")
    .neq("session_id", sessionId)
    .not("answered_at", "is", null)
    .in("questions.topic_id", topicIds.length ? topicIds : ["00000000-0000-0000-0000-000000000000"]);

  const topicStats = new Map<string, { attempted: number; correct: number; seconds: number[] }>();
  for (const h of history ?? []) {
    const topicId = (h.questions as unknown as { topic_id: string }).topic_id;
    const s = topicStats.get(topicId) ?? { attempted: 0, correct: 0, seconds: [] };
    if (h.chosen_option) {
      s.attempted += 1;
      if (h.is_correct) s.correct += 1;
      s.seconds.push(h.seconds_spent);
    }
    topicStats.set(topicId, s);
  }
  const sessionMedian = median(answers.filter((a) => a.chosen).map((a) => a.seconds));

  let score = 0;
  let maxScore = 0;
  const now = new Date().toISOString();
  const mistakes: { attempt_id: string; user_id: string; question_id: string; suggested_reason: MistakeReason; reason: MistakeReason }[] = [];

  for (const a of attempts) {
    const q = a.questions as unknown as Q;
    const answer = byQuestion.get(a.question_id);
    const chosen = answer?.chosen ?? null;
    const isCorrect = chosen !== null && chosen === q.correct_option;
    const marks = Number(q.marks ?? 1);

    maxScore += marks;
    if (isCorrect) score += marks;
    else if (chosen !== null) score -= negativeMark;

    await supabase
      .from("attempts")
      .update({
        chosen_option: chosen,
        is_correct: chosen === null ? null : isCorrect,
        seconds_spent: Math.round(answer?.seconds ?? 0),
        answered_at: chosen === null ? null : now,
      })
      .eq("id", a.id);

    if (!isCorrect) {
      const stats = q.topic_id ? topicStats.get(q.topic_id) : undefined;
      const typical = stats && stats.seconds.length >= 3 ? median(stats.seconds) : sessionMedian;
      const suggested = suggestReason({
        answered: chosen !== null,
        secondsSpent: answer?.seconds ?? 0,
        positionFromEnd: attempts.length - 1 - a.position,
        totalQuestions: attempts.length,
        typicalSeconds: typical,
        topicHistory: { attempted: stats?.attempted ?? 0, correct: stats?.correct ?? 0 },
        timeRanOut,
      });
      // Pre-filled with the suggestion; the student confirms or changes it on the results screen.
      mistakes.push({ attempt_id: a.id, user_id: user.id, question_id: a.question_id, suggested_reason: suggested, reason: suggested });
    }
  }

  if (mistakes.length) await supabase.from("mistakes").insert(mistakes);
  await supabase.from("test_sessions").update({ finished_at: now, score, max_score: maxScore }).eq("id", sessionId);

  redirect(`/test/${sessionId}/results`);
}

export async function setMistakeReason(sessionId: string, mistakeId: string, reason: MistakeReason) {
  const supabase = await createClient();
  const { error } = await supabase.from("mistakes").update({ reason }).eq("id", mistakeId);
  if (error) throw new Error(error.message);
  revalidatePath(`/test/${sessionId}/results`);
}
