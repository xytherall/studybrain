"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { MathText } from "@/components/MathText";
import type { QuestionOption } from "@/lib/types";
import { submitTest } from "./actions";

type TestQuestion = { id: string; body: string; options: QuestionOption[] };
type Saved = { answers: Record<string, string | null>; seconds: Record<string, number>; current: number };

function formatTime(total: number) {
  const s = Math.max(0, Math.floor(total));
  const m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, "0")}`;
}

export function TestRunner({
  sessionId,
  questions,
  startedAt,
  timeLimitSeconds,
}: {
  sessionId: string;
  questions: TestQuestion[];
  startedAt: string;
  timeLimitSeconds: number;
}) {
  const storageKey = `test-${sessionId}`;
  const [state, setState] = useState<Saved>({ answers: {}, seconds: {}, current: 0 });
  const [now, setNow] = useState(() => Date.now());
  const [showGrid, setShowGrid] = useState(false);
  const [pending, startTransition] = useTransition();
  const lastTick = useRef(Date.now());
  const submitted = useRef(false);

  // Keep progress if the page is refreshed mid-test.
  useEffect(() => {
    try {
      const raw = localStorage.getItem(storageKey);
      if (raw) setState(JSON.parse(raw));
    } catch {}
  }, [storageKey]);

  useEffect(() => {
    try {
      localStorage.setItem(storageKey, JSON.stringify(state));
    } catch {}
  }, [state, storageKey]);

  const remaining = timeLimitSeconds - (now - Date.parse(startedAt)) / 1000;
  const q = questions[state.current];

  const submit = useCallback(
    (timeRanOut: boolean) => {
      if (submitted.current) return;
      submitted.current = true;
      const payload = questions.map((x) => ({
        questionId: x.id,
        chosen: state.answers[x.id] ?? null,
        seconds: state.seconds[x.id] ?? 0,
      }));
      startTransition(async () => {
        try {
          localStorage.removeItem(storageKey);
        } catch {}
        await submitTest(sessionId, payload, timeRanOut);
      });
    },
    [questions, sessionId, state, storageKey],
  );

  // Every second: count time on the current question and check the timer.
  useEffect(() => {
    const timer = setInterval(() => {
      const t = Date.now();
      const delta = (t - lastTick.current) / 1000;
      lastTick.current = t;
      setNow(t);
      if (document.visibilityState === "visible" && q) {
        setState((s) => ({ ...s, seconds: { ...s.seconds, [q.id]: (s.seconds[q.id] ?? 0) + delta } }));
      }
    }, 1000);
    return () => clearInterval(timer);
  }, [q]);

  useEffect(() => {
    if (remaining <= 0) submit(true);
  }, [remaining, submit]);

  if (!q) return <p>This test has no questions.</p>;

  const answeredCount = questions.filter((x) => state.answers[x.id]).length;
  const go = (i: number) => {
    setState((s) => ({ ...s, current: Math.min(Math.max(i, 0), questions.length - 1) }));
    setShowGrid(false);
  };
  const choose = (key: string) =>
    setState((s) => ({ ...s, answers: { ...s.answers, [q.id]: s.answers[q.id] === key ? null : key } }));

  return (
    <div className="space-y-4">
      <div className="sticky top-0 z-10 flex items-center justify-between rounded-lg bg-white p-3 shadow-sm">
        <button className="text-sm text-blue-600" onClick={() => setShowGrid(!showGrid)}>
          Q{state.current + 1} of {questions.length} · {answeredCount} answered
        </button>
        <span className={`font-mono text-lg ${remaining < 60 ? "text-red-600" : ""}`}>{formatTime(remaining)}</span>
      </div>

      {showGrid && (
        <div className="card grid grid-cols-8 gap-2">
          {questions.map((x, i) => (
            <button
              key={x.id}
              onClick={() => go(i)}
              className={`rounded py-1 text-xs ${
                i === state.current ? "bg-blue-600 text-white" : state.answers[x.id] ? "bg-blue-100" : "bg-slate-100"
              }`}
            >
              {i + 1}
            </button>
          ))}
        </div>
      )}

      <div className="card space-y-4">
        <MathText text={q.body} className="block text-base" />
        <div className="space-y-2">
          {q.options.map((o) => (
            <button
              key={o.key}
              onClick={() => choose(o.key)}
              className={`block w-full rounded-lg border p-3 text-left text-sm ${
                state.answers[q.id] === o.key ? "border-blue-600 bg-blue-50" : "border-slate-200 bg-white"
              }`}
            >
              <span className="mr-2 font-medium">{o.key}.</span>
              <MathText text={o.text} />
            </button>
          ))}
        </div>
      </div>

      <div className="flex justify-between gap-2">
        <button className="btn-secondary" disabled={state.current === 0} onClick={() => go(state.current - 1)}>
          Previous
        </button>
        {state.current < questions.length - 1 ? (
          <button className="btn" onClick={() => go(state.current + 1)}>
            Next
          </button>
        ) : (
          <button
            className="btn"
            disabled={pending}
            onClick={() => {
              if (confirm(`Submit the test? ${questions.length - answeredCount} questions are unanswered.`)) submit(false);
            }}
          >
            {pending ? "Submitting..." : "Submit test"}
          </button>
        )}
      </div>
    </div>
  );
}
