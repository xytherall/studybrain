import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

const STATUS_LABELS: Record<string, string> = {
  uploaded: "Uploaded",
  processing: "Reading with AI...",
  needs_review: "Needs review",
  done: "Ready",
  failed: "Failed",
};

export default async function Home() {
  const supabase = await createClient();
  const { data: profile } = await supabase.from("profiles").select("display_name, exam_id").maybeSingle();
  if (!profile?.exam_id) redirect("/onboarding");

  const [{ data: files }, { data: sessions }] = await Promise.all([
    supabase.from("source_files").select("id, file_name, status, error, created_at").order("created_at", { ascending: false }),
    supabase
      .from("test_sessions")
      .select("id, started_at, finished_at, score, max_score, source_files(file_name)")
      .order("started_at", { ascending: false })
      .limit(10),
  ]);

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Hi {profile.display_name ?? "there"}</h1>
        <Link href="/upload" className="btn">
          Upload a paper
        </Link>
      </div>

      <section className="space-y-3">
        <h2 className="font-semibold">Your papers</h2>
        {!files?.length && <p className="text-sm text-slate-600">No papers yet. Upload a PDF or a photo to get started.</p>}
        {files?.map((f) => (
          <Link key={f.id} href={`/papers/${f.id}`} className="card flex items-center justify-between">
            <div>
              <div className="font-medium">{f.file_name}</div>
              {f.status === "failed" && f.error && <div className="text-xs text-red-600">{f.error}</div>}
            </div>
            <span className="text-xs text-slate-500">{STATUS_LABELS[f.status] ?? f.status}</span>
          </Link>
        ))}
      </section>

      <section className="space-y-3">
        <h2 className="font-semibold">Recent tests</h2>
        {!sessions?.length && <p className="text-sm text-slate-600">No tests taken yet.</p>}
        {sessions?.map((s) => {
          const name = (s.source_files as unknown as { file_name: string } | null)?.file_name ?? "Practice";
          return (
            <Link
              key={s.id}
              href={s.finished_at ? `/test/${s.id}/results` : `/test/${s.id}`}
              className="card flex items-center justify-between"
            >
              <div className="font-medium">{name}</div>
              <span className="text-sm text-slate-600">
                {s.finished_at ? `${s.score} / ${s.max_score}` : "In progress"}
              </span>
            </Link>
          );
        })}
      </section>
    </div>
  );
}
