"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [supabase] = useState(createClient);
  const [mode, setMode] = useState<"login" | "signup">(searchParams.get("mode") === "signup" ? "signup" : "login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMessage(null);

    if (mode === "signup") {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
      });
      if (error) setMessage(error.message);
      else if (!data.session) setMessage(
          "Check your email for a link to confirm your account. No email? For testing you can turn off Confirm email in Supabase > Authentication > Sign In / Providers > Email.",
        );
      else router.push("/onboarding");
    } else {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) setMessage(error.message);
      else router.push("/home");
    }

    setBusy(false);
    router.refresh();
  }

  async function google() {
    await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    });
  }

  return (
    <div className="mx-auto max-w-sm space-y-6 py-6">
      <h1 className="text-2xl font-bold">{mode === "login" ? "Log in" : "Create your account"}</h1>

      <div className="flex gap-2">
        <button type="button" className={`${mode === "login" ? "btn" : "btn-secondary"} flex-1`} onClick={() => setMode("login")}>
          Log in
        </button>
        <button type="button" className={`${mode === "signup" ? "btn" : "btn-secondary"} flex-1`} onClick={() => setMode("signup")}>
          Sign up
        </button>
      </div>

      <button onClick={google} className="btn-secondary w-full">
        Continue with Google
      </button>

      <form onSubmit={submit} className="space-y-3">
        <input className="input" type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        <input
          className="input"
          type="password"
          placeholder="Password (at least 6 characters)"
          minLength={6}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
        <button className="btn w-full" disabled={busy}>
          {mode === "login" ? "Log in" : "Sign up"}
        </button>
      </form>

      {message && <p className="text-sm text-slate-700">{message}</p>}
    </div>
  );
}
