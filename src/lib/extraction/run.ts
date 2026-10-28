import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Topic } from "@/lib/types";
import { extractQuestions, type ExtractedQuestion } from "./gemini";
import { splitPdf } from "./pdf";

const EXTRACTOR_VERSION = "gemini-v1";

// Reads a file once with AI and turns it into draft questions for its owner.
// Results are cached by file hash, so the same file is never sent to AI twice.
export async function runExtraction(sourceFileId: string) {
  const admin = createAdminClient();

  const { data: file, error } = await admin.from("source_files").select("*").eq("id", sourceFileId).single();
  if (error || !file) throw new Error("File not found");

  await admin.from("source_files").update({ status: "processing", error: null }).eq("id", file.id);

  try {
    const { data: topics } = await admin
      .from("topics")
      .select("id, subject, chapter, topic")
      .eq("exam_id", file.exam_id)
      .order("subject")
      .order("sort");

    let questions: ExtractedQuestion[];
    let pageCount: number | null = null;

    const { data: cached } = await admin
      .from("extraction_cache")
      .select("result")
      .eq("file_hash", file.file_hash)
      .eq("extractor", EXTRACTOR_VERSION)
      .maybeSingle();

    if (cached) {
      ({ questions, pageCount } = cached.result as { questions: ExtractedQuestion[]; pageCount: number | null });
    } else {
      const { data: blob, error: dlError } = await admin.storage.from("papers").download(file.storage_path);
      if (dlError || !blob) throw new Error("Could not download the uploaded file");
      const bytes = new Uint8Array(await blob.arrayBuffer());

      questions = [];
      if (file.mime_type === "application/pdf") {
        const split = await splitPdf(bytes);
        pageCount = split.pageCount;
        for (const chunk of split.chunks) {
          questions.push(
            ...(await extractQuestions({
              data: chunk.bytes,
              mimeType: "application/pdf",
              topics: (topics ?? []) as Topic[],
              firstPage: chunk.firstPage,
            })),
          );
        }
      } else {
        pageCount = 1;
        questions = await extractQuestions({
          data: bytes,
          mimeType: file.mime_type,
          topics: (topics ?? []) as Topic[],
          firstPage: 1,
        });
      }

      await admin
        .from("extraction_cache")
        .upsert({ file_hash: file.file_hash, extractor: EXTRACTOR_VERSION, result: { questions, pageCount } });
    }

    // Re-running replaces earlier drafts but keeps anything already approved.
    await admin.from("questions").delete().eq("source_file_id", file.id).eq("status", "draft");

    if (questions.length > 0) {
      const { error: insertError } = await admin.from("questions").insert(
        questions.map((q, i) => ({
          owner_id: file.owner_id,
          exam_id: file.exam_id,
          source_file_id: file.id,
          topic_id: q.topic_id,
          number_in_paper: q.number ?? i + 1,
          page_number: q.page,
          body: q.body,
          options: q.options,
          correct_option: q.correct_option,
          status: "draft",
        })),
      );
      if (insertError) throw new Error(insertError.message);
    }

    await admin
      .from("source_files")
      .update({ status: questions.length > 0 ? "needs_review" : "failed", page_count: pageCount, error: questions.length > 0 ? null : "No questions found in this file" })
      .eq("id", file.id);

    return { count: questions.length };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    await admin.from("source_files").update({ status: "failed", error: message }).eq("id", file.id);
    throw e;
  }
}
