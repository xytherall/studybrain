import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export default async function Landing() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user) redirect("/home");

  return (
    <div className="space-y-6 py-10 text-center">
      <h1 className="text-3xl font-bold">Find out why you lose marks</h1>
      <p className="text-slate-600">
        Upload your test papers, log every mistake and why it happened, and see which topics cost you the most.
      </p>
      <Link href="/login?mode=signup" className="btn">
        Get started
      </Link>
    </div>
  );
}
