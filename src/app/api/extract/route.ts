import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { runExtraction } from "@/lib/extraction/run";

export const maxDuration = 300;

export async function POST(request: Request) {
  const { fileId } = (await request.json()) as { fileId?: string };
  if (!fileId) return NextResponse.json({ error: "fileId is required" }, { status: 400 });

  // Checked as the logged-in user, so row-level security confirms they own the file.
  const supabase = await createClient();
  const { data: file } = await supabase.from("source_files").select("id").eq("id", fileId).maybeSingle();
  if (!file) return NextResponse.json({ error: "File not found" }, { status: 404 });

  try {
    const result = await runExtraction(file.id);
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Extraction failed" }, { status: 500 });
  }
}
