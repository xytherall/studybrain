import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { QuestionOption } from "@/lib/types";
import { TestRunner } from "./TestRunner";

export default async function TestPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: session } = await supabase.from("test_sessions").select("id, started_at, finished_at, time_limit_seconds").eq("id", id).maybeSingle();
  if (!session) notFound();
  if (session.finished_at) redirect(`/test/${id}/results`);

  // The correct answer is deliberately not sent to the browser.
  const { data: attempts } = await supabase
    .from("attempts")
    .select("position, question_id, questions(body, options)")
    .eq("session_id", id)
    .order("position");

  const questions = (attempts ?? []).map((a) => {
    const q = a.questions as unknown as { body: string; options: QuestionOption[] };
    return { id: a.question_id, body: q.body, options: q.options };
  });

  return (
    <TestRunner
      sessionId={id}
      questions={questions}
      startedAt={session.started_at}
      timeLimitSeconds={session.time_limit_seconds ?? questions.length * 54}
    />
  );
}
