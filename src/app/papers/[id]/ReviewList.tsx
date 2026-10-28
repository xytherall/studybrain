"use client";

import { useState, useTransition } from "react";
import { MathText } from "@/components/MathText";
import type { Question, QuestionOption, Topic } from "@/lib/types";
import { saveQuestion } from "./actions";

export function ReviewList({ fileId, questions, topics }: { fileId: string; questions: Question[]; topics: Topic[] }) {
  const [filter, setFilter] = useState<"draft" | "all">(questions.some((q) => q.status === "draft") ? "draft" : "all");
  const shown = questions.filter((q) => filter === "all" || q.status === "draft");

  return (
    <div className="space-y-4">
      <div className="flex gap-2 text-sm">
        <button className={filter === "draft" ? "btn" : "btn-secondary"} onClick={() => setFilter("draft")}>
          To review
        </button>
        <button className={filter === "all" ? "btn" : "btn-secondary"} onClick={() => setFilter("all")}>
          All
        </button>
      </div>
      {shown.length === 0 && <p className="text-sm text-slate-600">Nothing left to review.</p>}
      {shown.map((q) => (
        <QuestionCard key={q.id} fileId={fileId} question={q} topics={topics} />
      ))}
    </div>
  );
}

function QuestionCard({ fileId, question, topics }: { fileId: string; question: Question; topics: Topic[] }) {
  const [editing, setEditing] = useState(false);
  const [body, setBody] = useState(question.body);
  const [options, setOptions] = useState<QuestionOption[]>(question.options);
  const [correct, setCorrect] = useState(question.correct_option);
  const [topicId, setTopicId] = useState(question.topic_id);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function save(status: Question["status"]) {
    setError(null);
    startTransition(async () => {
      try {
        await saveQuestion(fileId, question.id, { body, options, correct_option: correct, topic_id: topicId, status });
        setEditing(false);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not save");
      }
    });
  }

  const subjects = Array.from(new Set(topics.map((t) => t.subject)));

  return (
    <div className="card space-y-3">
      <div className="flex items-center justify-between text-xs text-slate-500">
        <span>
          Q{question.number_in_paper ?? "?"}
          {question.page_number ? ` · page ${question.page_number}` : ""}
        </span>
        <span className={question.status === "approved" ? "text-green-700" : question.status === "rejected" ? "text-red-600" : ""}>
          {question.status}
        </span>
      </div>

      {editing ? (
        <div className="space-y-2">
          <textarea className="input min-h-24" value={body} onChange={(e) => setBody(e.target.value)} />
          {options.map((o, i) => (
            <div key={i} className="flex items-center gap-2">
              <span className="w-6 text-sm font-medium">{o.key}</span>
              <input
                className="input"
                value={o.text}
                onChange={(e) => setOptions(options.map((x, j) => (j === i ? { ...x, text: e.target.value } : x)))}
              />
            </div>
          ))}
          <p className="text-xs text-slate-500">Write maths between $ signs, for example $v = u + at$.</p>
        </div>
      ) : (
        <div className="space-y-2">
          <MathText text={body} className="block" />
          <ul className="space-y-1 text-sm">
            {options.map((o) => (
              <li key={o.key} className={o.key === correct ? "font-semibold text-green-700" : ""}>
                {o.key}. <MathText text={o.text} />
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="grid gap-2 sm:grid-cols-2">
        <label className="space-y-1 text-xs">
          <span>Correct answer</span>
          <select className="input" value={correct ?? ""} onChange={(e) => setCorrect(e.target.value || null)}>
            <option value="">Not set</option>
            {options.map((o) => (
              <option key={o.key} value={o.key}>
                {o.key}
              </option>
            ))}
          </select>
        </label>
        <label className="space-y-1 text-xs">
          <span>Topic</span>
          <select className="input" value={topicId ?? ""} onChange={(e) => setTopicId(e.target.value || null)}>
            <option value="">Not set</option>
            {subjects.map((s) => (
              <optgroup key={s} label={s}>
                {topics
                  .filter((t) => t.subject === s)
                  .map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.chapter === t.topic ? t.topic : `${t.chapter}: ${t.topic}`}
                    </option>
                  ))}
              </optgroup>
            ))}
          </select>
        </label>
      </div>

      <div className="flex flex-wrap gap-2">
        <button className="btn" disabled={pending || !correct || !topicId} onClick={() => save("approved")}>
          Approve
        </button>
        <button className="btn-secondary" disabled={pending} onClick={() => setEditing(!editing)}>
          {editing ? "Done editing" : "Edit text"}
        </button>
        {editing && (
          <button className="btn-secondary" disabled={pending} onClick={() => save(question.status)}>
            Save
          </button>
        )}
        <button className="btn-secondary" disabled={pending} onClick={() => save("rejected")}>
          Reject
        </button>
      </div>
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}
