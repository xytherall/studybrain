import type { MistakeReason } from "./types";

// Starting thresholds from the build plan; tune once real papers are logged.
export const SLOW_FACTOR = 2.5;
export const STRONG_TOPIC_ACCURACY = 0.7;
export const WEAK_TOPIC_ACCURACY = 0.5;
const MIN_HISTORY = 3;

export type AttemptForSuggestion = {
  answered: boolean;
  secondsSpent: number;
  // Position from the end of the test: 0 = last question.
  positionFromEnd: number;
  totalQuestions: number;
  // The student's usual seconds per question on this topic (or across the test when there is no history).
  typicalSeconds: number;
  // Earlier attempts on the same topic, not counting this test.
  topicHistory: { attempted: number; correct: number };
  // True when the test ended because the timer ran out.
  timeRanOut: boolean;
};

export function suggestReason(a: AttemptForSuggestion): MistakeReason {
  if (!a.answered) {
    const nearEnd = a.positionFromEnd < Math.max(1, Math.ceil(a.totalQuestions * 0.1));
    return a.timeRanOut && nearEnd ? "time_pressure" : "not_attempted";
  }

  if (a.typicalSeconds > 0 && a.secondsSpent > SLOW_FACTOR * a.typicalSeconds) {
    return "time_pressure";
  }

  const { attempted, correct } = a.topicHistory;
  if (attempted >= MIN_HISTORY) {
    const accuracy = correct / attempted;
    if (accuracy >= STRONG_TOPIC_ACCURACY && a.secondsSpent <= a.typicalSeconds) return "silly_error";
    if (accuracy < WEAK_TOPIC_ACCURACY) return "concept_gap";
  }

  return "concept_gap";
}

export function median(values: number[]): number {
  const v = values.filter((x) => x > 0).sort((a, b) => a - b);
  if (v.length === 0) return 0;
  const mid = Math.floor(v.length / 2);
  return v.length % 2 ? v[mid] : (v[mid - 1] + v[mid]) / 2;
}
