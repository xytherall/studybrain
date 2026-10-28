import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Question, Topic } from "@/lib/types";
import { ReviewList } from "./ReviewList";
import { approveReady, rerunExtraction, startPaperTest } from "./actions";

export const maxDuration = 300;

export default async function PaperPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: file } = await supabase.from("source_files").select("*").eq("id", id).maybeSingle();
  if (!file) notFound();

  const [{ data: questions }, { data: topics }, { data: signed }] = await Promise.all([
    supabase
      .from("questions")
      .select("id, body, options, correct_option, topic_id, number_in_paper, page_number, marks, status")
      .eq("source_file_id", id)
      .order("number_in_paper"),
    supabase.from("topics").select("id, subject, chapter, topic").eq("exam_id", file.exam_id).order("subject").order("sort"),
    supabase.storage.from("papers").createSignedUrl(file.storage_path, 3600),
  ]);

  const all = (questions ?? []) as Question[];
  const approved = all.filter((q) => q.status === "approved").length;
  const drafts = all.filter((q) => q.status === "draft").length;

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <h1 className="text-2xl font-bold">{file.file_name}</h1>
        <p className="text-sm text-slate-600">
          {all.length} questions found · {approved} approved · {drafts} to review
        </p>
        {file.status === "failed" && <p className="text-sm text-red-600">{file.error}</p>}
        <div className="flex flex-wrap gap-2">
          {signed?.signedUrl && (
            <a href={signed.signedUrl} target="_blank" rel="noreferrer" className="btn-secondary">
              Open original
            </a>
          )}
          {drafts > 0 && (
            <form action={approveReady.bind(null, id)}>
              <button className="btn-secondary">Approve all with answer + topic</button>
            </form>
          )}
          {["failed", "uploaded", "processing"].includes(file.status) && (
            <form action={rerunExtraction.bind(null, id)}>
              <button className="btn-secondary">Try reading again</button>
            </form>
          )}
          {approved > 0 && (
            <form action={startPaperTest.bind(null, id)}>
              <button className="btn">Take this test ({approved} questions)</button>
            </form>
          )}
        </div>
      </div>

      {file.mime_type.startsWith("image/") && signed?.signedUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={signed.signedUrl} alt="Original paper" className="max-h-96 w-full rounded-lg border object-contain" />
      )}

      <ReviewList fileId={id} questions={all} topics={(topics ?? []) as Topic[]} />
    </div>
  );
}
