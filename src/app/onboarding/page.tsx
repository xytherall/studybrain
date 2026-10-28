import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

async function saveProfile(formData: FormData) {
  "use server";
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const examDate = String(formData.get("exam_date") || "");
  await supabase
    .from("profiles")
    .update({
      display_name: String(formData.get("display_name") || "") || null,
      exam_id: String(formData.get("exam_id")),
      exam_date: examDate || null,
    })
    .eq("id", user.id);

  redirect("/home");
}

export default async function Onboarding() {
  const supabase = await createClient();
  const [{ data: exams }, { data: profile }] = await Promise.all([
    supabase.from("exams").select("id, name").order("name"),
    supabase.from("profiles").select("display_name, exam_id, exam_date").maybeSingle(),
  ]);

  return (
    <div className="mx-auto max-w-sm space-y-6">
      <h1 className="text-2xl font-bold">Which test are you preparing for?</h1>
      <form action={saveProfile} className="space-y-4">
        <label className="block space-y-1 text-sm">
          <span>Your name</span>
          <input name="display_name" className="input" defaultValue={profile?.display_name ?? ""} />
        </label>
        <label className="block space-y-1 text-sm">
          <span>Exam</span>
          <select name="exam_id" className="input" defaultValue={profile?.exam_id ?? exams?.[0]?.id} required>
            {exams?.map((e) => (
              <option key={e.id} value={e.id}>
                {e.name}
              </option>
            ))}
          </select>
        </label>
        <label className="block space-y-1 text-sm">
          <span>Exam date (optional)</span>
          <input name="exam_date" type="date" className="input" defaultValue={profile?.exam_date ?? ""} />
        </label>
        <button className="btn w-full">Save</button>
      </form>
    </div>
  );
}
