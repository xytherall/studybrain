import Link from "next/link";
import { notFound } from "next/navigation";
import { MathText } from "@/components/MathText";
import { createClient } from "@/lib/supabase/server";
import type { MistakeReason, QuestionOption } from "@/lib/types";
import { ReasonPicker } from "./ReasonPicker";

type Row = {
  id: string;
  reason: MistakeReason | null;
  suggested_reason: MistakeReason | null;
  attempts: { chosen_option: string | null; seconds_spent: number; position: number };
  questions: {
    body: string;
    options: QuestionOption[];
    correct_option: string | null;
    topics: { subject: string; topic: string } | null;
  };
};

export default async function ResultsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: session } = await supabase
    .from("test_sessions")
    .select("id, score, max_score, finished_at, source_file_id")
    .eq("id", id)
    .maybeSingle();
  if (!session?.finished_at) notFound();

  const { data } = await supabase
    .from("mistakes")
    .select(
      "id, reason, suggested_reason, attempts!inner(chosen_option, seconds_spent, position, session_id), questions(body, options, correct_option, topics(subject, topic))",
    )
    .eq("attempts.session_id", id);

  const mistakes = ((data ?? []) as unknown as Row[]).sort((a, b) => a.attempts.position - b.attempts.position);

  // Marks lost by topic in this test.
  const byTopic = new Map<string, number>();
  for (const m of mistakes) {
    const t = m.questions.topics;
    const label = t ? `${t.subject}: ${t.topic}` : "No topic";
    byTopic.set(label, (byTopic.get(label) ?? 0) + 1);
  }
  const topTopics = Array.from(byTopic.entries()).sort((a, b) => b[1] - a[1]).slice(0, 5);

  return (
    <div className="space-y-6">
      <div className="card space-y-1 text-center">
        <div className="text-sm text-slate-600">Your score</div>
        <div className="text-4xl font-bold">
          {session.score} / {session.max_score}
        </div>
        <div className="text-sm text-slate-600">{mistakes.length} questions to look at</div>
      </div>

      {topTopics.length > 0 && (
        <section className="card space-y-2">
          <h2 className="font-semibold">Where you lost marks</h2>
          {topTopics.map(([label, count]) => (
            <div key={label} className="flex justify-between text-sm">
              <span>{label}</span>
              <span className="text-slate-600">
                {count} {count === 1 ? "question" : "questions"}
              </span>
            </div>
          ))}
        </section>
      )}

      <section className="space-y-3">
        <h2 className="font-semibold">Why did you get these wrong?</h2>
        <p className="text-sm text-slate-600">We&apos;ve guessed a reason for each one. Tap to change it if it&apos;s wrong.</p>
        {mistakes.map((m) => (
          <div key={m.id} className="card space-y-3">
            <div className="text-xs text-slate-500">
              Q{m.attempts.position + 1} · {Math.round(m.attempts.seconds_spent)}s
              {m.questions.topics ? ` · ${m.questions.topics.subject}: ${m.questions.topics.topic}` : ""}
            </div>
            <MathText text={m.questions.body} className="block" />
            <ul className="space-y-1 text-sm">
              {m.questions.options.map((o) => (
                <li
                  key={o.key}
                  className={
                    o.key === m.questions.correct_option
                      ? "font-semibold text-green-700"
                      : o.key === m.attempts.chosen_option
                        ? "text-red-600 line-through"
                        : ""
                  }
                >
                  {o.key}. <MathText text={o.text} />
                </li>
              ))}
            </ul>
            <ReasonPicker sessionId={id} mistakeId={m.id} initial={m.reason ?? m.suggested_reason} suggested={m.suggested_reason} />
          </div>
        ))}
      </section>

      <Link href="/home" className="btn-secondary">
        Back to home
      </Link>
    </div>
  );
}
