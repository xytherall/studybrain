export type MistakeReason = "concept_gap" | "silly_error" | "time_pressure" | "not_attempted";

export const REASON_LABELS: Record<MistakeReason, string> = {
  concept_gap: "Concept gap",
  silly_error: "Silly error",
  time_pressure: "Time pressure",
  not_attempted: "Didn't attempt",
};

export type QuestionOption = { key: string; text: string };

export type Topic = {
  id: string;
  subject: string;
  chapter: string;
  topic: string;
};

export type Question = {
  id: string;
  body: string;
  options: QuestionOption[];
  correct_option: string | null;
  topic_id: string | null;
  number_in_paper: number | null;
  page_number: number | null;
  marks: number;
  status: "draft" | "approved" | "rejected";
};
