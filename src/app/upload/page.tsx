"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

const ACCEPTED = ["application/pdf", "image/jpeg", "image/png", "image/webp", "image/heic"];
const MAX_BYTES = 20 * 1024 * 1024;

async function sha256(file: File) {
  const digest = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export default function UploadPage() {
  const router = useRouter();
  const [supabase] = useState(createClient);
  const [exams, setExams] = useState<{ id: string; name: string }[]>([]);
  const [examId, setExamId] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    (async () => {
      const [{ data: examRows }, { data: profile }] = await Promise.all([
        supabase.from("exams").select("id, name").order("name"),
        supabase.from("profiles").select("exam_id").maybeSingle(),
      ]);
      setExams(examRows ?? []);
      setExamId(profile?.exam_id ?? examRows?.[0]?.id ?? "");
    })();
  }, [supabase]);

  async function upload(e: React.FormEvent) {
    e.preventDefault();
    if (!file) return;
    if (!ACCEPTED.includes(file.type)) return setStatus("Please choose a PDF or a photo (JPG, PNG, WEBP).");
    if (file.size > MAX_BYTES) return setStatus("That file is over 20 MB. Try splitting it into smaller PDFs.");

    setBusy(true);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return router.push("/login");

      setStatus("Checking the file...");
      const hash = await sha256(file);

      const { data: existing } = await supabase.from("source_files").select("id").eq("file_hash", hash).maybeSingle();
      if (existing) {
        setStatus("You've already uploaded this file. Opening it...");
        return router.push(`/papers/${existing.id}`);
      }

      setStatus("Uploading...");
      const ext = file.name.split(".").pop()?.toLowerCase() || "bin";
      const path = `${user.id}/${hash}.${ext}`;
      const { error: uploadError } = await supabase.storage.from("papers").upload(path, file, { upsert: true, contentType: file.type });
      if (uploadError) throw new Error(uploadError.message);

      const { data: row, error: insertError } = await supabase
        .from("source_files")
        .insert({ owner_id: user.id, exam_id: examId, file_name: file.name, mime_type: file.type, file_hash: hash, storage_path: path })
        .select("id")
        .single();
      if (insertError || !row) throw new Error(insertError?.message ?? "Could not save the file");

      setStatus("Reading the questions with AI. This can take a minute for long papers...");
      // Open the paper even if reading fails: it shows the stored error and a "Try reading again" button.
      await fetch("/api/extract", { method: "POST", body: JSON.stringify({ fileId: row.id }) }).catch(() => null);
      router.push(`/papers/${row.id}`);
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-md space-y-6">
      <h1 className="text-2xl font-bold">Upload a paper</h1>
      <form onSubmit={upload} className="space-y-4">
        <label className="block space-y-1 text-sm">
          <span>Exam</span>
          <select className="input" value={examId} onChange={(e) => setExamId(e.target.value)}>
            {exams.map((x) => (
              <option key={x.id} value={x.id}>
                {x.name}
              </option>
            ))}
          </select>
        </label>
        <label className="block space-y-1 text-sm">
          <span>PDF or photo of the paper</span>
          <input
            className="input"
            type="file"
            accept="application/pdf,image/*"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            required
          />
        </label>
        <button className="btn w-full" disabled={busy || !file || !examId}>
          {busy ? "Working..." : "Upload and read questions"}
        </button>
      </form>
      {status && <p className="text-sm text-slate-700">{status}</p>}
    </div>
  );
}
