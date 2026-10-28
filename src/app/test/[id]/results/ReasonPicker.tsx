"use client";

import { useState, useTransition } from "react";
import { REASON_LABELS, type MistakeReason } from "@/lib/types";
import { setMistakeReason } from "../actions";

const REASONS = Object.keys(REASON_LABELS) as MistakeReason[];

export function ReasonPicker({
  sessionId,
  mistakeId,
  initial,
  suggested,
}: {
  sessionId: string;
  mistakeId: string;
  initial: MistakeReason | null;
  suggested: MistakeReason | null;
}) {
  const [reason, setReason] = useState(initial);
  const [pending, startTransition] = useTransition();

  function pick(r: MistakeReason) {
    setReason(r);
    startTransition(() => setMistakeReason(sessionId, mistakeId, r));
  }

  return (
    <div className="flex flex-wrap gap-2">
      {REASONS.map((r) => (
        <button
          key={r}
          disabled={pending}
          onClick={() => pick(r)}
          className={`rounded-full border px-3 py-1 text-xs ${
            reason === r ? "border-blue-600 bg-blue-600 text-white" : "border-slate-300 bg-white text-slate-700"
          }`}
        >
          {REASON_LABELS[r]}
          {r === suggested ? " (suggested)" : ""}
        </button>
      ))}
    </div>
  );
}
