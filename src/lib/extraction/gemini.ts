import "server-only";
import type { QuestionOption, Topic } from "@/lib/types";

export type ExtractedQuestion = {
  number: number | null;
  page: number | null;
  body: string;
  options: QuestionOption[];
  correct_option: string | null;
  topic_id: string | null;
  has_diagram: boolean;
};

const MODEL = process.env.GEMINI_MODEL || "gemini-3.8-flash";

const responseSchema = {
  type: "OBJECT",
  properties: {
    questions: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          number: { type: "INTEGER", nullable: true },
          page: { type: "INTEGER", nullable: true },
          body: { type: "STRING" },
          options: {
            type: "ARRAY",
            items: {
              type: "OBJECT",
              properties: { key: { type: "STRING" }, text: { type: "STRING" } },
              required: ["key", "text"],
            },
          },
          correct_option: { type: "STRING", nullable: true },
          topic_id: { type: "STRING", nullable: true },
          has_diagram: { type: "BOOLEAN" },
        },
        required: ["body", "options", "has_diagram"],
      },
    },
  },
  required: ["questions"],
};

function buildPrompt(topics: Topic[], firstPage: number) {
  const topicList = topics.map((t) => `${t.id} | ${t.subject} > ${t.chapter} > ${t.topic}`).join("\n");
  return `You are reading pages from a multiple-choice test paper. The first page you see is page ${firstPage} of the paper.

Extract every multiple-choice question exactly as written.
- body: the question text only. Write maths in LaTeX between $...$ (for example $\\frac{1}{2}mv^2$).
- options: each choice with its letter as key (A, B, C, D...). Use LaTeX for maths here too.
- correct_option: the key of the correct answer ONLY if the paper shows it (an answer key, a tick, or bold). Otherwise null. Never guess.
- topic_id: pick the single best topic id from the list below, or null if none fits.
- page: the page number in the paper where the question starts.
- has_diagram: true if the question depends on a figure, graph or circuit.
Skip instructions, headers, and questions cut off at the edge of the page that continue on a page you can't see.

Topics (id | subject > chapter > topic):
${topicList}`;
}

export async function extractQuestions(params: {
  data: Uint8Array;
  mimeType: string;
  topics: Topic[];
  firstPage: number;
}): Promise<ExtractedQuestion[]> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY is not set");

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
      body: JSON.stringify({
        contents: [
          {
            role: "user",
            parts: [
              { inline_data: { mime_type: params.mimeType, data: Buffer.from(params.data).toString("base64") } },
              { text: buildPrompt(params.topics, params.firstPage) },
            ],
          },
        ],
        generationConfig: {
          temperature: 0,
          responseMimeType: "application/json",
          responseSchema,
        },
      }),
    },
  );

  if (!res.ok) {
    throw new Error(`Gemini request failed (${res.status}): ${(await res.text()).slice(0, 500)}`);
  }

  const json = await res.json();
  const text: string | undefined = json?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error("Gemini returned no content");

  const parsed = JSON.parse(text) as { questions: ExtractedQuestion[] };
  const validTopics = new Set(params.topics.map((t) => t.id));

  return parsed.questions
    .filter((q) => q.body?.trim() && q.options?.length >= 2)
    .map((q) => ({
      ...q,
      topic_id: q.topic_id && validTopics.has(q.topic_id) ? q.topic_id : null,
      correct_option: q.correct_option && q.options.some((o) => o.key === q.correct_option) ? q.correct_option : null,
    }));
}
